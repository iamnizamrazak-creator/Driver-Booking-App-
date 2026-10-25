import { useEffect, useState } from 'react';
import { formatINR } from '../../../shared/fare.ts';
import type { Booking } from '../../../shared/types.ts';
import { api } from '../common/api.ts';
import { AsyncButton, STATUS_LABEL, STATUS_PILL, formatWhen, toast } from '../common/ui.tsx';

export interface AdminDriver {
  id: number;
  name: string;
  phone: string;
  email: string;
  status: string;
  online: boolean;
  busy: boolean;
  canManual: boolean;
  canAutomatic: boolean;
  experienceYears: number;
  licenceNo: string;
  licenceExpiry: string;
  rating: number | null;
  tripsCount: number;
  balance: number;
}

const ATTENTION_MS = 3 * 60_000;

export function BookingsTable({ bookings, drivers, onChanged }: { bookings: Booking[]; drivers: AdminDriver[]; onChanged: () => void }) {
  if (bookings.length === 0) return <div className="card empty">No bookings here.</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Requested</th>
            <th>Customer</th>
            <th>Car</th>
            <th>Pickup</th>
            <th>Status</th>
            <th>Driver</th>
            <th className="num">Fare</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => {
            const late = b.status === 'searching' && Date.now() - b.requestedAt > ATTENTION_MS;
            return (
              <tr key={b.id} className={late ? 'attention' : ''}>
                <td className="strong">{b.id}</td>
                <td>
                  {formatWhen(b.requestedAt)}
                  <div className="sub">{b.hoursBooked} hrs booked</div>
                </td>
                <td>
                  {b.customer.name}
                  <div className="sub">{b.customer.phone}</div>
                </td>
                <td>
                  {b.car.make} {b.car.model}
                  <div className="sub">
                    {b.car.regNo} · {b.car.transmission}
                  </div>
                </td>
                <td style={{ maxWidth: 220 }}>
                  {b.pickupAddress}
                  {b.notes && <div className="sub">“{b.notes}”</div>}
                </td>
                <td>
                  <span className={`pill ${STATUS_PILL[b.status]}`}>{STATUS_LABEL[b.status]}</span>
                  {late && <div className="sub" style={{ color: '#8a6b10', fontWeight: 600 }}>Assign manually</div>}
                </td>
                <td>
                  {b.driver ? (
                    <>
                      {b.driver.name}
                      <div className="sub">{b.driver.phone}</div>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="num">
                  {formatINR(b.fare?.total ?? b.estimate.total)}
                  <div className="sub">{b.fare ? `fee ${formatINR(b.fare.commission)}` : 'estimate'}</div>
                </td>
                <td>
                  <div className="actions">
                    {b.status === 'searching' && <AssignControl booking={b} drivers={drivers} onDone={onChanged} />}
                    {['searching', 'assigned', 'arrived'].includes(b.status) && (
                      <AsyncButton
                        className="btn danger sm"
                        onClick={async () => {
                          const reason = prompt('Reason for cancelling?', 'Cancelled by operations');
                          if (reason === null) return;
                          await api(`/admin/bookings/${b.id}/cancel`, { body: { reason } });
                          toast(`Booking #${b.id} cancelled`);
                          onChanged();
                        }}
                      >
                        Cancel
                      </AsyncButton>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AssignControl({ booking, drivers, onDone }: { booking: Booking; drivers: AdminDriver[]; onDone: () => void }) {
  const [driverId, setDriverId] = useState('');
  const manual = booking.car.transmission === 'manual';
  const free = drivers.filter((d) => d.status === 'approved' && !d.busy && (manual ? d.canManual : d.canAutomatic));
  return (
    <div className="row" style={{ gap: 6 }}>
      <select className="select sm" value={driverId} onChange={(e) => setDriverId(e.target.value)} aria-label="Driver to assign">
        <option value="">Assign driver…</option>
        {free.map((d) => (
          <option key={d.id} value={d.id}>
            {d.online ? '● ' : '○ '}
            {d.name} · {d.phone}
          </option>
        ))}
      </select>
      <AsyncButton
        className="btn sm"
        disabled={!driverId}
        onClick={async () => {
          await api(`/admin/bookings/${booking.id}/assign`, { body: { driverId: Number(driverId) } });
          toast(`Assigned booking #${booking.id}`);
          onDone();
        }}
      >
        Assign
      </AsyncButton>
    </div>
  );
}

const FILTERS: [string, string][] = [
  ['active', 'Active'],
  ['searching', 'Searching'],
  ['completed', 'Unpaid'],
  ['paid', 'Paid'],
  ['cancelled', 'Cancelled'],
  ['', 'All'],
];

export function BookingsPage({ tick }: { tick: number }) {
  const [filter, setFilter] = useState('active');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    api<Booking[]>(`/admin/bookings?status=${filter}`).then(setBookings);
    api<AdminDriver[]>('/admin/drivers').then(setDrivers);
  }, [filter, tick, reload]);

  return (
    <>
      <div className="ops-head">
        <h1>Bookings</h1>
      </div>
      <div className="tabs">
        {FILTERS.map(([value, label]) => (
          <button key={value} className={filter === value ? 'on' : ''} onClick={() => setFilter(value)}>
            {label}
          </button>
        ))}
      </div>
      <BookingsTable bookings={bookings} drivers={drivers} onChanged={() => setReload((r) => r + 1)} />
    </>
  );
}
