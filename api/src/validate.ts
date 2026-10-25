import { HttpError } from './auth.ts';

// Tiny input helpers; throw 400s with a message the apps can show as-is.

export function str(body: Record<string, unknown>, key: string, opts: { max?: number; optional?: boolean; label?: string } = {}): string {
  const v = body[key];
  const label = opts.label ?? key;
  if (v == null || (typeof v === 'string' && v.trim() === '')) {
    if (opts.optional) return '';
    throw new HttpError(400, `${label} is required`);
  }
  if (typeof v !== 'string') throw new HttpError(400, `${label} must be text`);
  const s = v.trim();
  if (s.length > (opts.max ?? 200)) throw new HttpError(400, `${label} is too long`);
  return s;
}

export function num(body: Record<string, unknown>, key: string, opts: { min?: number; max?: number; optional?: boolean; label?: string } = {}): number | null {
  const v = body[key];
  const label = opts.label ?? key;
  if (v == null || v === '') {
    if (opts.optional) return null;
    throw new HttpError(400, `${label} is required`);
  }
  const n = Number(v);
  if (!Number.isFinite(n)) throw new HttpError(400, `${label} must be a number`);
  if (opts.min != null && n < opts.min) throw new HttpError(400, `${label} must be at least ${opts.min}`);
  if (opts.max != null && n > opts.max) throw new HttpError(400, `${label} must be at most ${opts.max}`);
  return n;
}

export function oneOf<T extends string>(body: Record<string, unknown>, key: string, values: readonly T[], label = key): T {
  const v = body[key];
  if (!values.includes(v as T)) throw new HttpError(400, `${label} must be one of ${values.join(', ')}`);
  return v as T;
}

/** Indian mobile: 10 digits starting 6-9, optional +91. Returns +91XXXXXXXXXX. */
export function phone(body: Record<string, unknown>, key = 'phone'): string {
  const digits = str(body, key, { label: 'Phone number' }).replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '');
  if (!/^[6-9]\d{9}$/.test(digits)) throw new HttpError(400, 'Enter a valid 10-digit mobile number');
  return '+91' + digits;
}

export function idParam(value: string | string[] | undefined): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(404, 'Not found');
  return n;
}
