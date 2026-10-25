import { useState } from 'react';
import { estimateFare, formatINR, type PricingConfig } from '../../../shared/fare.ts';
import { BRAND, type Booking, type Car, type Me } from '../../../shared/types.ts';
import { api } from '../common/api.ts';
import { KeralaScene } from '../common/KeralaScene.tsx';
import { AsyncButton, BrandMark, FareLines, Field, Icon, Sheet, formatHours, toast } from '../common/ui.tsx';
import { CarForm } from './Cars.tsx';

const PRESETS = [2, 4, 6, 8, 12];

export function BookScreen({
  me,
  cars,
  pricing,
  city,
  onCarsChanged,
  onBooked,
}: {
  me: Me;
  cars: Car[];
  pricing: PricingConfig | null;
  city: string;
  onCarsChanged: () => Promise<unknown>;
  onBooked: (b: Booking) => void;
}) {
  const [carId, setCarId] = useState<number | null>(null);
  const [hours, setHours] = useState(4);
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [notes, setNotes] = useState('');
  const [addingCar, setAddingCar] = useState(false);

  const selectedCar = cars.find((c) => c.id === carId) ?? cars[0] ?? null;
  const min = pricing?.minHours ?? 2;
  const max = pricing?.maxHours ?? 12;
  const estimate = pricing ? estimateFare(pricing, hours) : null;
  const firstName = me.user.name.split(' ')[0];

  const locate = () => {
    if (!navigator.geolocation) return toast('Location is not available on this device', true);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        toast('Location attached. Add a landmark so the driver finds you easily.');
      },
      () => {
        setLocating(false);
        toast('Could not get your location. Please allow location access.', true);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <>
      <div className="hero">
        <KeralaScene />
        <div className="hero-text">
          <div className="hero-top">
            <div className="brand">
              <BrandMark /> {BRAND.name}
            </div>
          </div>
          <div style={{ marginTop: 18 }}>
            <div className="greet">നമസ്കാരം, {firstName}</div>
            <h1>Need a driver?</h1>
            <div className="sub">Verified drivers for your car in {city}</div>
          </div>
        </div>
      </div>

      <div className="content lift">
        <div className="card stack">
          <div>
            <div className="card-title">Your car</div>
            {cars.length === 0 ? (
              <button className="btn ghost block" onClick={() => setAddingCar(true)}>
                <Icon name="plus" /> Add your car to get started
              </button>
            ) : (
              <div className="chips">
                {cars.map((c) => (
                  <button key={c.id} className={`chip${selectedCar?.id === c.id ? ' on' : ''}`} onClick={() => setCarId(c.id)}>
                    <span className="t">
                      {c.make} {c.model}
                    </span>
                    <span className="s">
                      {c.regNo} · {c.transmission === 'manual' ? 'Manual' : 'Automatic'}
                    </span>
                  </button>
                ))}
                <button className="chip" onClick={() => setAddingCar(true)} aria-label="Add car">
                  <span className="t">
                    <Icon name="plus" size={18} />
                  </span>
                  <span className="s">Add</span>
                </button>
              </div>
            )}
          </div>

          <Field label="Pickup location">
            <div className="row">
              <input
                className="input grow"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="House name, street, landmark"
                autoComplete="street-address"
              />
              <button className={`btn ${coords ? 'gold' : 'ghost'}`} style={{ flex: 'none', width: 48, padding: 0 }} onClick={locate} aria-label="Use my location" title="Use my location">
                {locating ? <span className="spin" /> : <Icon name="locate" />}
              </button>
            </div>
            {coords && <div className="hint">📍 GPS location attached</div>}
          </Field>

          <div>
            <div className="card-title">How long do you need the driver?</div>
            <div className="row between">
              <div className="stepper">
                <button onClick={() => setHours((h) => Math.max(min, h - 1))} aria-label="Fewer hours">
                  −
                </button>
                <div className="val">
                  {hours} <small>hrs</small>
                </div>
                <button onClick={() => setHours((h) => Math.min(max, h + 1))} aria-label="More hours">
                  +
                </button>
              </div>
            </div>
            <div className="chips" style={{ marginTop: 10 }}>
              {PRESETS.filter((p) => p >= min && p <= max).map((p) => (
                <button key={p} className={`chip${hours === p ? ' on' : ''}`} onClick={() => setHours(p)}>
                  {p} hrs
                </button>
              ))}
            </div>
          </div>

          <Field label="Notes for the driver (optional)">
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Airport drop and back, wedding at Thrissur" />
          </Field>
        </div>

        {estimate && pricing && (
          <div className="card">
            <div className="row between">
              <div>
                <div className="card-title" style={{ marginBottom: 2 }}>
                  Estimated fare
                </div>
                <div className="fare-total">{formatINR(estimate.total)}</div>
              </div>
              <span className="pill gold">
                <Icon name="shield" size={14} /> Verified driver
              </span>
            </div>
            <div className="divider" />
            <FareLines fare={estimate} hoursLabel={`first ${formatHours(pricing.minHours)}`} />
            <p className="faint" style={{ marginTop: 8 }}>
              You pay for actual time used (min {pricing.minHours} hrs), billed in {pricing.billingBlockMinutes}-minute blocks at {formatINR(pricing.extraPerHour)}/hr.
              Fuel, tolls and parking are on you.
            </p>
          </div>
        )}

        <div style={{ margin: '16px 0 8px' }}>
          <AsyncButton
            className="btn gold block lg"
            disabled={!selectedCar || !address.trim()}
            onClick={async () => {
              const b = await api<Booking>('/bookings', {
                body: { carId: selectedCar!.id, hours, pickupAddress: address, notes, lat: coords?.lat, lng: coords?.lng },
              });
              onBooked(b);
            }}
          >
            Book driver now
          </AsyncButton>
          {!address.trim() && selectedCar && <p className="faint center" style={{ marginTop: 8 }}>Enter your pickup location to continue</p>}
        </div>
      </div>

      {addingCar && (
        <Sheet title="Add your car" onClose={() => setAddingCar(false)}>
          <CarForm
            onSaved={async (id) => {
              await onCarsChanged();
              setCarId(id);
              setAddingCar(false);
            }}
          />
        </Sheet>
      )}
    </>
  );
}
