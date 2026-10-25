import { useEffect, useState } from 'react';
import { formatINR } from '../../../shared/fare.ts';
import { api } from '../common/api.ts';
import { AsyncButton, toast } from '../common/ui.tsx';
import type { AdminDriver } from './Bookings.tsx';

const STATUS_PILL: Record<string, string> = { pending: 'gold', approved: '', rejected: 'red', suspended: 'red' };

export function DriversPage({ tick }: { tick: number }) {
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    api<AdminDriver[]>('/admin/drivers').then(setDrivers);
  }, [tick, reload]);

  const setStatus = async (d: AdminDriver, status: 'approved' | 'rejected' | 'suspended') => {
    await api(`/admin/drivers/${d.id}/status`, { body: { status } });
    toast(`${d.name} is now ${status}`);
    setReload((r) => r + 1);
  };

  return (
    <>
      <div className="ops-head">
        <div>
          <h1>Drivers</h1>
          <p className="faint">Verify the licence in person (original + ID proof) before approving.</p>
        </div>
      </div>
      {drivers.length === 0 ? (
        <div className="card empty">No drivers yet. Share the driver app link: /driver/</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Driver</th>
                <th>Licence</th>
                <th>Drives</th>
                <th>Status</th>
                <th>Now</th>
                <th className="num">Rating</th>
                <th className="num">Trips</th>
                <th className="num">Owed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d.id}>
                  <td>
                    <span className="strong">{d.name}</span>
                    <div className="sub">
                      {d.phone} · {d.email}
                    </div>
                  </td>
                  <td>
                    {d.licenceNo}
                    <div className="sub">
                      valid till {d.licenceExpiry} · {d.experienceYears} yrs exp
                    </div>
                  </td>
                  <td>{[d.canManual && 'Manual', d.canAutomatic && 'Auto'].filter(Boolean).join(', ')}</td>
                  <td>
                    <span className={`pill ${STATUS_PILL[d.status]}`}>{d.status}</span>
                  </td>
                  <td>
                    {d.status === 'approved' ? (
                      <span className={`pill ${d.busy ? 'blue' : d.online ? '' : 'grey'}`}>
                        <span className="dot" />
                        {d.busy ? 'On trip' : d.online ? 'Online' : 'Offline'}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="num">{d.rating ? `★ ${d.rating}` : '—'}</td>
                  <td className="num">{d.tripsCount}</td>
                  <td className="num">{formatINR(d.balance)}</td>
                  <td>
                    <div className="actions">
                      {d.status !== 'approved' && (
                        <AsyncButton className="btn sm" onClick={() => setStatus(d, 'approved')}>
                          {d.status === 'suspended' ? 'Reinstate' : 'Approve'}
                        </AsyncButton>
                      )}
                      {d.status === 'pending' && (
                        <AsyncButton className="btn danger sm" onClick={() => setStatus(d, 'rejected')}>
                          Reject
                        </AsyncButton>
                      )}
                      {d.status === 'approved' && (
                        <AsyncButton
                          className="btn danger sm"
                          onClick={async () => {
                            if (confirm(`Suspend ${d.name}? They will be taken offline.`)) await setStatus(d, 'suspended');
                          }}
                        >
                          Suspend
                        </AsyncButton>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
