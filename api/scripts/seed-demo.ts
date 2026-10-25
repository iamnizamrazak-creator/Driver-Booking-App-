// Fills the database with realistic Kochi demo data: customers, cars, drivers
// (approved and pending), a week of paid and rated trips, driver earnings and a payout.
//
//   npm run demo:seed            add demo data (once)
//   npm run demo:seed -- --remove   delete everything this script added
//
// Demo-only people use @demo.keradrive emails. The password accounts made with
// account:create (customer@ / driver@keradrive.nizamrazak.tech) get trips and cars
// too; those rows are tracked and removed with --remove, but the accounts stay.
import { parseArgs } from 'node:util';
import { estimateFare, finalFare } from '../../shared/fare.ts';
import { upsertUser } from '../src/auth.ts';
import { getPricing } from '../src/bookings.ts';
import { all, one, run, tx } from '../src/db.ts';

const { values } = parseArgs({ options: { remove: { type: 'boolean' } } });
const DOMAIN = '@demo.keradrive';
const LOG_KEY = 'demo_seed';
const SHOWCASE_CUSTOMER = 'customer@keradrive.nizamrazak.tech';
const SHOWCASE_DRIVER = 'driver@keradrive.nizamrazak.tech';

interface SeedLog {
  bookingIds: number[];
  carIds: number[];
  ledgerIds: number[];
}

if (values.remove) {
  remove();
  process.exit(0);
}
if (one(`SELECT 1 FROM settings WHERE key = '${LOG_KEY}'`)) {
  console.log('Demo data is already loaded. Remove it first with: npm run demo:seed -- --remove');
  process.exit(0);
}

