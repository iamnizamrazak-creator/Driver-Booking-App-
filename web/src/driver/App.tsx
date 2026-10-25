import { useEffect, useState } from 'react';
import type { DriverProfile } from '../../../shared/types.ts';
import { getSocket } from '../common/api.ts';
import { KeralaScene } from '../common/KeralaScene.tsx';
import { Login } from '../common/Login.tsx';
import { useSession } from '../common/session.ts';
import { AsyncButton, Icon, Toaster } from '../common/ui.tsx';
import { EarningsScreen } from './Earnings.tsx';
import { HomeScreen } from './Home.tsx';
import { RegisterForm } from './Register.tsx';

type Tab = 'home' | 'earnings' | 'profile';

export function App() {
  const session = useSession('driver');
  const { config, me, setMe, refresh } = session;
  const [tab, setTab] = useState<Tab>('home');

  // Approval / suspension from the ops dashboard arrives live.
  useEffect(() => {
    if (!me?.driver) return;
    const socket = getSocket();
    const onProfile = (driver: DriverProfile) => setMe((m) => (m ? { ...m, driver } : m));
    socket.on('profile:update', onProfile);
    return () => {
      socket.off('profile:update', onProfile);
    };
  }, [me?.driver?.id, setMe]);

  if (session.loading) return <div className="shell no-nav" />;
  if (!me) return <div className="driver-app"><Login app="driver" config={config!} onDone={setMe} /><Toaster /></div>;

  const driver = me.driver;
  if (!driver || driver.status === 'rejected') {
    return (
      <div className="driver-app shell no-nav">
        <RegisterForm me={me} onDone={() => refresh()} />
        <Toaster />
      </div>
    );
  }

  if (driver.status !== 'approved') {
    return (
      <div className="driver-app shell no-nav">
        <div className="hero tall dusk">
          <KeralaScene variant="dusk" />
          <div className="hero-text">
            <div className="greet">നമസ്കാരം, {driver.name.split(' ')[0]}</div>
            <h1>{driver.status === 'pending' ? 'Application received' : 'Account suspended'}</h1>
          </div>
        </div>
        <div className="content lift">
          <div className="card stack">
            {driver.status === 'pending' ? (
              <>
                <p>Thanks for applying. Our team will verify your licence and call you on {driver.phone} within 1–2 days.</p>
                <p className="faint">Keep your original driving licence and an ID proof ready for verification.</p>
              </>
            ) : (
              <p>Your account is suspended. Please contact KeraDrive support.</p>
            )}
            <AsyncButton className="btn ghost block" onClick={refresh}>
              Check status
            </AsyncButton>
            <AsyncButton className="btn danger block" onClick={session.logout}>
              Sign out
            </AsyncButton>
          </div>
        </div>
        <Toaster />
      </div>
    );
  }

  return (
    <div className="driver-app shell">
      {tab === 'home' && <HomeScreen driver={driver} onDriver={(d) => setMe({ ...me, driver: d })} />}
      {tab === 'earnings' && <EarningsScreen />}
      {tab === 'profile' && (
        <>
          <RegisterForm me={me} onDone={() => refresh()} editing />
          <div className="content">
            <AsyncButton className="btn danger block" style={{ marginTop: 12 }} onClick={session.logout}>
              <Icon name="logout" size={18} /> Sign out
            </AsyncButton>
          </div>
        </>
      )}
      <nav className="nav">
        {(
          [
            ['home', 'Home', 'home'],
            ['earnings', 'Earnings', 'wallet'],
            ['profile', 'Profile', 'user'],
          ] as const
        ).map(([key, label, icon]) => (
          <button key={key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>
            <Icon name={icon} />
            {label}
          </button>
        ))}
      </nav>
      <Toaster />
    </div>
  );
}
