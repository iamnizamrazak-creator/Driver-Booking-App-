import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { HttpError } from './auth.ts';
import { markPaid, startRedispatchLoop } from './bookings.ts';
import { config } from './config.ts';
import { one } from './db.ts';
import { verifyWebhookSignature } from './payments.ts';
import { initRealtime } from './realtime.ts';
import { adminRoutes } from './routes/admin.ts';
import { authRoutes } from './routes/auth.ts';
import { customerRoutes } from './routes/customer.ts';
import { driverRoutes } from './routes/driver.ts';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Razorpay webhook needs the raw body for signature checks, so it goes before express.json().
app.post('/api/webhooks/razorpay', express.raw({ type: 'application/json' }), (req, res) => {
  if (!verifyWebhookSignature(req.body as Buffer, req.header('x-razorpay-signature'))) return res.status(400).end();
  const event = JSON.parse((req.body as Buffer).toString('utf8'));
  if (event.event === 'payment.captured' || event.event === 'order.paid') {
    const payment = event.payload?.payment?.entity;
    const booking = payment?.order_id
      ? one<{ id: number }>('SELECT id FROM bookings WHERE razorpay_order_id = ?', payment.order_id)
      : undefined;
    if (booking) markPaid(booking.id, payment.id);
  }
  res.json({ ok: true });
});

app.use(express.json({ limit: '100kb' }));

// Browsers send Origin on cross-site POSTs; reject anything not from our own app (CSRF guard on top of SameSite=Lax).
app.use('/api', (req, res, next) => {
  const origin = req.header('origin');
  if (req.method !== 'GET' && origin && config.isProd && origin !== config.appUrl) {
    return next(new HttpError(403, 'Bad origin'));
  }
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
app.use('/api', authRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', customerRoutes);
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

// In production the API also serves the three built PWAs.
if (fs.existsSync(config.webDist)) {
  app.use(express.static(config.webDist, { index: false, maxAge: '1h' }));
  const page = (dir: string) => (_req: Request, res: Response) => res.sendFile(path.join(config.webDist, dir, 'index.html'));
  app.get(['/driver', '/driver/*rest'], page('driver'));
  app.get(['/admin', '/admin/*rest'], page('admin'));
  app.get(['/', '/*rest'], page(''));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

const server = http.createServer(app);
initRealtime(server);
startRedispatchLoop();
server.listen(config.port, () => {
  console.log(`KeraDrive API on http://localhost:${config.port} (${process.env.NODE_ENV ?? 'development'})`);
  if (config.devLogin) console.log(`  Dev login is ON.${config.devLoginAdmin ? ' Admin emails must start with admin@' : ' Dashboard needs the admin password.'}`);
  if (!config.adminPasswordHash && config.adminUsername) console.log('  ADMIN_PASSWORD_HASH is missing: run `npm run admin:password`');
  if (config.mockPayments) console.log('  Razorpay keys missing: using mock payments');
});
