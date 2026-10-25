// Booking lifecycle: views, matching/dispatch and state transitions.
import crypto from 'node:crypto';
import { DEFAULT_PRICING, finalFare, type FareBreakdown, type PricingConfig } from '../../shared/fare.ts';
import { DRIVER_BUSY_STATUSES, type Booking, type BookingStatus, type CarType, type Transmission } from '../../shared/types.ts';
import { HttpError } from './auth.ts';
import { config } from './config.ts';
import { all, one, run, tx } from './db.ts';
import { emit } from './realtime.ts';

export interface BookingRow {
  id: number;
  user_id: number;
  car_id: number;
  driver_id: number | null;
  status: BookingStatus;
  pickup_address: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  hours_booked: number;
  notes: string;
  otp: string;
  estimate_json: string;
  fare_json: string | null;
  fare_total: number | null;
  requested_at: number;
  assigned_at: number | null;
  arrived_at: number | null;
  started_at: number | null;
  ended_at: number | null;
  paid_at: number | null;
  cancelled_at: number | null;
  cancel_reason: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  rating: number | null;
}

interface JoinedRow extends BookingRow {
  car_make: string;
  car_model: string;
  car_reg_no: string;
  car_transmission: Transmission;
  car_type: CarType;
  customer_name: string;
  customer_phone: string | null;
  d_name: string | null;
  d_phone: string | null;
  d_experience: number | null;
  d_avatar: string | null;
}

export type Audience = 'customer' | 'driver' | 'admin';

const BUSY = DRIVER_BUSY_STATUSES.map((s) => `'${s}'`).join(',');

// ---------- pricing ----------

export function getPricing(): PricingConfig {
  const row = one<{ value: string }>("SELECT value FROM settings WHERE key = 'pricing'");
  return { ...DEFAULT_PRICING, ...(row ? JSON.parse(row.value) : {}) };
}

export function setPricing(cfg: PricingConfig) {
  run(
    "INSERT INTO settings (key, value) VALUES ('pricing', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    JSON.stringify(cfg),
  );
}

// ---------- reads ----------

const JOINED = `
  SELECT b.*,
    c.make AS car_make, c.model AS car_model, c.reg_no AS car_reg_no,
    c.transmission AS car_transmission, c.car_type AS car_type,
    u.name AS customer_name, u.phone AS customer_phone,
    d.name AS d_name, d.phone AS d_phone, d.experience_years AS d_experience, du.avatar_url AS d_avatar
  FROM bookings b
  JOIN cars c ON c.id = b.car_id
  JOIN users u ON u.id = b.user_id
  LEFT JOIN drivers d ON d.id = b.driver_id
  LEFT JOIN users du ON du.id = d.user_id`;

export function bookingRow(id: number) {
  return one<BookingRow>('SELECT * FROM bookings WHERE id = ?', id);
}

export function driverRating(driverId: number): number | null {
  const r = one<{ avg: number | null }>('SELECT AVG(rating) AS avg FROM bookings WHERE driver_id = ? AND rating IS NOT NULL', driverId);
  return r?.avg ? Math.round(r.avg * 10) / 10 : null;
}

function toView(r: JoinedRow, audience: Audience): Booking {
  const view: Booking = {
    id: r.id,
    status: r.status,
    pickupAddress: r.pickup_address,
    pickupLat: r.pickup_lat,
    pickupLng: r.pickup_lng,
    hoursBooked: r.hours_booked,
    notes: r.notes,
    car: {
      id: r.car_id,
      make: r.car_make,
      model: r.car_model,
      regNo: r.car_reg_no,
      transmission: r.car_transmission,
      carType: r.car_type,
    },
    customer: { name: r.customer_name, phone: r.customer_phone },
    driver: r.driver_id
      ? {
          id: r.driver_id,
          name: r.d_name!,
          phone: r.d_phone!,
          avatarUrl: r.d_avatar,
          rating: driverRating(r.driver_id),
          experienceYears: r.d_experience ?? 0,
        }
      : null,
    estimate: JSON.parse(r.estimate_json) as FareBreakdown,
    fare: r.fare_json ? (JSON.parse(r.fare_json) as FareBreakdown) : null,
    requestedAt: r.requested_at,
    assignedAt: r.assigned_at,
    arrivedAt: r.arrived_at,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    paidAt: r.paid_at,
    cancelledAt: r.cancelled_at,
    cancelReason: r.cancel_reason,
    rating: r.rating,
  };
  // The customer reads the OTP out to the driver; nobody else ever sees it.
  if (audience === 'customer' && ['assigned', 'arrived'].includes(r.status)) view.otp = r.otp;
  return view;
}

export function bookingView(id: number, audience: Audience): Booking | null {
  const r = one<JoinedRow>(`${JOINED} WHERE b.id = ?`, id);
  return r ? toView(r, audience) : null;
}

