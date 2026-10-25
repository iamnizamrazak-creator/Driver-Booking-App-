import { useState } from 'react';
import type { Me } from '../../../shared/types.ts';
import { api } from '../common/api.ts';
import { KeralaScene } from '../common/KeralaScene.tsx';
import { AsyncButton, Field, toast } from '../common/ui.tsx';

export function RegisterForm({ me, onDone, editing = false }: { me: Me; onDone: () => void; editing?: boolean }) {
  const d = me.driver;
  const [name, setName] = useState(d?.name ?? me.user.name);
  const [phone, setPhone] = useState((d?.phone ?? me.user.phone ?? '').replace(/^\+91/, ''));
  const [licenceNo, setLicenceNo] = useState(d?.licenceNo ?? '');
  const [licenceExpiry, setLicenceExpiry] = useState(d?.licenceExpiry ?? '');
  const [experienceYears, setExperience] = useState(String(d?.experienceYears ?? ''));
  const [canManual, setCanManual] = useState(d?.canManual ?? true);
  const [canAutomatic, setCanAutomatic] = useState(d?.canAutomatic ?? false);

  return (
    <>
      <div className="hero dusk" style={{ height: editing ? 170 : 210 }}>
        <KeralaScene variant="dusk" />
        <div className="hero-text">
          <div className="greet">{editing ? 'Partner profile' : 'Drive with KeraDrive'}</div>
          <h1>{editing ? d?.name : 'Become a partner driver'}</h1>
          {!editing && <div className="sub">Flexible hours. Weekly payouts.</div>}
        </div>
      </div>
      <div className="content lift">
        <div className="card stack">
          {d?.status === 'rejected' && <div className="banner">Your application was not approved. Update your details and resubmit.</div>}
          {editing && d && (
            <div className="row between small">
              <span className="muted">
                {d.rating ? `★ ${d.rating}` : 'No ratings yet'} · {d.tripsCount} trips
              </span>
              <span className="pill">Approved</span>
            </div>
          )}
          <Field label="Full name (as on licence)">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Mobile number">
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="98xxxxxxxx" />
          </Field>
          <div className="grid-2">
            <Field label="Licence number">
              <input className="input" value={licenceNo} onChange={(e) => setLicenceNo(e.target.value.toUpperCase())} placeholder="KL07 20150012345" />
            </Field>
            <Field label="Valid till">
              <input className="input" type="date" value={licenceExpiry} onChange={(e) => setLicenceExpiry(e.target.value)} />
            </Field>
          </div>
          <Field label="Driving experience (years)">
            <input className="input" value={experienceYears} onChange={(e) => setExperience(e.target.value)} inputMode="numeric" />
          </Field>
          <div>
            <div className="card-title">I can drive</div>
            <div className="grid-2">
              <label className="check">
                <input type="checkbox" checked={canManual} onChange={(e) => setCanManual(e.target.checked)} /> Manual
              </label>
              <label className="check">
                <input type="checkbox" checked={canAutomatic} onChange={(e) => setCanAutomatic(e.target.checked)} /> Automatic
              </label>
            </div>
          </div>
          <AsyncButton
            className="btn gold block lg"
            onClick={async () => {
              await api('/driver/profile', {
                body: { name, phone, licenceNo, licenceExpiry, experienceYears, canManual, canAutomatic },
              });
              toast(editing ? 'Profile updated' : 'Application submitted');
              onDone();
            }}
          >
            {editing ? 'Save profile' : 'Submit application'}
          </AsyncButton>
        </div>
      </div>
    </>
  );
}
