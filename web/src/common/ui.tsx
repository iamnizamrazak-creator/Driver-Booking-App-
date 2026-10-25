import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { formatINR, type FareBreakdown } from '../../../shared/fare.ts';

// ---------- toast ----------

type Toast = { id: number; text: string; error?: boolean };
let pushToast: (t: Toast) => void = () => {};
let toastId = 0;

export function toast(text: string, error = false) {
  pushToast({ id: ++toastId, text, error });
}

export function toastError(err: unknown) {
  toast(err instanceof Error ? err.message : 'Something went wrong', true);
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    pushToast = (t) => {
      setItems((xs) => [...xs, t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 4000);
    };
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast${t.error ? ' error' : ''}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ---------- buttons ----------

/** Button that shows a spinner and blocks double-taps while its async onClick runs. */
export function AsyncButton({
  onClick,
  children,
  className = 'btn',
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & { onClick: () => Promise<unknown> | void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      {...rest}
      className={className}
      disabled={busy || rest.disabled}
      onClick={async () => {
        setBusy(true);
        try {
          await onClick();
        } catch (err) {
          toastError(err);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy && <span className="spin" />}
      {children}
    </button>
  );
}

// ---------- layout bits ----------

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </label>
  );
}

export function BrandMark({ className = 'brand-mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="18" fill="#0f3d2e" />
      <path d="M8 46 h48" stroke="#c9a227" strokeWidth="3" />
      <path d="M8 51 h48" stroke="#e8cf7a" strokeWidth="1.2" />
      <path d="M14 36 Q14 31 19 30 L24 29 L29 23 Q30.5 22 33 22 L41 22 Q43 22 44.5 23.5 L49 29 Q53 30 53 35 L53 39 L14 39Z" fill="#fbf7ec" />
      <circle cx="23" cy="39" r="4.5" fill="#c9a227" />
      <circle cx="45" cy="39" r="4.5" fill="#c9a227" />
      <path d="M36 12 Q40 6 46 7 M36 12 Q33 6 27 7 M36 12 Q42 10 47 14" stroke="#e8cf7a" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Avatar({ name, url }: { name: string; url?: string | null }) {
  return <div className="avatar">{url ? <img src={url} alt="" referrerPolicy="no-referrer" /> : name.trim().charAt(0).toUpperCase()}</div>;
}

export function FareLines({ fare, hoursLabel }: { fare: FareBreakdown; hoursLabel?: string }) {
  const extraH = fare.billedMinutes / 60;
  return (
    <div className="fare-lines">
      <div className="row">
        <span>Base fare{hoursLabel ? ` · ${hoursLabel}` : ''}</span>
        <span>{formatINR(fare.baseFare)}</span>
      </div>
      {fare.extraFare > 0 && (
        <div className="row">
          <span>Extra time (billed {formatHours(extraH)} total)</span>
          <span>{formatINR(fare.extraFare)}</span>
        </div>
      )}
      {fare.nightCharge > 0 && (
        <div className="row">
          <span>Night charge</span>
          <span>{formatINR(fare.nightCharge)}</span>
        </div>
      )}
    </div>
  );
}

export function formatHours(h: number) {
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins ? `${whole}h ${mins}m` : `${whole} hr${whole === 1 ? '' : 's'}`;
}

export function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function formatWhen(ms: number) {
  return new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** Re-renders every `ms` so timers tick. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export const STATUS_LABEL: Record<string, string> = {
  searching: 'Finding driver',
  assigned: 'Driver on the way',
  arrived: 'Driver arrived',
  in_progress: 'Trip in progress',
  completed: 'Awaiting payment',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

export const STATUS_PILL: Record<string, string> = {
  searching: 'gold',
  assigned: 'blue',
  arrived: 'blue',
  in_progress: '',
  completed: 'gold',
  paid: 'grey',
  cancelled: 'red',
};

// ---------- icons (24px, stroke) ----------

const ICONS: Record<string, string> = {
  car: 'M5 17h14M6 17v2M18 17v2M4 13l2-5a2 2 0 0 1 2-1h8a2 2 0 0 1 2 1l2 5v4H4zM7.5 14h.01M16.5 14h.01',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  pin: 'M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  wallet: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14h.01',
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  nav: 'M3 11l18-8-8 18-2-8z',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  check: 'M5 12l5 5 9-10',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  locate: 'M12 2v3M12 19v3M2 12h3M19 12h3M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  rupee: 'M7 4h10M7 9h10M7 4c6 0 6 9 0 9l8 7',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
};

export function Icon({ name, size = 22 }: { name: keyof typeof ICONS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}
