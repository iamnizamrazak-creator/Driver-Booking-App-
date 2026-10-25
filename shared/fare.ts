// Fare rules shared by the API (authoritative) and the web apps (estimates).
// All amounts are whole rupees. Kerala/India has no DST, so IST is a fixed +5:30.

export interface PricingConfig {
  minHours: number;           // minimum billed duration
  baseFare: number;           // covers the first `minHours`
  extraPerHour: number;       // charged beyond `minHours`
  billingBlockMinutes: number; // extra time is rounded up to this block
  nightCharge: number;        // flat, if any part of the trip falls in the night window
  nightStartHour: number;     // IST, 24h
  nightEndHour: number;       // IST, 24h
  commissionPct: number;      // platform share of the total
  maxHours: number;           // longest booking a user can pick
}

export const DEFAULT_PRICING: PricingConfig = {
  minHours: 2,
  baseFare: 350,
  extraPerHour: 120,
  billingBlockMinutes: 30,
  nightCharge: 150,
  nightStartHour: 22,
  nightEndHour: 6,
  commissionPct: 20,
  maxHours: 12,
};

export interface FareBreakdown {
  billedMinutes: number;
  baseFare: number;
  extraFare: number;
  nightCharge: number;
  total: number;
  commission: number;
  driverEarning: number;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istHour(ms: number): number {
  return new Date(ms + IST_OFFSET_MS).getUTCHours();
}

export function overlapsNight(cfg: PricingConfig, startMs: number, endMs: number): boolean {
  const inNight = (h: number) =>
    cfg.nightStartHour > cfg.nightEndHour
      ? h >= cfg.nightStartHour || h < cfg.nightEndHour
      : h >= cfg.nightStartHour && h < cfg.nightEndHour;
  // 15-minute sampling is plenty for a flat surcharge.
  for (let t = startMs; t < endMs; t += 15 * 60 * 1000) {
    if (inNight(istHour(t))) return true;
  }
  return inNight(istHour(endMs - 1));
}

function breakdown(cfg: PricingConfig, billedMinutes: number, night: boolean): FareBreakdown {
  const extraMinutes = Math.max(0, billedMinutes - cfg.minHours * 60);
  const extraFare = Math.round((extraMinutes / 60) * cfg.extraPerHour);
  const nightCharge = night ? cfg.nightCharge : 0;
  const total = cfg.baseFare + extraFare + nightCharge;
  const commission = Math.round((total * cfg.commissionPct) / 100);
  return {
    billedMinutes,
    baseFare: cfg.baseFare,
    extraFare,
    nightCharge,
    total,
    commission,
    driverEarning: total - commission,
  };
}

export function billedMinutesFor(cfg: PricingConfig, actualMinutes: number): number {
  const block = cfg.billingBlockMinutes;
  const rounded = Math.ceil(Math.max(0, actualMinutes) / block) * block;
  return Math.max(cfg.minHours * 60, rounded);
}

/** Estimate shown before booking, for the hours the user picked. */
export function estimateFare(cfg: PricingConfig, hours: number, startMs = Date.now()): FareBreakdown {
  const minutes = billedMinutesFor(cfg, hours * 60);
  return breakdown(cfg, minutes, overlapsNight(cfg, startMs, startMs + minutes * 60_000));
}

/** Final fare from actual trip start/end. */
export function finalFare(cfg: PricingConfig, startMs: number, endMs: number): FareBreakdown {
  const actual = (endMs - startMs) / 60_000;
  return breakdown(cfg, billedMinutesFor(cfg, actual), overlapsNight(cfg, startMs, endMs));
}

export function formatINR(amount: number): string {
  return '₹' + amount.toLocaleString('en-IN');
}