export function bookingViews(where: string, params: (string | number)[], audience: Audience, limit = 50): Booking[] {
  return all<JoinedRow>(`${JOINED} WHERE ${where} ORDER BY b.id DESC LIMIT ${limit}`, ...params).map((r) => toView(r, audience));
}

// ---------- realtime fan-out ----------

export function broadcast(bookingId: number) {
  const b = bookingRow(bookingId);
  if (!b) return;
  emit(`user:${b.user_id}`, 'booking:update', bookingView(bookingId, 'customer'));
  if (b.driver_id) emit(`driver:${b.driver_id}`, 'booking:update', bookingView(bookingId, 'driver'));
  emit('admin', 'booking:update', bookingView(bookingId, 'admin'));
  if (b.status !== 'searching') {
    for (const o of all<{ driver_id: number }>('SELECT driver_id FROM booking_offers WHERE booking_id = ?', bookingId)) {
      emit(`driver:${o.driver_id}`, 'offer:gone', { bookingId });
    }
  }
}

// ---------- matching ----------

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

interface CandidateRow {
  id: number;
  lat: number | null;
  lng: number | null;
}

/** Online, approved, free drivers who can drive this car, nearest first. */
function eligibleDrivers(b: BookingRow) {
  const car = one<{ transmission: Transmission }>('SELECT transmission FROM cars WHERE id = ?', b.car_id)!;
  const skill = car.transmission === 'manual' ? 'can_manual' : 'can_automatic';
  const candidates = all<CandidateRow>(
    `SELECT d.id, d.lat, d.lng FROM drivers d
     WHERE d.status = 'approved' AND d.online = 1 AND d.${skill} = 1
       AND d.user_id != ?
       AND NOT EXISTS (SELECT 1 FROM bookings x WHERE x.driver_id = d.id AND x.status IN (${BUSY}))`,
    b.user_id,
  );
  return candidates
    .map((d) => ({
      id: d.id,
      // If either side has no location we can't rule the driver out; in a pilot
      // with a few drivers it's better to over-offer than to find nobody.
      km: d.lat != null && d.lng != null && b.pickup_lat != null && b.pickup_lng != null
        ? distanceKm(d.lat, d.lng, b.pickup_lat, b.pickup_lng)
        : null,
    }))
    .filter((d) => d.km == null || d.km <= config.matching.radiusKm)
    .sort((a, b) => (a.km ?? 999) - (b.km ?? 999));
}

/** Offer a searching booking to every eligible driver who hasn't seen it yet. */
export function dispatch(bookingId: number) {
  const b = bookingRow(bookingId);
  if (!b || b.status !== 'searching') return;
  const now = Date.now();
  for (const d of eligibleDrivers(b)) {
    const r = run('INSERT OR IGNORE INTO booking_offers (booking_id, driver_id, created_at) VALUES (?, ?, ?)', b.id, d.id, now);
    if (r.changes) {
      emit(`driver:${d.id}`, 'offer:new', { ...bookingView(b.id, 'driver'), distanceKm: d.km });
    }
  }
}

/** Picks up drivers who came online (or freed up) after a booking was made. */
export function startRedispatchLoop() {
  setInterval(() => {
    for (const { id } of all<{ id: number }>("SELECT id FROM bookings WHERE status = 'searching'")) dispatch(id);
  }, config.matching.redispatchEveryMs).unref();
}

export function openOffersFor(driverId: number) {
  const rows = all<{ booking_id: number }>(
    `SELECT o.booking_id FROM booking_offers o JOIN bookings b ON b.id = o.booking_id
     WHERE o.driver_id = ? AND o.status = 'open' AND b.status = 'searching' ORDER BY o.created_at DESC`,
    driverId,
  );
  return rows.map((r) => bookingView(r.booking_id, 'driver')!);
}

// ---------- transitions ----------

export function newOtp() {
  return crypto.randomInt(0, 10_000).toString().padStart(4, '0');
}

function driverIsBusy(driverId: number) {
  return !!one(`SELECT 1 FROM bookings WHERE driver_id = ? AND status IN (${BUSY})`, driverId);
}

/** First driver to accept wins; the conditional UPDATE makes the race safe. */
export function assignDriver(bookingId: number, driverId: number, by: 'driver' | 'admin') {
  tx(() => {
    if (driverIsBusy(driverId)) throw new HttpError(409, 'Driver is already on a trip');
    const r = run(
      "UPDATE bookings SET driver_id = ?, status = 'assigned', assigned_at = ? WHERE id = ? AND status = 'searching'",
      driverId,
      Date.now(),
      bookingId,
    );
    if (!r.changes) throw new HttpError(409, by === 'driver' ? 'Another driver took this booking' : 'Booking is no longer searching');
  });
  broadcast(bookingId);
}

