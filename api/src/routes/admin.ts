// Operations dashboard: live overview, manual assignment, driver approval, pricing, payouts.
import { Router } from 'express';
import { DEFAULT_PRICING, type PricingConfig } from '../../../shared/fare.ts';
import { HttpError, requireAdmin, type DriverRow } from '../auth.ts';
import { assignDriver, bookingViews, cancelBooking, getPricing, setPricing } from '../bookings.ts';
import { config } from '../config.ts';
import { all, one, run } from '../db.ts';
import { emit } from '../realtime.ts';
import { idParam, num, oneOf, str } from '../validate.ts';
import { driverProfile } from './auth.ts';

export const adminRoutes = Router();
adminRoutes.use(requireAdmin);

const count = (sql: string, ...p: (string | number)[]) => one<{ n: number }>(sql, ...p)!.n;

adminRoutes.get('/overview', (_req, res) => {
  const IST = 5.5 * 3_600_000;
  const today = Math.floor((Date.now() + IST) / 86_400_000) * 86_400_000 - IST;
  res.json({
    searching: count("SELECT COUNT(*) AS n FROM bookings WHERE status = 'searching'"),
    needsAttention: count("SELECT COUNT(*) AS n FROM bookings WHERE status = 'searching' AND requested_at < ?", Date.now() - config.matching.attentionAfterMs),
    onTrip: count("SELECT COUNT(*) AS n FROM bookings WHERE status IN ('assigned','arrived','in_progress')"),
    awaitingPayment: count("SELECT COUNT(*) AS n FROM bookings WHERE status = 'completed'"),
    driversOnline: count("SELECT COUNT(*) AS n FROM drivers WHERE status = 'approved' AND online = 1"),
    driversPending: count("SELECT COUNT(*) AS n FROM drivers WHERE status = 'pending'"),
    tripsToday: count("SELECT COUNT(*) AS n FROM bookings WHERE status = 'paid' AND paid_at >= ?", today),
    revenueToday: one<{ s: number | null }>("SELECT SUM(fare_total) AS s FROM bookings WHERE status = 'paid' AND paid_at >= ?", today)!.s ?? 0,
    attentionAfterMs: config.matching.attentionAfterMs,
  });
});

adminRoutes.get('/bookings', (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const views = status === 'active'
    ? bookingViews("b.status IN ('searching','assigned','arrived','in_progress','completed')", [], 'admin', 200)
    : status
      ? bookingViews('b.status = ?', [status], 'admin', 200)
      : bookingViews('1 = 1', [], 'admin', 200);
  res.json(views);
});

adminRoutes.post('/bookings/:id/assign', (req, res) => {
  const driverId = num(req.body, 'driverId', { label: 'Driver' })!;
  const d = one<DriverRow>('SELECT * FROM drivers WHERE id = ?', driverId);
  if (!d || d.status !== 'approved') throw new HttpError(400, 'Driver is not approved');
  assignDriver(idParam(req.params.id), driverId, 'admin');
  res.json({ ok: true });
});

adminRoutes.post('/bookings/:id/cancel', (req, res) => {
  cancelBooking(idParam(req.params.id), str(req.body, 'reason', { optional: true, max: 200 }) || 'Cancelled by operations');
  res.json({ ok: true });
});

adminRoutes.get('/drivers', (_req, res) => {
  const rows = all<DriverRow & { email: string; balance: number | null; busy: number }>(
    `SELECT d.*, u.email,
       (SELECT SUM(amount) FROM driver_ledger l WHERE l.driver_id = d.id) AS balance,
       EXISTS (SELECT 1 FROM bookings b WHERE b.driver_id = d.id AND b.status IN ('assigned','arrived','in_progress')) AS busy
     FROM drivers d JOIN users u ON u.id = d.user_id
     ORDER BY CASE d.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, d.online DESC, d.id DESC`,
  );
  res.json(rows.map((d) => ({ ...driverProfile(d), email: d.email, balance: d.balance ?? 0, busy: !!d.busy, lat: d.lat, lng: d.lng })));
});

adminRoutes.post('/drivers/:id/status', (req, res) => {
  const id = idParam(req.params.id);
  const status = oneOf(req.body, 'status', ['approved', 'rejected', 'suspended'] as const);
  // Suspending also takes them offline.
  run('UPDATE drivers SET status = ?, online = CASE WHEN ? = ? THEN online ELSE 0 END WHERE id = ?', status, status, 'approved', id);
  const d = one<DriverRow>('SELECT * FROM drivers WHERE id = ?', id);
  if (!d) throw new HttpError(404, 'Driver not found');
  emit('admin', 'driver:update', driverProfile(d));
  emit(`driver:${d.id}`, 'profile:update', driverProfile(d));
  res.json(driverProfile(d));
});

adminRoutes.get('/pricing', (_req, res) => {
  res.json(getPricing());
});

adminRoutes.put('/pricing', (req, res) => {
  const b = req.body;
  const n = (key: keyof PricingConfig, min: number, max: number) => num(b, key, { min, max })!;
  const cfg: PricingConfig = {
    minHours: n('minHours', 1, 12),
    baseFare: n('baseFare', 0, 100_000),
    extraPerHour: n('extraPerHour', 0, 100_000),
    billingBlockMinutes: n('billingBlockMinutes', 1, 120),
    nightCharge: n('nightCharge', 0, 100_000),
    nightStartHour: n('nightStartHour', 0, 23),
    nightEndHour: n('nightEndHour', 0, 23),
    commissionPct: n('commissionPct', 0, 100),
    maxHours: n('maxHours', 1, 24),
  };
  if (cfg.maxHours < cfg.minHours) throw new HttpError(400, 'Max hours must be at least min hours');
  setPricing(cfg);
  res.json(cfg);
});

adminRoutes.get('/pricing/defaults', (_req, res) => {
  res.json(DEFAULT_PRICING);
});

adminRoutes.post('/payouts', (req, res) => {
  const driverId = num(req.body, 'driverId', { label: 'Driver' })!;
  const amount = num(req.body, 'amount', { min: 1, label: 'Amount' })!;
  const reference = str(req.body, 'reference', { max: 100, label: 'UPI / bank reference' });
  const balance = one<{ s: number | null }>('SELECT SUM(amount) AS s FROM driver_ledger WHERE driver_id = ?', driverId)!.s ?? 0;
  if (amount > balance) throw new HttpError(400, `Amount is more than the ₹${balance} owed`);
  run(
    "INSERT INTO driver_ledger (driver_id, kind, amount, note, created_at) VALUES (?, 'payout', ?, ?, ?)",
    driverId,
    -Math.round(amount),
    `Payout · ${reference}`,
    Date.now(),
  );
  res.json({ ok: true });
});

adminRoutes.get('/payouts', (_req, res) => {
  res.json(
    all(
      `SELECT l.id, l.driver_id AS driverId, d.name AS driverName, l.amount, l.note, l.created_at AS createdAt
       FROM driver_ledger l JOIN drivers d ON d.id = l.driver_id WHERE l.kind = 'payout' ORDER BY l.id DESC LIMIT 100`,
    ),
  );
});
