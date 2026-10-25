import { useEffect, useRef, useState } from 'react';
import { BRAND, type AppName, type Me, type PublicConfig } from '../../../shared/types.ts';
import { api } from './api.ts';
import { KeralaScene } from './KeralaScene.tsx';
import { AsyncButton, BrandMark, Field, toastError } from './ui.tsx';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(opts: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }): void;
          renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
        };
      };
    };
  }
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(s);
  });
}

export { loadScript };

const COPY: Record<AppName, { title: string; sub: string; devHint: string }> = {
  user: { title: BRAND.name, sub: BRAND.tagline, devHint: 'e.g. anu@example.com' },
  driver: { title: `${BRAND.name} Partner`, sub: 'Drive with us. Earn on your own hours.', devHint: 'e.g. rajesh.driver@example.com' },
  admin: { title: `${BRAND.name} Ops`, sub: 'Operations dashboard', devHint: 'admin@example.com' },
};

export function Login({ app, config, onDone }: { app: AppName; config: PublicConfig; onDone: (me: Me) => void }) {
  const btnRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState(app === 'admin' ? 'admin@example.com' : '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const passwordLogin = app === 'admin' && config.adminPasswordLogin;
  const copy = COPY[app];

  useEffect(() => {
    if (!config.googleClientId) return;
    loadScript('https://accounts.google.com/gsi/client')
      .then(() => {
        window.google!.accounts.id.initialize({
          client_id: config.googleClientId!,
          callback: async ({ credential }) => {
            try {
              onDone(await api<Me>('/auth/google', { body: { credential } }));
            } catch (err) {
              toastError(err);
            }
          },
        });
        if (btnRef.current) {
          window.google!.accounts.id.renderButton(btnRef.current, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', width: 300 });
        }
      })
      .catch(toastError);
  }, [config.googleClientId, onDone]);

  return (
    <div className={app === 'admin' ? 'login admin-login' : 'login'}>
      <div className={`hero tall${app === 'driver' ? ' dusk' : ''}`}>
        <KeralaScene variant={app === 'driver' ? 'dusk' : 'dawn'} />
        <div className="hero-text">
          <div className="brand">
            <BrandMark /> {copy.title}
          </div>
        </div>
      </div>
      <div className="panel stack">
        <div>
          <h1>{app === 'user' ? 'Your car. Our driver.' : copy.title}</h1>
          <p className="tag-ml">{BRAND.taglineMl}</p>
          <p className="muted" style={{ marginTop: 8 }}>
            {app === 'user' ? `Hire a verified driver by the hour, anywhere in ${config.city}.` : copy.sub}
          </p>
        </div>

        {passwordLogin && (
          <form className="stack" onSubmit={(e) => e.preventDefault()}>
            <Field label="Email or username">
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" />
            </Field>
            <Field label="Password">
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
            <AsyncButton
              className="btn block lg"
              type="submit"
              disabled={!username || !password}
              onClick={async () => {
                try {
                  onDone(await api<Me>('/auth/password', { body: { username, password } }));
                } finally {
                  setPassword('');
                }
              }}
            >
              Sign in
            </AsyncButton>
          </form>
        )}

        {config.googleClientId && (
          <>
            {passwordLogin && <div className="faint center">or</div>}
            <div className="gsi" ref={btnRef} />
          </>
        )}

        {config.devLogin && !passwordLogin && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
            }}
          >
            {(config.googleClientId || passwordLogin) && <div className="faint center">or, for local testing</div>}
            <Field label="Dev login (no Google needed)" hint={`Development only. ${copy.devHint}`}>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={copy.devHint} autoComplete="off" />
            </Field>
            <AsyncButton className="btn block lg" type="submit" onClick={async () => onDone(await api<Me>('/auth/dev', { body: { email } }))}>
              Continue
            </AsyncButton>
          </form>
        )}

        {!config.googleClientId && !config.devLogin && !passwordLogin && <div className="banner">Sign-in is not configured. Set GOOGLE_CLIENT_ID on the server.</div>}

        <p className="faint center">By continuing you agree to our terms and privacy policy.</p>
      </div>
    </div>
  );
}
