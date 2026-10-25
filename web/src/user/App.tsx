import { useCallback, useEffect, useState } from 'react';
import type { PricingConfig } from '../../../shared/fare.ts';
import type { Booking, Car } from '../../../shared/types.ts';
import { api, getSocket } from '../common/api.ts';
import { Login } from '../common/Login.tsx';
import { useSession } from '../common/session.ts';
import { Icon, Toaster, toast } from '../common/ui.tsx';
import { BookScreen } from './Book.tsx';
import { CarsScreen } from './Cars.tsx';
import { ProfileScreen, ProfileSetup } from './Profile.tsx';
import { TripScreen } from './Trip.tsx';
import { TripsScreen } from './Trips.tsx';

type Tab = 'book' | 'trips' | 'cars' | 'profile';

export function App() {
  const session = useSession('user');
  const { config, me, setMe } = session;
  const [tab, setTab] = useState<Tab>('book');
  const [cars, setCars] = useState<Car[]>([]);
  const [pricing, setPricing] = useState<PricingConfig | null>(null);
  // The booking shown on the Book tab: active, or just finished (so the user can pay/rate).
  const [booking, setBooking] = useState<Booking | null>(null);

  const loadCars = useCallback(() => api<Car[]>('/cars').then(setCars), []);

  useEffect(() => {
    if (!me) return;
    loadCars();
    api<PricingConfig>('/pricing').then(setPricing);
    api<Booking | null>('/bookings/current').then(setBooking);

    const socket = getSocket();
    const onUpdate = (b: Booking) => {
      setBooking((cur) => {
        if (cur && cur.id === b.id) {
          if (cur.status === 'searching' && b.status === 'assigned') toast(`${b.driver?.name} accepted your booking`);
          if (b.status === 'arrived' && cur.status !== 'arrived') toast('Your driver has arrived');
          return b;
        }
        return cur ?? b;
      });
    };
    // Catch up after a reconnect (e.g. phone was locked).
    const onConnect = () => api<Booking | null>('/bookings/current').then((b) => b && setBooking(b));
    socket.on('booking:update', onUpdate);
    socket.on('connect', onConnect);
    return () => {
      socket.off('booking:update', onUpdate);
      socket.off('connect', onConnect);
    };
  }, [me, loadCars]);

  if (session.loading) return <div className="shell no-nav" />;
  if (!me) return <><Login app="user" config={config!} onDone={setMe} /><Toaster /></>;
  if (!me.user.phone) return <><ProfileSetup me={me} onDone={setMe} /><Toaster /></>;

  return (
    <div className="shell">
      {tab === 'book' &&
        (booking ? (
          <TripScreen booking={booking} pricing={pricing} config={config!} onUpdate={setBooking} onDone={() => setBooking(null)} />
        ) : (
          <BookScreen me={me} cars={cars} pricing={pricing} city={config!.city} onCarsChanged={loadCars} onBooked={setBooking} />
        ))}
      {tab === 'trips' && <TripsScreen />}
      {tab === 'cars' && <CarsScreen cars={cars} onChanged={loadCars} />}
      {tab === 'profile' && <ProfileScreen me={me} onSaved={setMe} onLogout={session.logout} />}

      <nav className="nav">
        {(
          [
            ['book', booking ? 'Trip' : 'Book', 'home'],
            ['trips', 'History', 'list'],
            ['cars', 'My cars', 'car'],
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
