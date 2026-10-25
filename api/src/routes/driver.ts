// Driver app: registration, online status, offers, trip flow, earnings.
import { Router } from 'express';
import { driverFor, HttpError, requireApprovedDriver, requireUser, type AuthedRequest, type DriverRow } from '../auth.ts';
import {
  assignDriver,
  bookingRow,
  bookingViews,
  dispatch,
  endTrip,
  markArrived,
  openOffersFor,
  releaseBooking,
  startTrip,
} from '../bookings.ts';
import { all, one, run } from '../db.ts';
import { emit } from '../realtime.ts';
import { idParam, num, phone, str } from '../validate.ts';
import { driverProfile } from './auth.ts';

export const driverRoutes = Router();

type DriverRequest = AuthedRequest & { driver: DriverRow };

driverRoutes.post('/profile', requireUser, (req, res) => {
  const { user } = req as AuthedRequest;
  const b = req.body;
  const canManual = !!b.canManual;
  const canAutomatic = !!b.canAutomatic;
  if (!canManual && !canAutomatic) throw new HttpError(400, 'Select at least one transmission you can drive');
  const licenceExpiry = str(b, 'licenceExpiry', { label: 'Licence expiry' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(licenceExpiry) || new Date(licenceExpiry) < new Date()) {
    throw new HttpError(400, 'Licence must be valid (not expired)');
  }
  const values = [
    str(b, 'name', { max: 80, label: 'Name' }),
    phone(b),
    str(b, 'licenceNo', { max: 30, label: 'Licence number' }).toUpperCase(),
    licenceExpiry,
    num(b, 'experienceYears', { min: 0, max: 50, label: 'Experience' })!,
    canManual ? 1 : 0,
    canAutomatic ? 1 : 0,
  ] as const;

  const existing = driverFor(user.id);
  if (existing) {
    // Editing documents sends a rejected driver back to review; approved drivers keep their status.
    run(
      `UPDATE drivers SET name = ?, phone = ?, licence_no = ?, licence_expiry = ?, experience_years = ?, can_manual = ?, can_automatic = ?,
         status = CASE WHEN status = 'rejected' THEN 'pending' ELSE status END
       WHERE id = ?`,
      ...values,
      existing.id,
    );
  } else {
    run(
      `INSERT INTO drivers (user_id, name, phone, licence_no, licence_expiry, experience_years, can_manual, can_automatic, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id,
      ...values,
      Date.now(),
    );
  }
  const driver = driverFor(user.id)!;
  emit('admin', 'driver:update', driverProfile(driver));
  res.json(driverProfile(driver));
});

driverRoutes.use(requireApprovedDriver);

driverRoutes.post('/status', (req, res) => {
  const { driver } = req as DriverRequest;
  const online = !!req.body.online;
  const lat = num(req.body, 'lat', { min: -90, max: 90, optional: true });
  const lng = num(req.body, 'lng', { min: -180, max: 180, optional: true });
  run(
    'UPDATE drivers SET online = ?, lat = COALESCE(?, lat), lng = COALESCE(?, lng), location_at = CASE WHEN ? IS NULL THEN location_at ELSE ? END WHERE id = ?',
    online ? 1 : 0,
    lat,
    lng,
    lat,
    Date.now(),
    driver.id,
  );
  const updated = driverFor(driver.user_id)!;
  emit('admin', 'driver:update', driverProfile(updated));
  if (online) {
    // Offer anything already waiting nearby.
    for (const { id } of all<{ id: number }>("SELECT id FROM bookings WHERE status = 'searching'")) dispatch(id);
  }
  res.json(driverProfile(updated));
});

driverRoutes.post('/location', (req, res) => {
  const { driver } = req as DriverRequest;
  run(
    'UPDATE drivers SET lat = ?, lng = ?, location_at = ? WHERE id = ?',
    num(req.body, 'lat', { min: -90, max: 90 })!,
    num(req.body, 'lng', { min: -180, max: 180 })!,
    Date.now(),
    driver.id,
  );
  res.json({ ok: true });
});

driverRoutes.get('/offers', (req, res) => {
  res.json(openOffersFor((req as DriverRequest).driver.id));
});

driverRoutes.post('/offers/:id/decline', (req, res) => {
  run("UPDATE booking_offers SET status = 'declined' WHERE booking_id = ? AND driver_id = ?", idParam(req.params.id), (req as DriverRequest).driver.id);
  res.json({ ok: true });
});

driverRoutes.get('/current', (req, res) => {
  const [current] = bookingViews(
    "b.driver_id = ? AND b.status IN ('assigned','arrived','in_progress')",
    [(req as DriverRequest).driver.id],
    'driver',
    1,
  );
  res.json(current ?? null);
});

function ownTrip(req: DriverRequest) {
  const id = idParam(req.params.id);
  const b = bookingRow(id);
  if (!b) throw new HttpError(404, 'Booking not found');
  return id;
}

driverRoutes.post('/bookings/:id/accept', (req, res) => {
  const r = req as DriverRequest;
  const id = ownTrip(r);
  if (!one("SELECT 1 FROM booking_offers WHERE booking_id = ? AND driver_id = ? AND status = 'open'", id, r.driver.id)) {
    throw new HttpError(403, 'This booking was not offered to you');
  }
  assignDriver(id, r.driver.id, 'driver');
  res.json(bookingViews('b.id = ?', [id], 'driver', 1)[0]);
});

driverRoutes.post('/bookings/:id/arrived', (req, res) => {
  const r = req as DriverRequest;
  markArrived(ownTrip(r), r.driver.id);
  res.json(bookingViews('b.id = ?', [ownTrip(r)], 'driver', 1)[0]);
});

driverRoutes.post('/bookings/:id/start', (req, res) => {
  const r = req as DriverRequest;
  startTrip(ownTrip(r), r.driver.id, str(req.body, 'otp', { max: 6, label: 'OTP' }));
  res.json(bookingViews('b.id = ?', [ownTrip(r)], 'driver', 1)[0]);
});

driverRoutes.post('/bookings/:id/end', (req, res) => {
  const r = req as DriverRequest;
  endTrip(ownTrip(r), r.driver.id);
  res.json(bookingViews('b.id = ?', [ownTrip(r)], 'driver', 1)[0]);
});

driverRoutes.post('/bookings/:id/release', (req, res) => {
  const r = req as DriverRequest;
  releaseBooking(ownTrip(r), r.driver.id);
  res.json({ ok: true });
});

driverRoutes.get('/earnings', (req, res) => {
  const { driver } = req as DriverRequest;
  const sum = (where: string) =>
    one<{ s: number | null }>(`SELECT SUM(amount) AS s FROM driver_ledger WHERE driver_id = ? AND ${where}`, driver.id)!.s ?? 0;
  // Midnight in IST, regardless of the server's timezone.
  const IST = 5.5 * 3_600_000;
  const startOfToday = Math.floor((Date.now() + IST) / 86_400_000) * 86_400_000 - IST;
  res.json({
    balance: sum('1 = 1'),
    totalEarned: sum("kind = 'earning'"),
    today: sum(`kind = 'earning' AND created_at >= ${startOfToday}`),
    entries: all('SELECT id, booking_id AS bookingId, kind, amount, note, created_at AS createdAt FROM driver_ledger WHERE driver_id = ? ORDER BY id DESC LIMIT 50', driver.id),
    trips: bookingViews("b.driver_id = ? AND b.status IN ('completed','paid')", [driver.id], 'driver', 20),
  });
});