/** Moves a booking forward, checking it's in the expected state and (optionally) owned by this driver. */
function advance(bookingId: number, from: BookingStatus, to: BookingStatus, set: string, params: (string | number)[], driverId?: number) {
  const r = run(
    `UPDATE bookings SET status = ?, ${set} WHERE id = ? AND status = ?${driverId ? ' AND driver_id = ?' : ''}`,
    to,
    ...params,
    bookingId,
    from,
    ...(driverId ? [driverId] : []),
  );
  if (!r.changes) throw new HttpError(409, `Booking is not ${from.replace('_', ' ')}`);
  broadcast(bookingId);
}

export function markArrived(bookingId: number, driverId: number) {
  advance(bookingId, 'assigned', 'arrived', 'arrived_at = ?', [Date.now()], driverId);
}

// A 4-digit OTP is only safe if guesses are limited. In-memory is fine for a single server.
const otpFailures = new Map<number, number>();
const MAX_OTP_FAILURES = 5;

export function startTrip(bookingId: number, driverId: number, otp: string) {
  const b = bookingRow(bookingId);
  if (!b || b.driver_id !== driverId) throw new HttpError(404, 'Booking not found');
  if (b.status !== 'arrived' && b.status !== 'assigned') throw new HttpError(409, 'Trip cannot be started now');
  const failures = otpFailures.get(bookingId) ?? 0;
  if (failures >= MAX_OTP_FAILURES) throw new HttpError(429, 'Too many wrong OTPs. Please call KeraDrive support.');
  if (otp.trim() !== b.otp) {
    otpFailures.set(bookingId, failures + 1);
    throw new HttpError(400, `Wrong OTP. Ask the customer to read it from their app. ${MAX_OTP_FAILURES - failures - 1} tries left.`);
  }
  otpFailures.delete(bookingId);
  advance(bookingId, b.status, 'in_progress', 'started_at = ?, arrived_at = COALESCE(arrived_at, ?)', [Date.now(), Date.now()], driverId);
}

export function endTrip(bookingId: number, driverId: number) {
  const b = bookingRow(bookingId);
  if (!b || b.driver_id !== driverId || b.status !== 'in_progress') throw new HttpError(409, 'Trip is not running');
  const ended = Date.now();
  const fare = finalFare(getPricing(), b.started_at!, ended);
  advance(bookingId, 'in_progress', 'completed', 'ended_at = ?, fare_json = ?, fare_total = ?', [ended, JSON.stringify(fare), fare.total], driverId);
}

/** Driver backs out before reaching the customer: booking goes back to searching, without them. */
export function releaseBooking(bookingId: number, driverId: number) {
  tx(() => {
    const r = run(
      "UPDATE bookings SET status = 'searching', driver_id = NULL, assigned_at = NULL, arrived_at = NULL WHERE id = ? AND driver_id = ? AND status IN ('assigned','arrived')",
      bookingId,
      driverId,
    );
    if (!r.changes) throw new HttpError(409, 'Booking cannot be released now');
    run(
      "INSERT INTO booking_offers (booking_id, driver_id, status, created_at) VALUES (?, ?, 'declined', ?) ON CONFLICT DO UPDATE SET status = 'declined'",
      bookingId,
      driverId,
      Date.now(),
    );
  });
  emit(`driver:${driverId}`, 'booking:update', bookingView(bookingId, 'driver'));
  broadcast(bookingId);
  dispatch(bookingId);
}

export function cancelBooking(bookingId: number, reason: string, userId?: number) {
  const b = bookingRow(bookingId);
  if (!b || (userId && b.user_id !== userId)) throw new HttpError(404, 'Booking not found');
  const r = run(
    "UPDATE bookings SET status = 'cancelled', cancelled_at = ?, cancel_reason = ? WHERE id = ? AND status IN ('searching','assigned','arrived')",
    Date.now(),
    reason,
    bookingId,
  );
  if (!r.changes) throw new HttpError(409, 'Booking can no longer be cancelled');
  broadcast(bookingId);
}

/** Idempotent: called from checkout verification and from the webhook. */
export function markPaid(bookingId: number, paymentId: string) {
  const credited = tx(() => {
    const r = run(
      "UPDATE bookings SET status = 'paid', paid_at = ?, razorpay_payment_id = ? WHERE id = ? AND status = 'completed'",
      Date.now(),
      paymentId,
      bookingId,
    );
    if (!r.changes) return false;
    const b = bookingRow(bookingId)!;
    const fare = JSON.parse(b.fare_json!) as FareBreakdown;
    run(
      "INSERT INTO driver_ledger (driver_id, booking_id, kind, amount, note, created_at) VALUES (?, ?, 'earning', ?, ?, ?)",
      b.driver_id!,
      b.id,
      fare.driverEarning,
      `Trip #${b.id}`,
      Date.now(),
    );
    return true;
  });
  if (credited) broadcast(bookingId);
  return credited;
}
