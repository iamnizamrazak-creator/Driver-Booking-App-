import { Router } from 'express';
import type { DriverProfile, DriverStatus, Me, PublicConfig } from '../../../shared/types.ts';
import {
  appFrom,
  checkLoginAllowed,
  clearLoginFailures,
  driverFor,
  endSession,
  HttpError,
  isAdmin,
  passwordAdminEmail,
  recordLoginFailure,
  requireUser,
  startSession,
  upsertUser,
  verifyGoogleCredential,
  type AuthedRequest,
  type DriverRow,
  type UserRow,
} from '../auth.ts';
import { driverRating } from '../bookings.ts';
import { verifyPassword } from '../password.ts';
import { config } from '../config.ts';
import { one, run } from '../db.ts';
import { phone, str } from '../validate.ts';

export const authRoutes = Router();

authRoutes.get('/config', (_req, res) => {
  const body: PublicConfig = {
    city: config.city,
    googleClientId: config.googleClientId,
    devLogin: config.devLogin,
    razorpayKeyId: config.razorpay.keyId,
    mockPayments: config.mockPayments,
    adminPasswordLogin: !!(config.adminUsername && config.adminPasswordHash),
  };
  res.json(body);
});

authRoutes.post('/auth/google', async (req, res) => {
  const app = appFrom(req.header('x-app'));
  const info = await verifyGoogleCredential(str(req.body, 'credential', { max: 4096 }));
  const user = upsertUser(info);
  if (app === 'admin' && !isAdmin(user)) throw new HttpError(403, `${user.email} is not an admin`);
  startSession(res, user.id, app);
  res.json(me(user));
});

authRoutes.post('/auth/password', (req, res) => {
  if (appFrom(req.header('x-app')) !== 'admin' || !config.adminUsername || !config.adminPasswordHash) {
    throw new HttpError(404, 'Not found');
  }
  const ip = req.ip ?? 'unknown';
  checkLoginAllowed(ip);
  const username = str(req.body, 'username', { max: 64, label: 'Username' }).toLowerCase();
  const password = str(req.body, 'password', { max: 200, label: 'Password' });
  // Always run the hash check, so a wrong username takes as long as a wrong password.
  const passwordOk = verifyPassword(password, config.adminPasswordHash);
  if (username !== config.adminUsername || !passwordOk) {
    recordLoginFailure(ip);
    throw new HttpError(401, 'Wrong username or password');
  }
  clearLoginFailures(ip);
  const user = upsertUser({ sub: null, email: passwordAdminEmail(username), name: username, picture: null });
  startSession(res, user.id, 'admin');
  res.json(me(user));
});

authRoutes.post('/auth/dev', (req, res) => {
  if (!config.devLogin) throw new HttpError(404, 'Not found');
  const app = appFrom(req.header('x-app'));
  const email = str(req.body, 'email', { label: 'Email' }).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email');
  const user = upsertUser({ sub: null, email, name: email.split('@')[0], picture: null });
  if (app === 'admin' && !isAdmin(user)) throw new HttpError(403, 'In dev login, admin emails start with admin@');
  startSession(res, user.id, app);
  res.json(me(user));
});

authRoutes.post('/auth/logout', (req, res) => {
  endSession(req, res, appFrom(req.header('x-app')));
  res.json({ ok: true });
});

authRoutes.get('/me', requireUser, (req, res) => {
  res.json(me((req as AuthedRequest).user));
});

authRoutes.patch('/me', requireUser, (req, res) => {
  const { user } = req as AuthedRequest;
  run('UPDATE users SET name = ?, phone = ? WHERE id = ?', str(req.body, 'name', { max: 80, label: 'Name' }), phone(req.body), user.id);
  res.json(me(one<UserRow>('SELECT * FROM users WHERE id = ?', user.id)!));
});

export function driverProfile(d: DriverRow): DriverProfile {
  const trips = one<{ n: number }>("SELECT COUNT(*) AS n FROM bookings WHERE driver_id = ? AND status = 'paid'", d.id)!.n;
  return {
    id: d.id,
    userId: d.user_id,
    name: d.name,
    phone: d.phone,
    licenceNo: d.licence_no,
    licenceExpiry: d.licence_expiry,
    experienceYears: d.experience_years,
    canManual: !!d.can_manual,
    canAutomatic: !!d.can_automatic,
    status: d.status as DriverStatus,
    online: !!d.online,
    rating: driverRating(d.id),
    tripsCount: trips,
  };
}

function me(user: UserRow): Me {
  const driver = driverFor(user.id);
  return {
    user: { id: user.id, email: user.email, name: user.name, phone: user.phone, avatarUrl: user.avatar_url },
    driver: driver ? driverProfile(driver) : null,
    isAdmin: isAdmin(user),
  };
}
