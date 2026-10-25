import { useEffect, useState } from 'react';
import { estimateFare, formatINR, type PricingConfig } from '../../../shared/fare.ts';
import { api } from '../common/api.ts';
import { AsyncButton, Field, toast } from '../common/ui.tsx';

const FIELDS: [keyof PricingConfig, string, string?][] = [
  ['minHours', 'Minimum hours', 'Every booking bills at least this long'],
  ['baseFare', 'Base fare (₹)', 'Covers the minimum hours'],
  ['extraPerHour', 'Extra per hour (₹)'],
  ['billingBlockMinutes', 'Billing block (minutes)', 'Extra time rounds up to this'],
  ['nightCharge', 'Night charge (₹)', 'Flat, if any part of the trip is at night'],
  ['nightStartHour', 'Night starts (hour, IST)'],
  ['nightEndHour', 'Night ends (hour, IST)'],
  ['commissionPct', 'Platform commission (%)'],
  ['maxHours', 'Maximum hours per booking'],
];

// A daytime start (10:00 IST today) so the preview isn't skewed by the current time.
const DAY = (() => {
  const IST = 5.5 * 3_600_000;
  return Math.floor((Date.now() + IST) / 86_400_000) * 86_400_000 - IST + 10 * 3_600_000;
})();

export function PricingPage() {
  const [cfg, setCfg] = useState<PricingConfig | null>(null);
  useEffect(() => {
    api<PricingConfig>('/admin/pricing').then(setCfg);
  }, []);
  if (!cfg) return null;

  const valid = Object.values(cfg).every((v) => Number.isFinite(v));

  return (
    <>
      <div className="ops-head">
        <div>
          <h1>Pricing</h1>
          <p className="faint">Changes apply to new bookings. Existing bookings keep the fare they were quoted until the trip ends.</p>
        </div>
      </div>
      <div className="card">
        <div className="form-grid">
          {FIELDS.map(([key, label, hint]) => (
            <Field key={key} label={label} hint={hint}>
              <input
                className="input"
                inputMode="numeric"
                value={Number.isFinite(cfg[key]) ? cfg[key] : ''}
                onChange={(e) => setCfg({ ...cfg, [key]: e.target.value === '' ? NaN : Number(e.target.value) })}
              />
            </Field>
          ))}
        </div>
        <div style={{ marginTop: 16 }}>
          <AsyncButton
            className="btn"
            disabled={!valid}
            onClick={async () => {
              setCfg(await api<PricingConfig>('/admin/pricing', { method: 'PUT', body: cfg }));
              toast('Pricing saved');
            }}
          >
            Save pricing
          </AsyncButton>
        </div>
      </div>

      {valid && (
        <div className="section">
          <h2>Preview (daytime trip)</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Duration</th>
                  <th className="num">Customer pays</th>
                  <th className="num">Driver earns</th>
                  <th className="num">Platform fee</th>
                </tr>
              </thead>
              <tbody>
                {[cfg.minHours, 4, 6, 8, 12]
                  .filter((h, i, xs) => h <= cfg.maxHours && xs.indexOf(h) === i)
                  .map((h) => {
                    const f = estimateFare(cfg, h, DAY);
                    return (
                      <tr key={h}>
                        <td>{h} hrs</td>
                        <td className="num">{formatINR(f.total)}</td>
                        <td className="num">{formatINR(f.driverEarning)}</td>
                        <td className="num">{formatINR(f.commission)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
