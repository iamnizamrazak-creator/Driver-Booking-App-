import { useState } from 'react';
import { finalFare, formatINR, type PricingConfig } from '../../../shared/fare.ts';
import { BRAND, type Booking, type PublicConfig } from '../../../shared/types.ts';
import { api } from '../common/api.ts';
import { KeralaScene } from '../common/KeralaScene.tsx';
import { loadScript } from '../common/Login.tsx';
import { AsyncButton, Avatar, FareLines, Icon, STATUS_LABEL, formatDuration, formatHours, toast, useNow } from '../common/ui.tsx';

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open(): void; on(e: string, cb: (r: unknown) => void): void };
  }
}

function formatWaiting(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)} min`;
}

const STEP_INDEX: Record<string, number> = { searching: 0, assigned: 1, arrived: 2, in_progress: 3, completed: 4, paid: 5 };

export function TripScreen({
  booking: b,
  pricing,
  config,
  onUpdate,
  onDone,
}: {
  booking: Booking;
  pricing: PricingConfig | null;
  config: PublicConfig;
  onUpdate: (b: Booking) => void;
  onDone: () => void;
}) {
  const now = useNow();
  const step = STEP_INDEX[b.status] ?? 0;

  const cancel = async () => {
    if (!confirm('Cancel this booking?')) return;
    onUpdate(await api<Booking>(`/bookings/${b.id}/cancel`, { method: 'POST' }));
  };

  const pay = async () => {
    const order = await api<{ mock: boolean; orderId?: string; amount: number; currency?: string; keyId?: string }>(`/bookings/${b.id}/pay`, {
      method: 'POST',
    });
    if (order.mock) {
      if (!confirm(`Development mode: simulate a successful payment of ${formatINR(order.amount)}?`)) return;
      onUpdate(await api<Booking>(`/bookings/${b.id}/pay/mock`, { method: 'POST' }));
      return;
    }
    await loadScript('https://checkout.razorpay.com/v1/checkout.js');
    await new Promise<void>((resolve) => {
      const rzp = new window.Razorpay!({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: BRAND.name,
        description: `Driver for ${formatHours((b.fare?.billedMinutes ?? 0) / 60)} · Booking #${b.id}`,
        prefill: { name: b.customer.name, contact: b.customer.phone ?? '' },
        theme: { color: '#0f3d2e' },
        handler: async (resp: Record<string, string>) => {
          try {
            onUpdate(await api<Booking>(`/bookings/${b.id}/pay/verify`, { body: resp }));
            toast('Payment received. Thank you!');
          } catch (err) {
            toast(err instanceof Error ? err.message : 'Payment could not be verified', true);
          }
          resolve();
        },
        modal: { ondismiss: () => resolve() },
      });
      rzp.on('payment.failed', () => toast('Payment failed. You can try again.', true));
      rzp.open();
    });
  };

  return (
    <>
      <div className="hero" style={{ height: 190 }}>
        <KeralaScene />
        <div className="hero-text">
          <div className="sub">Booking #{b.id}</div>
          <h1>{STATUS_LABEL[b.status]}</h1>
          <div className="sub">
            {b.car.make} {b.car.model} · {b.car.regNo}
          </div>
        </div>
      </div>

      <div className="content lift">
        <div className="card">
          {b.status !== 'cancelled' && (
            <div className="steps" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <i key={i} className={i < step || (i === step && step > 0) ? 'on' : ''} />
              ))}
            </div>
          )}

          {b.status === 'searching' && (
            <div className="center stack">
              <div className="radar">
                <div className="core">
                  <Icon name="car" size={28} />
                </div>
              </div>
              <div>
                <div className="strong">Finding a trusted driver near you</div>
                <div className="faint">
                  Waiting {formatWaiting(now - b.requestedAt)} · {b.car.transmission === 'manual' ? 'Manual' : 'Automatic'} drivers
                </div>
              </div>
              <p className="faint">We'll let you know as soon as someone accepts. If it takes a while, our team will assign one for you.</p>
            </div>
          )}

          {b.driver && ['assigned', 'arrived', 'in_progress'].includes(b.status) && (
            <div className="row">
              <Avatar name={b.driver.name} url={b.driver.avatarUrl} />
              <div className="grow">
                <div className="strong" style={{ fontSize: 18 }}>
                  {b.driver.name}
                </div>
                <div className="faint">
                  {b.driver.rating ? `★ ${b.driver.rating} · ` : 'New driver · '}
                  {b.driver.experienceYears} yrs experience
                </div>
              </div>
              <a className="btn ghost sm" href={`tel:${b.driver.phone}`} aria-label="Call driver">
                <Icon name="phone" size={18} /> Call
              </a>
            </div>
          )}

          {b.otp && (
            <div className="otp" style={{ marginTop: 14 }}>
              <div className="small" style={{ opacity: 0.85 }}>
                Trip OTP
              </div>
              <div className="digits">
                {b.otp.split('').map((d, i) => (
                  <span key={i}>{d}</span>
                ))}
              </div>
              <div className="small" style={{ opacity: 0.85 }}>
                Share this with your driver only when you hand over the car keys.
              </div>
            </div>
          )}

          {b.status === 'in_progress' && b.startedAt && (
            <div className="center" style={{ marginTop: 16 }}>
              <div className="faint">Trip time</div>
              <div className="timer">{formatDuration(now - b.startedAt)}</div>
              {pricing && <div className="muted">Fare so far ≈ {formatINR(finalFare(pricing, b.startedAt, now).total)}</div>}
            </div>
          )}

          {b.status === 'completed' && b.fare && (
            <div className="stack">
              <div className="row between">
                <div>
                  <div className="faint">Amount due</div>
                  <div className="fare-total">{formatINR(b.fare.total)}</div>
                </div>
                <span className="pill">
                  <Icon name="clock" size={14} /> {formatHours(b.fare.billedMinutes / 60)} billed
                </span>
              </div>
              <FareLines fare={b.fare} />
              <AsyncButton className="btn gold block lg" onClick={pay}>
                Pay {formatINR(b.fare.total)}
              </AsyncButton>
              {config.mockPayments && <p className="faint center">Razorpay keys not set: payments are simulated.</p>}
            </div>
          )}

          {b.status === 'paid' && <RateDriver booking={b} onUpdate={onUpdate} onDone={onDone} />}

          {b.status === 'cancelled' && (
            <div className="center stack">
              <p className="strong">This booking was cancelled.</p>
              {b.cancelReason && <p className="faint">{b.cancelReason}</p>}
              <button className="btn block" onClick={onDone}>
                Book again
              </button>
            </div>
          )}
        </div>

        {['searching', 'assigned', 'arrived'].includes(b.status) && (
          <div className="card">
            <div className="list-item" style={{ paddingTop: 0 }}>
              <Icon name="pin" />
              <div className="grow small">{b.pickupAddress}</div>
            </div>
            <div className="list-item">
              <Icon name="clock" />
              <div className="grow small">
                {b.hoursBooked} hrs booked · est. {formatINR(b.estimate.total)}
              </div>
            </div>
            <AsyncButton className="btn danger block" style={{ marginTop: 10 }} onClick={cancel}>
              Cancel booking
            </AsyncButton>
          </div>
        )}
      </div>
    </>
  );
}

function RateDriver({ booking: b, onUpdate, onDone }: { booking: Booking; onUpdate: (b: Booking) => void; onDone: () => void }) {
  const [rating, setRating] = useState(b.rating ?? 0);
  return (
    <div className="center stack">
      <div className="radar" style={{ width: 84, height: 84 }}>
        <div className="core" style={{ width: 56, height: 56 }}>
          <Icon name="check" size={28} />
        </div>
      </div>
      <div>
        <div className="strong" style={{ fontSize: 20 }}>
          Paid {formatINR(b.fare?.total ?? 0)}
        </div>
        <div className="faint ml">നന്ദി! Thanks for riding with {BRAND.name}.</div>
      </div>
      {b.driver && (
        <>
          <div className="muted">How was {b.driver.name}?</div>
          <div className="stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={n <= rating ? 'on' : ''} onClick={() => setRating(n)} aria-label={`${n} stars`}>
                ★
              </button>
            ))}
          </div>
        </>
      )}
      <AsyncButton
        className="btn block lg"
        onClick={async () => {
          if (rating && rating !== b.rating) onUpdate(await api<Booking>(`/bookings/${b.id}/rate`, { body: { rating } }));
          onDone();
        }}
      >
        Done
      </AsyncButton>
    </div>
  );
}
