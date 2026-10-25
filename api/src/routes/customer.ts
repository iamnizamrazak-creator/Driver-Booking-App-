// Customer app: cars, booking, cancel, pay, rate.
import { Router } from 'express';
import { estimateFare } from '../../../shared/fare.ts';
import { ACTIVE_STATUSES } from '../../../shared/types.ts';
import { HttpError, requireUser, type AuthedRequest } from '../auth.ts';
import {
  bookingRow,
  bookingView,
  bookingViews,
  broadcast,
  cancelBooking,
  dispatch,
  getPricing,
  markPaid,
  newOtp,
} from '../bookings.ts';
import { config } from '../config.ts';
import { all, one, run } from '../db.ts';
import { createOrder, verifyCheckoutSignature } from '../payments.ts';
import { idParam, num, oneOf, str } from '../validate.ts';

export const customerRoutes = Router();
customerRoutes.use(requireUser);

const ACTIVE = ACTIVE_STATUSES.map((s) => `'${s}'`).join(',');

function ownBooking(req: AuthedRequest) {
  const b = bookingRow(idParam(req.params.id));
  if (!b || b.user_id !== req.user.id) throw new HttpError(404, 'Booking not found');
  return b;
}

customerRoutes.get('/pricing', (_req, res) => {
  res.json(getPricing());
});

// ----- cars -----

customerRoutes.get('/cars', (req, res) => {
  const rows = all<{ id: number; make: string; model: string; reg_no: string; transmission: string; car_type: string }>(
    'SELECT * FROM cars WHERE user_id = ? AND deleted = 0 ORDER BY id',
    (req as AuthedRequest).user.id,
  );
  res.json(rows.map((c) => ({ id: c.id, make: c.make, model: c.model, regNo: c.reg_no, transmission: c.transmission, carType: c.car_type })));
});

customerRoutes.post('/cars', (req, res) => {
  const b = req.body;
  const r = run(
    'INSERT INTO cars (user_id, make, model, reg_no, transmission, car_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    (req as AuthedRequest).user.id,
    str(b, 'make', { max: 40, label: 'Make' }),
    str(b, 'model', { max: 40, label: 'Model' }),
    str(b, 'regNo', { max: 20, label: 'Registration number' }).toUpperCase().replace(/\s+/g, ' '),
    oneOf(b, 'transmission', ['manual', 'automatic'] as const, 'Transmission'),
    oneOf(b, 'carType', ['hatchback', 'sedan', 'suv', 'muv', 'luxury'] as const, 'Car type'),
    Date.now(),
  );
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

customerRoutes.delete('/cars/:id', (req, res) => {
  // Soft delete: past bookings still point at the car.
  run('UPDATE cars SET deleted = 1 WHERE id = ? AND user_id = ?', idParam(req.params.id), (req as AuthedRequest).user.id);
  res.json({ ok: true });
});

// ----- bookings -----

customerRoutes.post('/bookings', (req, res) => {
  const { user } = req as AuthedRequest;
  if (!user.phone) throw new HttpError(400, 'Add your phone number first so the driver can reach you');
  if (one(`SELECT 1 FROM bookings WHERE user_id = ? AND status IN (${ACTIVE})`, user.id)) {
    throw new HttpError(409, 'You already have an active booking');
  }
  const pricing = getPricing();
  const b = req.body;
  const carId = num(b, 'carId', { label: 'Car' })!;
  if (!one('SELECT 1 FROM cars WHERE id = ? AND user_id = ? AND deleted = 0', carId, user.id)) throw new HttpError(400, 'Pick one of your cars');
  const hours = num(b, 'hours', { min: pricing.minHours, max: pricing.maxHours, label: 'Hours' })!;
  if (!Number.isInteger(hours)) throw new HttpError(400, 'Hours must be a whole number');
  const lat = num(b, 'lat', { min: -90, max: 90, optional: true });
  const lng = num(b, 'lng', { min: -180, max: 180, optional: true });
  const now = Date.now();

  const r = run(
    `INSERT INTO bookings (user_id, car_id, status, pickup_address, pickup_lat, pickup_lng, hours_booked, notes, otp, estimate_json, requested_at)
     VALUES (?, ?, 'searching', ?, ?, ?, ?, ?, ?, ?, ?)`,
    user.id,
    carId,
    str(b, 'pickupAddress', { max: 300, label: 'Pickup address' }),
    lat,
    lng,
    hours,
    str(b, 'notes', { max: 500, optional: true }),
    newOtp(),
    JSON.stringify(estimateFare(pricing, hours, now)),
    now,
  );
  const id = Number(r.lastInsertRowid);
  broadcast(id);
  dispatch(id);
  res.status(201).json(bookingView(id, 'customer'));
});

customerRoutes.get('/bookings/current', (req, res) => {
  const [current] = bookingViews(`b.user_id = ? AND b.status IN (${ACTIVE})`, [(req as AuthedRequest).user.id], 'customer', 1);
  res.json(current ?? null);
});

customerRoutes.get('/bookings', (req, res) => {
  res.json(bookingViews('b.user_id = ?', [(req as AuthedRequest).user.id], 'customer'));
});

customerRoutes.post('/bookings/:id/cancel', (req, res) => {
  const r = req as AuthedRequest;
  cancelBooking(ownBooking(r).id, 'Cancelled by customer', r.user.id);
  res.json(bookingView(idParam(req.params.id), 'customer'));
});

customerRoutes.post('/bookings/:id/rate', (req, res) => {
  const b = ownBooking(req as AuthedRequest);
  if (b.status !== 'paid') throw new HttpError(409, 'You can rate after paying');
  run('UPDATE bookings SET rating = ? WHERE id = ?', num(req.body, 'rating', { min: 1, max: 5, label: 'Rating' })!, b.id);
  broadcast(b.id);
  res.json(bookingView(b.id, 'customer'));
});

// ----- payment -----

customerRoutes.post('/bookings/:id/pay', async (req, res) => {
  const b = ownBooking(req as AuthedRequest);
  if (b.status !== 'completed' || !b.fare_total) throw new HttpError(409, 'Nothing to pay for this booking');
  if (config.mockPayments) return res.json({ mock: true, amount: b.fare_total });
  // Reuse the order if the user closed Checkout and tried again.
  let orderId = b.razorpay_order_id;
  if (!orderId) {
    orderId = (await createOrder(b.id, b.fare_total)).id;
    run('UPDATE bookings SET razorpay_order_id = ? WHERE id = ?', orderId, b.id);
  }
  res.json({ mock: false, orderId, amount: b.fare_total * 100, currency: 'INR', keyId: config.razorpay.keyId });
});

customerRoutes.post('/bookings/:id/pay/verify', (req, res) => {
  const b = ownBooking(req as AuthedRequest);
  const orderId = str(req.body, 'razorpay_order_id');
  const paymentId = str(req.body, 'razorpay_payment_id');
  const signature = str(req.body, 'razorpay_signature');
  if (orderId !== b.razorpay_order_id || !verifyCheckoutSignature(orderId, paymentId, signature)) {
    throw new HttpError(400, 'Payment could not be verified');
  }
  markPaid(b.id, paymentId);
  res.json(bookingView(b.id, 'customer'));
});

customerRoutes.post('/bookings/:id/pay/mock', (req, res) => {
  if (!config.mockPayments) throw new HttpError(404, 'Not found');
  const b = ownBooking(req as AuthedRequest);
  markPaid(b.id, `mock_${Date.now()}`);
  res.json(bookingView(b.id, 'customer'));
});
