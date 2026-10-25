import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { config } from './config.ts';

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

export const db = new DatabaseSync(config.databasePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`);

// Append-only list. Never edit a migration that has shipped; add a new one.
const migrations: string[] = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    google_sub TEXT UNIQUE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    phone TEXT,
    avatar_url TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    app TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE cars (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    reg_no TEXT NOT NULL,
    transmission TEXT NOT NULL CHECK (transmission IN ('manual','automatic')),
    car_type TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE drivers (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    licence_no TEXT NOT NULL,
    licence_expiry TEXT NOT NULL,
    experience_years INTEGER NOT NULL DEFAULT 0,
    can_manual INTEGER NOT NULL DEFAULT 1,
    can_automatic INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending',
    online INTEGER NOT NULL DEFAULT 0,
    lat REAL,
    lng REAL,
    location_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE bookings (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    car_id INTEGER NOT NULL REFERENCES cars(id),
    driver_id INTEGER REFERENCES drivers(id),
    status TEXT NOT NULL,
    pickup_address TEXT NOT NULL,
    pickup_lat REAL,
    pickup_lng REAL,
    hours_booked INTEGER NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    otp TEXT NOT NULL,
    estimate_json TEXT NOT NULL,
    fare_json TEXT,
    fare_total INTEGER,
    requested_at INTEGER NOT NULL,
    assigned_at INTEGER,
    arrived_at INTEGER,
    started_at INTEGER,
    ended_at INTEGER,
    paid_at INTEGER,
    cancelled_at INTEGER,
    cancel_reason TEXT,
    razorpay_order_id TEXT,
    razorpay_payment_id TEXT,
    rating INTEGER
  );
  CREATE INDEX bookings_status ON bookings(status);
  CREATE INDEX bookings_user ON bookings(user_id);
  CREATE INDEX bookings_driver ON bookings(driver_id);

  -- Which drivers were offered a booking, so re-dispatch doesn't spam them.
  CREATE TABLE booking_offers (
    booking_id INTEGER NOT NULL REFERENCES bookings(id),
    driver_id INTEGER NOT NULL REFERENCES drivers(id),
    status TEXT NOT NULL DEFAULT 'open', -- open | declined
    created_at INTEGER NOT NULL,
    PRIMARY KEY (booking_id, driver_id)
  );

  -- What we owe each driver: +earning per paid trip, -payout when settled.
  CREATE TABLE driver_ledger (
    id INTEGER PRIMARY KEY,
    driver_id INTEGER NOT NULL REFERENCES drivers(id),
    booking_id INTEGER UNIQUE REFERENCES bookings(id),
    kind TEXT NOT NULL CHECK (kind IN ('earning','payout','adjustment')),
    amount INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

function migrate() {
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  for (let i = version; i < migrations.length; i++) {
    tx(() => {
      db.exec(migrations[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
    });
  }
}

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function one<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function all<T>(sql: string, ...params: SQLInputValue[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function run(sql: string, ...params: SQLInputValue[]) {
  return db.prepare(sql).run(...params);
}

migrate();
