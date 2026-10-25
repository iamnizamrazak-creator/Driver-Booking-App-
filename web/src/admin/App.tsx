import { useEffect, useState } from 'react';
import { BRAND } from '../../../shared/types.ts';
import { getSocket } from '../common/api.ts';
import { Login } from '../common/Login.tsx';
import { useSession } from '../common/session.ts';
import { AsyncButton, BrandMark, Icon, Toaster } from '../common/ui.tsx';
import { BookingsPage } from './Bookings.tsx';
import { DriversPage } from './Drivers.tsx';
import { OverviewPage } from './Overview.tsx';
import { PayoutsPage } from './Payouts.tsx';
import { PricingPage } from './Pricing.tsx';

type Page = 'overview' | 'bookings' | 'drivers' | 'payouts' | 'pricing';

/** Bumps whenever a booking or driver changes anywhere, so pages refetch. */
function useLiveTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const socket = getSocket();
    const bump = () => setTick((t) => t + 1);
    socket.on('booking:update', bump);
    socket.on('driver:update', bump);
    socket.on('connect', bump);
    // Also tick every 30s so "waiting for X min" ages and attention flags appear.
    const t = setInterval(bump, 30_000);
    return () => {
      socket.off('booking:update', bump);
      socket.off('driver:update', bump);
      socket.off('connect', bump);
      clearInterval(t);
    };
  }, []);
  return tick;
}

export function App() {
  const session = useSession('admin');
  const { config, me, setMe } = session;
  if (session.loading) return null;
  if (!me) return <><Login app="admin" config={config!} onDone={setMe} /><Toaster /></>;
  return <Dashboard email={me.user.email} city={config!.city} onLogout={session.logout} />;
}

function Dashboard({ email, city, onLogout }: { email: string; city: string; onLogout: () => Promise<void> }) {
  const [page, setPage] = useState<Page>('overview');
  const tick = useLiveTick();
  const nav: [Page, string, string][] = [
    ['overview', 'Overview', 'grid'],
    ['bookings', 'Bookings', 'list'],
    ['drivers', 'Drivers', 'user'],
    ['payouts', 'Payouts', 'wallet'],
    ['pricing', 'Pricing', 'sliders'],
  ];
  return (
    <div className="ops">
      <aside className="ops-side">
        <div className="brand">
          <BrandMark /> {BRAND.name} Ops
        </div>
        <div className="kasavu" />
        {nav.map(([key, label, icon]) => (
          <button key={key} className={page === key ? 'on' : ''} onClick={() => setPage(key)}>
            <Icon name={icon} size={20} /> {label}
          </button>
        ))}
        <div className="foot stack">
          <div>
            {city} · {email}
          </div>
          <AsyncButton className="link" style={{ color: 'var(--gold-soft)' }} onClick={onLogout}>
            Sign out
          </AsyncButton>
        </div>
      </aside>
      <main className="ops-main">
        {page === 'overview' && <OverviewPage tick={tick} city={city} onOpen={setPage} />}
        {page === 'bookings' && <BookingsPage tick={tick} />}
        {page === 'drivers' && <DriversPage tick={tick} />}
        {page === 'payouts' && <PayoutsPage tick={tick} />}
        {page === 'pricing' && <PricingPage />}
      </main>
      <Toaster />
    </div>
  );
}
