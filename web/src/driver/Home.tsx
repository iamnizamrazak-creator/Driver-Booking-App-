import { useCallback, useEffect, useRef, useState } from 'react';
import { finalFare, formatINR, type PricingConfig } from '../../../shared/fare.ts';
import type { Booking, DriverProfile } from '../../../shared/types.ts';
import { api, getSocket } from '../common/api.ts';
import { KeralaScene } from '../common/KeralaScene.tsx';
import { AsyncButton, Avatar, FareLines, Icon, formatDuration, formatHours, toast, useNow } from '../common/ui.tsx';

const LOCATION_EVERY_MS = 30_000;

function chime() {
  try {
    const ctx = new AudioContext();
    [0, 0.18].forEach((t, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = i ? 988 : 784;
      g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.4);
    });
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    // Audio can be blocked until the user taps the page once; vibration still helps.
  }
}

function mapsLink(b: Booking) {
  const dest = b.pickupLat != null ? `${b.pickupLat},${b.pickupLng}` : encodeURIComponent(b.pickupAddress);
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

export function HomeScreen({ driver, onDriver }: { driver: DriverProfile; onDriver: (d: DriverProfile) => void }) {
  const [offers, setOffers] = useState<(Booking & { distanceKm?: number | null })[]>([]);
  const [trip, setTrip] = useState<Booking | null>(null);
  const [finished, setFinished] = useState<Booking | null>(null);
  const lastSent = useRef(0);

  const load = useCallback(async () => {
    const [current, open] = await Promise.all([api<Booking | null>('/driver/current'), api<Booking[]>('/driver/offers')]);
    setTrip(current);
    setOffers(open);
  }, []);

  useEffect(() => {
    load();
    const socket = getSocket();
    const onOffer = (b: Booking) => {
      setOffers((xs) => (xs.some((x) => x.id === b.id) ? xs : [b, ...xs]));
      chime();
    };
    const onGone = ({ bookingId }: { bookingId: number }) => setOffers((xs) => xs.filter((x) => x.id !== bookingId));
    const onUpdate = (b: Booking) => {
      setTrip((cur) => {
        if (b.driver?.id !== driver.id) {
          // Released, or cancelled by customer/ops.
          if (cur?.id === b.id) return null;
          return cur;
        }
        if (b.status === 'cancelled') {
          if (cur?.id === b.id) toast('The customer cancelled this booking', true);
          return cur?.id === b.id ? null : cur;
        }
        if (b.status === 'completed' || b.status === 'paid') {
          if (cur?.id === b.id) setFinished(b);
          return cur?.id === b.id ? null : cur;
        }
        return b;
      });
      setFinished((f) => (f && f.id === b.id ? b : f));
    };
    socket.on('offer:new', onOffer);
    socket.on('offer:gone', onGone);
    socket.on('booking:update', onUpdate);
    socket.on('connect', load);
    return () => {
      socket.off('offer:new', onOffer);
      socket.off('offer:gone', onGone);
      socket.off('booking:update', onUpdate);
      socket.off('connect', load);
    };
  }, [load, driver.id]);

  // While online, share location so we can match nearby bookings. (Only while the app is open: a PWA limit.)
  useEffect(() => {
    if (!driver.online || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        if (Date.now() - lastSent.current < LOCATION_EVERY_MS) return;
        lastSent.current = Date.now();
        api('/driver/location', { body: { lat: pos.coords.latitude, lng: pos.coords.longitude } }).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [driver.online]);

  const setOnline = async (online: boolean) => {
    let coords: GeolocationCoordinates | null = null;
    if (online && navigator.geolocation) {
      coords = await new Promise((resolve) =>
        navigator.geolocation.getCurrentPosition((p) => resolve(p.coords), () => resolve(null), { timeout: 8000 }),
      );
      if (!coords) toast('Location is off. You may get offers from farther away.');
    }
    onDriver(await api<DriverProfile>('/driver/status', { body: { online, lat: coords?.latitude, lng: coords?.longitude } }));
    if (online) load();
    else setOffers([]);
  };

  return (
    <>
      <div className="hero dusk" style={{ height: 220 }}>
        <KeralaScene variant="dusk" showCar={false} />
        <div className="hero-text">
          <div className="greet">നമസ്കാരം, {driver.name.split(' ')[0]}</div>
          <h1>{trip ? 'On a trip' : driver.online ? "You're online" : "You're offline"}</h1>
          <div style={{ marginTop: 14 }}>
            {!trip && (
              <div className="big-switch">
                <div>
                  <div className="strong">{driver.online ? 'Receiving bookings' : 'Go online to get bookings'}</div>
                  <div className="small" style={{ opacity: 0.85 }}>
                    {driver.canManual && 'Manual'}
                    {driver.canManual && driver.canAutomatic && ' · '}
                    {driver.canAutomatic && 'Automatic'}
                  </div>
                </div>
                <ToggleButton on={driver.online} onChange={setOnline} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="content" style={{ marginTop: 16 }}>
        {finished && <FinishedCard booking={finished} onClose={() => setFinished(null)} />}

        {trip && <TripCard trip={trip} onTrip={setTrip} onFinished={setFinished} />}

        {!trip && driver.online && (
          <div className="section" style={{ marginTop: 0 }}>
            <h2>New bookings</h2>
            {offers.length === 0 && (
              <div className="card empty">
                <div className="radar" style={{ width: 90, height: 90 }}>
                  <div className="core" style={{ width: 50, height: 50, background: '#2a1b3d' }}>
                    <Icon name="car" />
                  </div>
                </div>
                <p>Waiting for bookings near you. Keep this app open.</p>
              </div>
            )}
            {offers.map((o) => (
              <OfferCard key={o.id} offer={o} onAccepted={setTrip} onGone={() => setOffers((xs) => xs.filter((x) => x.id !== o.id))} />
            ))}
          </div>
        )}

        {!trip && !driver.online && !finished && (
          <div className="card stack">
            <div className="card-title">Before you go online</div>
            <ul className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              <li>Keep your driving licence with you.</li>
              <li>Walk around the car with the customer before starting.</li>
              <li>Never start the trip without the customer's OTP.</li>
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

function ToggleButton({ on, onChange }: { on: boolean; onChange: (v: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={`toggle${on ? ' on' : ''}`}
      role="switch"
      aria-checked={on}
      aria-label="Online"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onChange(!on);
        } catch (err) {
          toast(err instanceof Error ? err.message : 'Failed', true);
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

function OfferCard({ offer: o, onAccepted, onGone }: { offer: Booking & { distanceKm?: number | null }; onAccepted: (b: Booking) => void; onGone: () => void }) {
  return (
    <div className="card offer stack">
      <div className="row between">
        <div>
          <div className="faint">You earn (est.)</div>
          <div className="earn">{formatINR(o.estimate.driverEarning)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className="pill gold">{o.hoursBooked} hrs</span>
          {o.distanceKm != null && <div className="faint" style={{ marginTop: 4 }}>{o.distanceKm.toFixed(1)} km away</div>}
        </div>
      </div>
      <div className="list-item" style={{ padding: 0, border: 0 }}>
        <Icon name="pin" />
        <div className="grow small">{o.pickupAddress}</div>
      </div>
      <div className="list-item" style={{ padding: 0, border: 0 }}>
        <Icon name="car" />
        <div className="grow small">
          {o.car.make} {o.car.model} · <b>{o.car.transmission === 'manual' ? 'Manual' : 'Automatic'}</b> · {o.car.carType.toUpperCase()}
        </div>
      </div>
      {o.notes && <div className="banner blue">“{o.notes}”</div>}
      <div className="grid-2">
        <AsyncButton
          className="btn ghost"
          onClick={async () => {
            await api(`/driver/offers/${o.id}/decline`, { method: 'POST' });
            onGone();
          }}
        >
          Skip
        </AsyncButton>
        <AsyncButton
          className="btn gold"
          onClick={async () => {
            try {
              onAccepted(await api<Booking>(`/driver/bookings/${o.id}/accept`, { method: 'POST' }));
              toast('Booking accepted. Head to the pickup.');
            } catch (err) {
              onGone();
              throw err;
            }
          }}
        >
          Accept
        </AsyncButton>
      </div>
    </div>
  );
}

function TripCard({ trip: t, onTrip, onFinished }: { trip: Booking; onTrip: (b: Booking | null) => void; onFinished: (b: Booking) => void }) {
  const now = useNow();
  const [otp, setOtp] = useState('');
  const [pricing, setPricing] = useState<PricingConfig | null>(null);
  useEffect(() => {
    api<PricingConfig>('/pricing').then(setPricing);
  }, []);
  const stage = { assigned: 'Go to pickup', arrived: 'At pickup', in_progress: 'Trip running' }[t.status as string] ?? t.status;

  return (
    <div className="card stack">
      <div className="trip-stage">{stage}</div>
      <div className="row">
        <Avatar name={t.customer.name} />
        <div className="grow">
          <div className="strong" style={{ fontSize: 18 }}>
            {t.customer.name}
          </div>
          <div className="faint">
            {t.car.make} {t.car.model} · {t.car.regNo} · {t.car.transmission === 'manual' ? 'Manual' : 'Auto'}
          </div>
        </div>
        {t.customer.phone && (
          <a className="btn ghost sm" href={`tel:${t.customer.phone}`}>
            <Icon name="phone" size={18} /> Call
          </a>
        )}
      </div>
      <div className="list-item" style={{ padding: 0, border: 0 }}>
        <Icon name="pin" />
        <div className="grow small">{t.pickupAddress}</div>
      </div>
      {t.notes && <div className="banner blue">“{t.notes}”</div>}

      {t.status === 'assigned' && (
        <>
          <a className="btn ghost block" href={mapsLink(t)} target="_blank" rel="noreferrer">
            <Icon name="nav" size={18} /> Navigate to pickup
          </a>
          <AsyncButton className="btn gold block lg" onClick={async () => onTrip(await api<Booking>(`/driver/bookings/${t.id}/arrived`, { method: 'POST' }))}>
            I've arrived
          </AsyncButton>
        </>
      )}

      {(t.status === 'assigned' || t.status === 'arrived') && (
        <>
          {t.status === 'arrived' && (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
              }}
            >
              <div className="banner">Check the car with the customer, then ask for the 4-digit OTP shown in their app.</div>
              <input
                className="input otp-input"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric"
                placeholder="• • • •"
                aria-label="Customer OTP"
                autoComplete="one-time-code"
              />
              <AsyncButton
                type="submit"
                className="btn gold block lg"
                disabled={otp.length !== 4}
                onClick={async () => {
                  onTrip(await api<Booking>(`/driver/bookings/${t.id}/start`, { body: { otp } }));
                  toast('Trip started. Drive safe!');
                }}
              >
                Start trip
              </AsyncButton>
            </form>
          )}
          <button
            className="link small"
            style={{ alignSelf: 'center' }}
            onClick={async () => {
              if (!confirm('Release this booking? It will go to another driver.')) return;
              await api(`/driver/bookings/${t.id}/release`, { method: 'POST' });
              onTrip(null);
            }}
          >
            I can't make it, release booking
          </button>
        </>
      )}

      {t.status === 'in_progress' && t.startedAt && (
        <>
          <div className="center">
            <div className="faint">Trip time · booked {t.hoursBooked} hrs</div>
            <div className="timer">{formatDuration(now - t.startedAt)}</div>
            {/* Display only; the server computes the real fare when the trip ends. */}
            {pricing && <div className="muted small">You earn so far ≈ {formatINR(finalFare(pricing, t.startedAt, now).driverEarning)}</div>}
          </div>
          <AsyncButton
            className="btn block lg"
            onClick={async () => {
              if (!confirm('End the trip now? Make sure you have returned the car and keys.')) return;
              const done = await api<Booking>(`/driver/bookings/${t.id}/end`, { method: 'POST' });
              onTrip(null);
              onFinished(done);
            }}
          >
            End trip
          </AsyncButton>
        </>
      )}
    </div>
  );
}

function FinishedCard({ booking: b, onClose }: { booking: Booking; onClose: () => void }) {
  if (!b.fare) return null;
  return (
    <div className="card stack" style={{ marginBottom: 12 }}>
      <div className="trip-stage">Trip complete</div>
      <div className="row between">
        <div>
          <div className="faint">You earned</div>
          <div className="earn">{formatINR(b.fare.driverEarning)}</div>
        </div>
        <span className={`pill ${b.status === 'paid' ? '' : 'gold'}`}>{b.status === 'paid' ? 'Customer paid' : 'Awaiting payment'}</span>
      </div>
      <FareLines fare={b.fare} />
      <div className="faint">
        Customer pays {formatINR(b.fare.total)} for {formatHours(b.fare.billedMinutes / 60)} in the app. Platform fee {formatINR(b.fare.commission)}.
      </div>
      <button className="btn ghost block" onClick={onClose}>
        Back to bookings
      </button>
    </div>
  );
}
