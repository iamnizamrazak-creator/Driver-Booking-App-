import { useEffect, useState } from 'react';
import { formatINR } from '../../../shared/fare.ts';
import type { Booking } from '../../../shared/types.ts';
import { api } from '../common/api.ts';
import { Icon, formatWhen } from '../common/ui.tsx';

interface Earnings {
  balance: number;
  totalEarned: number;
  today: number;
  entries: { id: number; bookingId: number | null; kind: string; amount: number; note: string; createdAt: number }[];
  trips: Booking[];
}

export function EarningsScreen() {
  const [data, setData] = useState<Earnings | null>(null);
  useEffect(() => {
    api<Earnings>('/driver/earnings').then(setData);
  }, []);

  return (
    <div className="content" style={{ paddingTop: 'calc(20px + env(safe-area-inset-top))' }}>
      <h2 style={{ fontSize: 24 }}>Earnings</h2>
      <div className="kasavu" style={{ margin: '14px 0 16px' }} />
      {data && (
        <>
          <div className="card" style={{ background: '#2a1b3d', color: 'var(--cream)', borderColor: '#2a1b3d' }}>
            <div className="small" style={{ opacity: 0.8 }}>
              Payable to you
            </div>
            <div className="fare-total" style={{ color: 'var(--gold-soft)' }}>
              {formatINR(data.balance)}
            </div>
            <div className="small" style={{ opacity: 0.8, marginTop: 4 }}>
              Settled weekly to your bank / UPI
            </div>
          </div>
          <div className="grid-2" style={{ marginTop: 12 }}>
            <div className="card">
              <div className="faint">Today</div>
              <div className="strong" style={{ fontSize: 22 }}>
                {formatINR(data.today)}
              </div>
            </div>
            <div className="card" style={{ marginTop: 0 }}>
              <div className="faint">All time</div>
              <div className="strong" style={{ fontSize: 22 }}>
                {formatINR(data.totalEarned)}
              </div>
            </div>
          </div>
          <div className="section">
            <h2>Activity</h2>
            {data.entries.length === 0 ? (
              <div className="card empty">
                <Icon name="wallet" size={36} />
                <p>Earnings appear here after customers pay.</p>
              </div>
            ) : (
              <div className="card">
                {data.entries.map((e) => (
                  <div className="list-item" key={e.id}>
                    <div className="grow">
                      <div className="strong">{e.note}</div>
                      <div className="faint">{formatWhen(e.createdAt)}</div>
                    </div>
                    <div className="strong" style={{ color: e.amount < 0 ? 'var(--ink-2)' : 'var(--green-700)' }}>
                      {e.amount < 0 ? '−' : '+'}
                      {formatINR(Math.abs(e.amount))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
