import { useEffect, useState } from 'react';
import { formatINR } from '../../../shared/fare.ts';
import type { Booking } from '../../../shared/types.ts';
import { api } from '../common/api.ts';
import { KeralaScene } from '../common/KeralaScene.tsx';
import { BookingsTable, type AdminDriver } from './Bookings.tsx';

interface Overview {
  searching: number;
  needsAttention: number;
  onTrip: number;
  awaitingPayment: number;
  driversOnline: number;
  driversPending: number;
  tripsToday: number;
  revenueToday: number;
}

export function OverviewPage({ tick, city, onOpen }: { tick: number; city: string; onOpen: (p: 'drivers' | 'bookings') => void }) {
  const [o, setO] = useState<Overview | null>(null);
  const [active, setActive] = useState<Booking[]>([]);
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    api<Overview>('/admin/overview').then(setO);
    api<Booking[]>('/admin/bookings?status=active').then(setActive);
    api<AdminDriver[]>('/admin/drivers').then(setDrivers);
  }, [tick, reload]);

  return (
    <>
      <div className="ops-banner">
        <KeralaScene align="xMidYMid" />
        <div className="t">
          <div className="ml" style={{ fontSize: 14 }}>സുപ്രഭാതം</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{city} operations</div>
        </div>
      </div>
      {o && (
        <div className="tiles">
          <div className={`tile${o.needsAttention ? ' alert' : ''}`}>
            <div className="k">Needs a driver</div>
            <div className="v">{o.searching}</div>
            {o.needsAttention > 0 && <div className="small strong" style={{ color: '#8a6b10' }}>{o.needsAttention} waiting 3+ min</div>}
          </div>
          <div className="tile">
            <div className="k">On trip</div>
            <div className="v">{o.onTrip}</div>
          </div>
          <div className="tile">
            <div className="k">Awaiting payment</div>
            <div className="v">{o.awaitingPayment}</div>
          </div>
          <div className="tile">
            <div className="k">Drivers online</div>
            <div className="v">{o.driversOnline}</div>
          </div>
          <div className={`tile${o.driversPending ? ' alert' : ''}`} onClick={() => onOpen('drivers')} style={{ cursor: 'pointer' }}>
            <div className="k">Drivers to verify</div>
            <div className="v">{o.driversPending}</div>
          </div>
          <div className="tile">
            <div className="k">Trips today</div>
            <div className="v">{o.tripsToday}</div>
          </div>
          <div className="tile">
            <div className="k">Collected today</div>
            <div className="v">{formatINR(o.revenueToday)}</div>
          </div>
        </div>
      )}
      <div className="section">
        <div className="row between" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Live bookings</h2>
          <button className="link" onClick={() => onOpen('bookings')}>
            All bookings
          </button>
        </div>
        <BookingsTable bookings={active} drivers={drivers} onChanged={() => setReload((r) => r + 1)} />
      </div>
    </>
  );
}
