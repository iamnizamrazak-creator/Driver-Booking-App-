import { useState } from 'react';
import type { Car, CarType, Transmission } from '../../../shared/types.ts';
import { api } from '../common/api.ts';
import { AsyncButton, Field, Icon, Sheet } from '../common/ui.tsx';

const TYPES: { value: CarType; label: string }[] = [
  { value: 'hatchback', label: 'Hatchback' },
  { value: 'sedan', label: 'Sedan' },
  { value: 'suv', label: 'SUV' },
  { value: 'muv', label: 'MUV / 7-seater' },
  { value: 'luxury', label: 'Luxury' },
];

export function CarForm({ onSaved }: { onSaved: (id: number) => Promise<void> | void }) {
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [regNo, setRegNo] = useState('');
  const [transmission, setTransmission] = useState<Transmission>('manual');
  const [carType, setCarType] = useState<CarType>('hatchback');

  return (
    <div className="stack">
      <div className="grid-2">
        <Field label="Make">
          <input className="input" value={make} onChange={(e) => setMake(e.target.value)} placeholder="Maruti" />
        </Field>
        <Field label="Model">
          <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Swift" />
        </Field>
      </div>
      <Field label="Registration number">
        <input className="input" value={regNo} onChange={(e) => setRegNo(e.target.value.toUpperCase())} placeholder="KL 07 AB 1234" />
      </Field>
      <div>
        <div className="card-title">Transmission</div>
        <div className="grid-2">
          {(['manual', 'automatic'] as const).map((t) => (
            <button key={t} className={`chip${transmission === t ? ' on' : ''}`} onClick={() => setTransmission(t)}>
              <span className="t">{t === 'manual' ? 'Manual' : 'Automatic'}</span>
            </button>
          ))}
        </div>
      </div>
      <Field label="Car type">
        <select className="select" value={carType} onChange={(e) => setCarType(e.target.value as CarType)}>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <AsyncButton
        className="btn block lg"
        onClick={async () => {
          const { id } = await api<{ id: number }>('/cars', { body: { make, model, regNo, transmission, carType } });
          await onSaved(id);
        }}
      >
        Save car
      </AsyncButton>
    </div>
  );
}

export function CarsScreen({ cars, onChanged }: { cars: Car[]; onChanged: () => Promise<unknown> }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="content" style={{ paddingTop: 'calc(20px + env(safe-area-inset-top))' }}>
      <div className="row between" style={{ marginBottom: 6 }}>
        <h2 style={{ fontSize: 24 }}>My cars</h2>
        <button className="btn sm" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> Add
        </button>
      </div>
      <div className="kasavu" style={{ margin: '8px 0 16px' }} />
      {cars.length === 0 ? (
        <div className="card empty">
          <Icon name="car" size={36} />
          <p>Add the car you want driven. Drivers are matched by transmission.</p>
        </div>
      ) : (
        <div className="card">
          {cars.map((c) => (
            <div className="list-item" key={c.id}>
              <div className="avatar" style={{ width: 44, height: 44, fontSize: 16 }}>
                <Icon name="car" />
              </div>
              <div className="grow">
                <div className="strong">
                  {c.make} {c.model}
                </div>
                <div className="faint">
                  {c.regNo} · {c.transmission === 'manual' ? 'Manual' : 'Automatic'} · {c.carType.toUpperCase()}
                </div>
              </div>
              <AsyncButton
                className="btn ghost sm"
                aria-label={`Remove ${c.make} ${c.model}`}
                onClick={async () => {
                  if (!confirm(`Remove ${c.make} ${c.model}?`)) return;
                  await api(`/cars/${c.id}`, { method: 'DELETE' });
                  await onChanged();
                }}
              >
                <Icon name="trash" size={18} />
              </AsyncButton>
            </div>
          ))}
        </div>
      )}
      {adding && (
        <Sheet title="Add your car" onClose={() => setAdding(false)}>
          <CarForm
            onSaved={async () => {
              await onChanged();
              setAdding(false);
            }}
          />
        </Sheet>
      )}
    </div>
  );
}
