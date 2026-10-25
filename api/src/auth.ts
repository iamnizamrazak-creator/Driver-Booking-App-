import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import type { AppName } from '../../shared/types.ts';
import { config } from './config.ts';
import { one, run } from './db.ts';

const SESSION_DAYS = 60;
const APPS: AppName[] = ['user', 'driver', 'admin'];
const google = new OAuth2Client();

export interface UserRow {
  id: number;
  google_sub: string | null;
  email: string;
  name: string;
  phone: string | null;
  avatar_url: string | null;
  password_hash: string | null;
}

export interface DriverRow {
  id: number;
  user_id: number;
  name: string;
  phone: string;
  licence_no: string;
  licence_expiry: string;
  experience_years: number;
  can_manual: number;
  can_automatic: number;
  status: string;
  online: number;
  lat: number | null;
  lng: number | null;
}

// `any` params: route handlers declare different params shapes.
export interface AuthedRequest extends Request<any> {
  user: UserRow;
  appName: AppName;
}

// Each app keeps its own session cookie, so one person can be signed in to
// the customer app and the driver app on the same phone (and so you can test
// all three apps side by side in one browser).
export function appFrom(value: unknown): AppName {
  return APPS.includes(value as AppName) ? (value as AppName) : 'user';
}

function cookieName(app: AppName) {
  return `kd_${app}`;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// The users row for a password-login admin. An email username shares the row with
// that person's Google sign-in; a plain username gets a pseudo email that can't collide.
export function passwordAdminEmail(username: string) {
  return username.includes('@') ? username : `${username}@admin.local`;
}

export function isAdmin(user: UserRow) {
  const email = user.email.toLowerCase();
  return (
    config.adminEmails.includes(email) ||
    (!!config.adminUsername && email === passwordAdminEmail(config.adminUsername)) ||
    (config.devLoginAdmin && email.startsWith('admin@'))
  );
}

// Slows down password guessing: 10 failures per IP per 15 minutes.
const loginFailures = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_FAILURES = 10;
const LOGIN_WINDOW_MS = 15 * 60_000;

export function checkLoginAllowed(ip: string) {
  const entry = loginFailures.get(ip);
  if (entry && entry.resetAt > Date.now() && entry.count >= MAX_LOGIN_FAILURES) {
    throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.');
  }
}

export function recordLoginFailure(ip: string) {
  const now = Date.now();
  const entry = loginFailures.get(ip);
  if (!entry || entry.resetAt <= now) loginFailures.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  else entry.count++;
}

export function clearLoginFailures(ip: string) {
  loginFailures.delete(ip);
}

export async function verifyGoogleCredential(credential: string) {
  if (!config.googleClientId) throw new HttpError(400, 'Google login is not configured');
  const ticket = await google.verifyIdToken({ idToken: credential, audience: config.googleClientId });
  const p = ticket.getPayload();
  if (!p?.sub || !p.email || !p.email_verified) throw new HttpError(401, 'Google account email is not verified');
  return { sub: p.sub, email: p.email.toLowerCase(), name: p.name ?? p.email, picture: p.picture ?? null };
}

export function upsertUser(info: { sub: string | null; email: string; name: string; picture: string | null }): UserRow {
  const existing = one<UserRow>('SELECT * FROM users WHERE email = ?', info.email);
  if (existing) {
    run(
      'UPDATE users SET google_sub = COALESCE(?, google_sub), avatar_url = COALESCE(?, avatar_url) WHERE id = ?',
      info.sub,
      info.picture,
      existing.id,
    );
    return one<UserRow>('SELECT * FROM users WHERE id = ?', existing.id)!;
  }
  const r = run(
    'INSERT INTO users (google_sub, email, name, avatar_url, created_at) VALUES (?, ?, ?, ?, ?)',
    info.sub,
    info.email,
    info.name,
    info.picture,
    Date.now(),
  );
  return one<UserRow>('SELECT * FROM users WHERE id = ?', Number(r.lastInsertRowid))!;
}

export function startSession(res: Response, userId: number, app: AppName) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  const expires = now + SESSION_DAYS * 86_400_000;
  run('INSERT INTO sessions (token, user_id, app, created_at, expires_at) VALUES (?, ?, ?, ?, ?)', token, userId, app, now, expires);
  res.cookie(cookieName(app), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.https,
    expires: new Date(expires),
    path: '/',
  });
}

export function endSession(req: Request, res: Response, app: AppName) {
  const token = parseCookies(req.headers.cookie)[cookieName(app)];
  if (token) run('DELETE FROM sessions WHERE token = ?', token);
  res.clearCookie(cookieName(app), { path: '/' });
}

export function userFromCookies(cookieHeader: string | undefined, app: AppName): UserRow | undefined {
  const token = parseCookies(cookieHeader)[cookieName(app)];
  if (!token) return undefined;
  return one<UserRow>(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.app = ? AND s.expires_at > ?`,
    token,
    app,
    Date.now(),
  );
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  const app = appFrom(req.header('x-app'));
  const user = userFromCookies(req.headers.cookie, app);
  if (!user) return next(new HttpError(401, 'Please sign in'));
  (req as AuthedRequest).user = user;
  (req as AuthedRequest).appName = app;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireUser(req, res, (err?: unknown) => {
    if (err) return next(err);
    const r = req as AuthedRequest;
    if (r.appName !== 'admin' || !isAdmin(r.user)) return next(new HttpError(403, 'Admins only'));
    next();
  });
}

export function driverFor(userId: number) {
  return one<DriverRow>('SELECT * FROM drivers WHERE user_id = ?', userId);
}

export function requireApprovedDriver(req: Request, res: Response, next: NextFunction) {
  requireUser(req, res, (err?: unknown) => {
    if (err) return next(err);
    const driver = driverFor((req as AuthedRequest).user.id);
    if (!driver || driver.status !== 'approved') return next(new HttpError(403, 'Driver account is not approved yet'));
    (req as AuthedRequest & { driver: DriverRow }).driver = driver;
    next();
  });
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
