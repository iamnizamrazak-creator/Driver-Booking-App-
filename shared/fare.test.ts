import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PRICING as cfg, billedMinutesFor, estimateFare, finalFare } from './fare.ts';

// 2026-01-10 10:00 IST
const MORNING = Date.UTC(2026, 0, 10, 4, 30);
// 2026-01-10 21:00 IST
const EVENING = Date.UTC(2026, 0, 10, 15, 30);

test('bills the minimum for short trips', () => {
  assert.equal(billedMinutesFor(cfg, 20), 120);
  assert.equal(finalFare(cfg, MORNING, MORNING + 50 * 60_000).total, 350);
});

test('rounds extra time up to the billing block', () => {
  assert.equal(billedMinutesFor(cfg, 121), 150);
  const f = finalFare(cfg, MORNING, MORNING + 121 * 60_000);
  assert.equal(f.extraFare, 60);
  assert.equal(f.total, 410);
});

test('splits commission and driver earning', () => {
  const f = estimateFare(cfg, 4, MORNING);
  assert.equal(f.total, 350 + 240);
  assert.equal(f.commission, 118);
  assert.equal(f.driverEarning, f.total - f.commission);
});

test('adds night charge when the trip runs past 22:00 IST', () => {
  assert.equal(estimateFare(cfg, 2, EVENING).nightCharge, 150);
  assert.equal(estimateFare(cfg, 2, MORNING).nightCharge, 0);
});
