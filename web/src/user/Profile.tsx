import { useState } from 'react';
import type { Me } from '../../../shared/types.ts';
import { api } from '../common/api.ts';
import { KeralaScene } from '../common/KeralaScene.tsx';
import { AsyncButton, Avatar, Field, Icon, toast } from '../common/ui.tsx';

function ProfileForm({ me, onSaved, cta }: { me: Me; onSaved: (me: Me) => void; cta: string }) {
  const [name, setName] = useState(me.user.name);
  const [phone, setPhone] = useState(me.user.phone?.replace(/^\+91/, '') ?? '');
  return (
    <div className="stack">
      <Field label="Your name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </Field>
      <Field label="Mobile number" hint="Your driver will call this number.">
        <div className="row">
          <span className="input" style={{ width: 64, flex: 'none', display: 'grid', placeItems: 'center' }}>
            +91
          </span>
          <input className="input grow" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel-national" placeholder="98xxxxxxxx" />
        </div>
      </Field>
      <AsyncButton
        className="btn block lg"
        onClick={async () => {
          onSaved(await api<Me>('/me', { method: 'PATCH', body: { name, phone } }));
          toast('Saved');
        }}
      >
        {cta}
      </AsyncButton>
    </div>
  );
}

export function ProfileSetup({ me, onDone }: { me: Me; onDone: (me: Me) => void }) {
  return (
    <div className="shell no-nav">
      <div className="hero" style={{ height: 200 }}>
        <KeralaScene />
        <div className="hero-text">
          <div className="greet">സ്വാഗതം · Welcome</div>
          <h1>One last step</h1>
          <div className="sub">So your driver can reach you</div>
        </div>
      </div>
      <div className="content lift">
        <div className="card">
          <ProfileForm me={me} onSaved={onDone} cta="Continue" />
        </div>
      </div>
    </div>
  );
}

export function ProfileScreen({ me, onSaved, onLogout }: { me: Me; onSaved: (me: Me) => void; onLogout: () => Promise<void> }) {
  return (
    <div className="content" style={{ paddingTop: 'calc(20px + env(safe-area-inset-top))' }}>
      <div className="row">
        <Avatar name={me.user.name} url={me.user.avatarUrl} />
        <div className="grow">
          <h2 style={{ fontSize: 22 }}>{me.user.name}</h2>
          <div className="faint">{me.user.email}</div>
        </div>
      </div>
      <div className="kasavu" style={{ margin: '16px 0' }} />
      <div className="card">
        <ProfileForm me={me} onSaved={onSaved} cta="Save changes" />
      </div>
      <div className="card">
        <div className="card-title">Install the app</div>
        <p className="small muted">
          Android: tap ⋮ then <b>Install app</b>. iPhone: tap Share then <b>Add to Home Screen</b>.
        </p>
      </div>
      <AsyncButton className="btn danger block" style={{ marginTop: 16 }} onClick={onLogout}>
        <Icon name="logout" size={18} /> Sign out
      </AsyncButton>
    </div>
  );
}
