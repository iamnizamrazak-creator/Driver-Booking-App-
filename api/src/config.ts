import path from 'node:path';

const env = process.env;
const isProd = env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: Number(env.PORT ?? 4000),
  databasePath: path.resolve(import.meta.dirname, '..', env.DATABASE_PATH ?? '../data/keradrive.db'),
  webDist: path.resolve(import.meta.dirname, '../../web/dist'),
  city: env.CITY ?? 'Kochi',
  appUrl: env.APP_URL ?? 'http://localhost:5173',
  // Served over HTTPS (any deployed server): secure cookies and same-origin checks.
  get https() {
    return this.appUrl.startsWith('https://');
  },
  googleClientId: env.GOOGLE_CLIENT_ID || null,
  // Username/password login for the ops dashboard. Generate the hash with `npm run admin:password`.
  adminUsername: (env.ADMIN_USERNAME ?? '').trim().toLowerCase() || null,
  adminPasswordHash: env.ADMIN_PASSWORD_HASH || null,
  adminEmails: (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  razorpay: {
    keyId: env.RAZORPAY_KEY_ID || null,
    keySecret: env.RAZORPAY_KEY_SECRET || null,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || null,
  },
  // Dev login and mock payments are refused in production no matter what the env says.
  devLogin: !isProd && env.DEV_LOGIN === 'true',
  // Lets dev-login emails starting with admin@ open the dashboard. Turn off on any
  // server reachable from the internet (e.g. a trial on a bare IP).
  devLoginAdmin: !isProd && env.DEV_LOGIN === 'true' && env.DEV_LOGIN_ADMIN !== 'false',
  get mockPayments() {
    return !isProd && !this.razorpay.keyId;
  },
  matching: {
    radiusKm: 20,
    // Bookings still searching after this long are flagged for manual assignment.
    attentionAfterMs: 3 * 60_000,
    redispatchEveryMs: 15_000,
  },
};

if (isProd && (!config.googleClientId || !config.razorpay.keyId || !config.razorpay.keySecret)) {
  throw new Error('GOOGLE_CLIENT_ID, RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required in production');
}
