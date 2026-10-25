import { useEffect, useState } from 'react';
import { formatINR } from '../../../shared/fare.ts';
import { api } from '../common/api.ts';
import { AsyncButton, formatWhen, toast } from '../common/ui.tsx';
import type { AdminDriver } from './Bookings.tsx';

interface Payout {
  id: number;
  driverId: number;
  driverName: string;
  amount: number;
  note: string;
  createdAt: number;
}

export function PayoutsPage({ tick }: { tick: number }) {
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [history, setHistory] = useState<Payout[]>([]);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    api<AdminDriver[]>('/admin/drivers').then((ds) => setDrivers(ds.filter((d) => d.balance > 0)));
    api<Payout[]>('/admin/payouts').then(setHistory);
  }, [tick, reload]);

  const totalOwed = drivers.reduce((s, d) => s + d.balance, 0);

  return (
    <>
      <div className="ops-head">
        <div>
          <h1>Payouts</h1>
          <p className="faint">Pay drivers by UPI / bank transfer, then record the reference here.</p>
        </div>
        <div className="tile" style={{ minWidth: 180 }}>
          <div className="k">Total owed</div>
          <div className="v">{formatINR(totalOwed)}</div>
        </div>
      </div>

      {drivers.length === 0 ? (
        <div className="card empty">Nothing owed right now.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Driver</th>
                <th className="num">Owed</th>
                <th>Record payout</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <PayoutRow key={d.id} driver={d} onDone={() => setReload((r) => r + 1)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section">
        <h2>History</h2>
        {history.length === 0 ? (
          <div className="card empty">No payouts recorded yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Driver</th>
                  <th>Reference</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {history.map((p) => (
                  <tr key={p.id}>
                    <td>{formatWhen(p.createdAt)}</td>
                    <td>{p.driverName}</td>
                    <td>{p.note.replace(/^Payout · /, '')}</td>
                    <td className="num">{formatINR(-p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function PayoutRow({ driver: d, onDone }: { driver: AdminDriver; onDone: () => void }) {
  const [amount, setAmount] = useState(String(d.balance));
  const [reference, setReference] = useState('');
  return (
    <tr>
      <td>
        <span className="strong">{d.name}</span>
        <div className="sub">{d.phone}</div>
      </td>
      <td className="num strong">{formatINR(d.balance)}</td>
      <td>
        <div className="row wrap" style={{ gap: 6 }}>
          <input className="input sm" style={{ width: 110 }} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" aria-label="Amount" />
          <input className="input sm" style={{ width: 200 }} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI / UTR reference" aria-label="Reference" />
          <AsyncButton
            className="btn sm"
            disabled={!reference.trim()}
            onClick={async () => {
              await api('/admin/payouts', { body: { driverId: d.id, amount: Number(amount), reference } });
              toast(`Recorded ${formatINR(Number(amount))} to ${d.name}`);
              onDone();
            }}
          >
            Mark paid
          </AsyncButton>
        </div>
      </td>
    </tr>
  );
}