// Deterministic randomness so every seed looks the same.
let state = 20261025;
const rand = () => ((state = (state * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

const PLACES: [string, number, number][] = [
  ['Panampilly Nagar, near Avenue Centre', 9.9603, 76.2955],
  ['Infopark Phase 1, Kakkanad', 10.0098, 76.3615],
  ['Lulu Mall, Edappally', 10.0271, 76.3083],
  ['Princess Street, Fort Kochi', 9.9658, 76.2421],
  ['Vyttila Mobility Hub', 9.9672, 76.3209],
  ['Marine Drive, Ernakulam', 9.9779, 76.2773],
  ['Kaloor Stadium Road', 9.9971, 76.2999],
  ['Aluva Metro Station', 10.1099, 76.3497],
  ['Hill Palace Road, Thrippunithura', 9.9524, 76.3647],
  ['Kadavanthra Junction', 9.9665, 76.2992],
];

const NOTES = [
  '',
  '',
  'Airport drop and return',
  'Wedding at Thrissur, will need the driver till evening',
  'Hospital visit, please be on time',
  'Shopping at Lulu, then home',
  'Office meeting at Infopark',
  '',
];

const CUSTOMERS = [
  { name: 'Anu Thomas', phone: '9847012345', cars: [['Maruti', 'Swift', 'KL 07 CD 4521', 'manual', 'hatchback']] },
  { name: 'Arjun Menon', phone: '9846023456', cars: [['Hyundai', 'Creta', 'KL 07 BZ 8812', 'automatic', 'suv']] },
  { name: 'Fathima Rahman', phone: '9895034567', cars: [['Honda', 'City', 'KL 41 F 2290', 'automatic', 'sedan']] },
  { name: 'Joseph Kurian', phone: '9447045678', cars: [['Toyota', 'Innova Crysta', 'KL 05 AK 7001', 'manual', 'muv']] },
  { name: 'Lakshmi Nair', phone: '9746056789', cars: [['Kia', 'Seltos', 'KL 39 H 1456', 'automatic', 'suv']] },
] as const;

const DRIVERS = [
  { name: 'Rajesh Kumar', phone: '9946054321', exp: 8, manual: 1, auto: 1, status: 'approved', online: 1, at: 2 },
  { name: 'Biju Varghese', phone: '9946065432', exp: 12, manual: 1, auto: 0, status: 'approved', online: 1, at: 5 },
  { name: 'Shaji Pillai', phone: '9946076543', exp: 6, manual: 1, auto: 1, status: 'approved', online: 0, at: 0 },
  { name: 'Anas Muhammed', phone: '9946087654', exp: 4, manual: 1, auto: 1, status: 'approved', online: 1, at: 1 },
  { name: 'Suresh Babu', phone: '9946098765', exp: 15, manual: 1, auto: 0, status: 'approved', online: 0, at: 9 },
  { name: 'Vineeth Raj', phone: '9946009876', exp: 3, manual: 1, auto: 1, status: 'pending', online: 0, at: 6 },
  { name: 'Akhil Das', phone: '9946010987', exp: 2, manual: 1, auto: 0, status: 'pending', online: 0, at: 7 },
] as const;

const emailFor = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, '.') + DOMAIN;

const log: SeedLog = { bookingIds: [], carIds: [], ledgerIds: [] };
const pricing = getPricing();
const now = Date.now();
const IST = 5.5 * 3_600_000;
const DAY = 86_400_000;
const todayStart = Math.floor((now + IST) / DAY) * DAY - IST;

function addCar(userId: number, [make, model, regNo, transmission, carType]: readonly string[]) {
  const r = run(
    'INSERT INTO cars (user_id, make, model, reg_no, transmission, car_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    userId, make, model, regNo, transmission, carType, now - 10 * DAY,
  );
  const id = Number(r.lastInsertRowid);
  log.carIds.push(id);
  return { id, transmission };
}

tx(() => {
  // ---- customers + cars ----
  const customers: { userId: number; cars: { id: number; transmission: string }[] }[] = [];
  for (const c of CUSTOMERS) {
    const u = upsertUser({ sub: null, email: emailFor(c.name), name: c.name, picture: null });
    run('UPDATE users SET name = ?, phone = ? WHERE id = ?', c.name, '+91' + c.phone, u.id);
    customers.push({ userId: u.id, cars: c.cars.map((car) => addCar(u.id, car)) });
  }
  const showcase = one<{ id: number }>('SELECT id FROM users WHERE email = ?', SHOWCASE_CUSTOMER);
  if (showcase) {
    customers.push({
      userId: showcase.id,
      cars: [
        addCar(showcase.id, ['Tata', 'Nexon', 'KL 07 DE 3344', 'manual', 'suv']),
        addCar(showcase.id, ['Mahindra', 'XUV700', 'KL 07 DF 7788', 'automatic', 'suv']),
      ],
    });
  }

  // ---- drivers ----
  const drivers: { id: number; manual: number; auto: number }[] = [];
  for (const d of DRIVERS) {
    const u = upsertUser({ sub: null, email: emailFor(d.name), name: d.name, picture: null });
    run('UPDATE users SET phone = ? WHERE id = ?', '+91' + d.phone, u.id);
    const [, lat, lng] = PLACES[d.at];
    const r = run(
      `INSERT INTO drivers (user_id, name, phone, licence_no, licence_expiry, experience_years, can_manual, can_automatic, status, online, lat, lng, location_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      u.id, d.name, '+91' + d.phone, `KL07 ${2008 + (d.phone.charCodeAt(9) % 15)}00${d.phone.slice(-5)}`, '2031-03-31',
      d.exp, d.manual, d.auto, d.status, d.online, lat + (rand() - 0.5) * 0.01, lng + (rand() - 0.5) * 0.01, now, now - 20 * DAY,
    );
    if (d.status === 'approved') drivers.push({ id: Number(r.lastInsertRowid), manual: d.manual, auto: d.auto });
  }
  const showDriver = one<{ id: number }>(
    'SELECT d.id FROM drivers d JOIN users u ON u.id = d.user_id WHERE u.email = ?',
    SHOWCASE_DRIVER,
  );
  if (showDriver) drivers.push({ id: showDriver.id, manual: 1, auto: 1 });

  // ---- a week of trips ----
  // `driver: 'match'` picks a random approved driver who can drive the chosen car.
  const trip = (customer: (typeof customers)[number], driver: number | 'match' | null, dayOffset: number, opts: { cancelled?: boolean } = {}) => {
    const car = pick(customer.cars);
    const driverId = driver === 'match' ? driverFor(car.transmission) : driver;
    const [place, lat, lng] = pick(PLACES);
    const hours = pick([2, 3, 4, 4, 5, 6, 8]);
    const startHourIst = 7 + Math.floor(rand() * 10);
    const requested = todayStart - dayOffset * DAY + startHourIst * 3_600_000 + Math.floor(rand() * 50) * 60_000;
    const estimate = estimateFare(pricing, hours, requested);
    const otp = String(1000 + Math.floor(rand() * 9000));
    if (opts.cancelled) {
      const r = run(
        `INSERT INTO bookings (user_id, car_id, status, pickup_address, pickup_lat, pickup_lng, hours_booked, notes, otp, estimate_json, requested_at, cancelled_at, cancel_reason)
         VALUES (?, ?, 'cancelled', ?, ?, ?, ?, '', ?, ?, ?, ?, 'Cancelled by customer')`,
        customer.userId, car.id, place, lat, lng, hours, otp, JSON.stringify(estimate), requested, requested + 4 * 60_000,
      );
      log.bookingIds.push(Number(r.lastInsertRowid));
      return;
    }
    const assigned = requested + (1 + Math.floor(rand() * 4)) * 60_000;
    const arrived = assigned + (10 + Math.floor(rand() * 20)) * 60_000;
    const started = arrived + (3 + Math.floor(rand() * 6)) * 60_000;
    const ended = started + Math.round(hours * 60 * (0.8 + rand() * 0.45)) * 60_000;
    const fare = finalFare(pricing, started, ended);
    const paid = ended + (2 + Math.floor(rand() * 10)) * 60_000;
    const r = run(
      `INSERT INTO bookings (user_id, car_id, driver_id, status, pickup_address, pickup_lat, pickup_lng, hours_booked, notes, otp,
         estimate_json, fare_json, fare_total, requested_at, assigned_at, arrived_at, started_at, ended_at, paid_at, razorpay_payment_id, rating)
       VALUES (?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      customer.userId, car.id, driverId, place, lat, lng, hours, pick(NOTES), otp,
      JSON.stringify(estimate), JSON.stringify(fare), fare.total, requested, assigned, arrived, started, ended, paid,
      `demo_${requested}`, pick([5, 5, 5, 4, 4, 5, 3]),
    );
    const bookingId = Number(r.lastInsertRowid);
    log.bookingIds.push(bookingId);
    const l = run(
      "INSERT INTO driver_ledger (driver_id, booking_id, kind, amount, note, created_at) VALUES (?, ?, 'earning', ?, ?, ?)",
      driverId, bookingId, fare.driverEarning, `Trip #${bookingId}`, paid,
    );
    log.ledgerIds.push(Number(l.lastInsertRowid));
  };

  function driverFor(carTransmission: string) {
    const ok = drivers.filter((d) => (carTransmission === 'manual' ? d.manual : d.auto));
    return pick(ok).id;
  }

  for (let day = 7; day >= 1; day--) {
    const count = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      const c = pick(customers);
      trip(c, 'match', day);
    }
  }
  // The showcase accounts get their own history so their screens aren't empty.
  const showCustomer = customers.find((c) => c.userId === showcase?.id);
  if (showCustomer && showDriver) {
    trip(showCustomer, showDriver.id, 6);
    trip(showCustomer, showDriver.id, 3);
    trip(showCustomer, showDriver.id, 1);
  }
  trip(customers[1], null, 2, { cancelled: true });
  trip(customers[3], null, 4, { cancelled: true });

  // ---- one weekly payout already made ----
  const top = one<{ driver_id: number; s: number }>(
    `SELECT driver_id, SUM(amount) AS s FROM driver_ledger WHERE id IN (${log.ledgerIds.join(',')}) GROUP BY driver_id ORDER BY s DESC LIMIT 1`,
  );
  if (top) {
    const amount = Math.floor(top.s * 0.6);
    const l = run(
      "INSERT INTO driver_ledger (driver_id, kind, amount, note, created_at) VALUES (?, 'payout', ?, 'Payout · UPI demo-ref-0001', ?)",
      top.driver_id, -amount, todayStart - 2 * DAY + 11 * 3_600_000,
    );
    log.ledgerIds.push(Number(l.lastInsertRowid));
  }

  run('INSERT INTO settings (key, value) VALUES (?, ?)', LOG_KEY, JSON.stringify(log));
});

const trips = all<{ n: number; s: number }>(`SELECT COUNT(*) AS n, SUM(fare_total) AS s FROM bookings WHERE id IN (${log.bookingIds.join(',')}) AND status = 'paid'`)[0];
console.log(`Demo data loaded: ${CUSTOMERS.length} customers, ${DRIVERS.length} drivers (${DRIVERS.filter((d) => d.status === 'pending').length} pending), ${log.carIds.length} cars, ${trips.n} paid trips worth ₹${trips.s}.`);

function remove() {
  const row = one<{ value: string }>(`SELECT value FROM settings WHERE key = '${LOG_KEY}'`);
  const seeded: SeedLog = row ? JSON.parse(row.value) : { bookingIds: [], carIds: [], ledgerIds: [] };
  const list = (ids: number[]) => (ids.length ? ids.join(',') : '0');
  tx(() => {
    const demoUsers = `SELECT id FROM users WHERE email LIKE '%${DOMAIN}'`;
    const demoDrivers = `SELECT id FROM drivers WHERE user_id IN (${demoUsers})`;
    const demoBookings = `SELECT id FROM bookings WHERE id IN (${list(seeded.bookingIds)}) OR user_id IN (${demoUsers}) OR driver_id IN (${demoDrivers})`;
    run(`DELETE FROM driver_ledger WHERE id IN (${list(seeded.ledgerIds)}) OR driver_id IN (${demoDrivers}) OR booking_id IN (${demoBookings})`);
    run(`DELETE FROM booking_offers WHERE booking_id IN (${demoBookings}) OR driver_id IN (${demoDrivers})`);
    run(`DELETE FROM bookings WHERE id IN (${demoBookings})`);
    run(`DELETE FROM cars WHERE id IN (${list(seeded.carIds)}) OR user_id IN (${demoUsers})`);
    run(`DELETE FROM drivers WHERE id IN (${demoDrivers})`);
    run(`DELETE FROM sessions WHERE user_id IN (${demoUsers})`);
    run(`DELETE FROM users WHERE id IN (${demoUsers})`);
    run(`DELETE FROM settings WHERE key = '${LOG_KEY}'`);
  });
  console.log('Demo data removed.');
}
