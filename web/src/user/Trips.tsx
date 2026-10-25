import { useEffect, useState } from 'react';
import { formatINR } from '../../../shared/fare.ts';
import type { Booking } from '../../../shared/types.ts';
import { api } from '../common/api.ts';
import { Icon, STATUS_LABEL, STATUS_PILL, formatWhen } from '../common/ui.tsx';

export function TripsScreen() {
  const [items, setItems] = useState<Booking[] | null>(null);
  useEffect(() => {
    api<Booking[]>('/bookings').then(setItems);
  }, []);

  return (
    <div className="content" style={{ paddingTop: 'calc(20px + env(safe-area-inset-top))' }}>
      <h2 style={{ fontSize: 24 }}>Your trips</h2>
      <div className="kasavu" style={{ margin: '14px 0 16px' }} />
      {items && items.length === 0 && (
        <div className="card empty">
          <Icon name="list" size={36} />
          <p>No trips yet. Your bookings will show up here.</p>
        </div>
      )}
      {items && items.length > 0 && (
        <div className="card">
          {items.map((b) => (
            <div className="list-item" key={b.id}>
              <div className="grow">
                <div className="row between">
                  <span className="strong">
                    {b.car.make} {b.car.model}
                  </span>
                  <span className="strong">{formatINR(b.fare?.total ?? b.estimate.total)}</span>
                </div>
                <div className="row between" style={{ marginTop: 4 }}>
                  <span className="faint ellipsis">
                    {formatWhen(b.requestedAt)} · {b.driver?.name ?? 'No driver'}
                  </span>
                  <span className={`pill ${STATUS_PILL[b.status]}`}>{STATUS_LABEL[b.status]}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
