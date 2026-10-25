# KeraDrive

On-demand, hourly **driver-for-your-car** booking for Kerala (launch city: Kochi).
The customer owns the car; we send a verified driver, charge by the hour and keep a commission.

Three installable PWAs served by one Node server:

| App | URL | For |
|---|---|---|
| Customer | `/` | Book a driver for your car, track, pay, rate |
| Driver (Partner) | `/driver/` | Apply, go online, accept bookings, OTP start, earnings |
| Ops dashboard | `/admin/` | Live bookings, manual assignment, driver approval, payouts, pricing |

## Stack

- **API**: Node 24 (runs TypeScript directly, no build step), Express 5, Socket.IO, built-in `node:sqlite` (WAL mode)
- **Web**: React 19 + Vite, one project with three entry points
- **Auth**: Google Identity Services (ID token verified server-side) for customers and drivers; username + password (scrypt hash) or Google for the ops dashboard; separate session cookie per app
- **Payments**: Razorpay Orders + Checkout + webhook (REST, no SDK)
- **Shared**: `shared/fare.ts` (pricing rules, used by both server and apps) and `shared/types.ts`

```
api/src/
  server.ts        Express app, Razorpay webhook, static PWA hosting
  bookings.ts      Booking lifecycle: matching, dispatch, state transitions, ledger
  auth.ts          Google login, sessions, role guards
  payments.ts      Razorpay order + signature checks
  realtime.ts      Socket.IO rooms (user:<id>, driver:<id>, admin)
  routes/          customer.ts, driver.ts, admin.ts, auth.ts
web/src/
  common/          theme, Kerala illustration, API client, login, UI kit
  user/ driver/ admin/
shared/            fare.ts (+ tests), types.ts
deploy/            systemd unit, Caddyfile, Litestream config, deploy script
```

## Run locally

```bash
npm install
cp api/.env.example api/.env
npm run dev
```

Open http://localhost:5173 (customer), http://localhost:5173/driver/ and http://localhost:5173/admin/.

Without Google or Razorpay keys, development mode gives you:
- **Dev login**: type any email. In dev, admin emails must start with `admin@`.
- **Mock payments**: "Pay" simulates success.

Each app has its own session cookie, so you can be the customer, driver and admin in three tabs of one browser.

```bash
npm test         # fare rules
npm run typecheck
```

## How a booking flows

```
searching ─► assigned ─► arrived ─► in_progress ─► completed ─► paid
    │            │          │      (driver enters     (fare from     (Razorpay
    │            └──────────┴─► released back to      actual time)    verified)
    └──────────────────────────► cancelled
```

1. The customer picks a car, pickup point and hours, and sees an estimate.
2. **Matching**: the booking is offered to every approved, online, free driver who can drive that transmission, within 20 km. The first to accept wins; a conditional UPDATE makes that race-safe. Every 15s the server re-offers it to drivers who have come online since. After 3 minutes with no driver, it's flagged in the ops dashboard for **manual assignment**.
3. The customer's app shows a **4-digit OTP**. The driver enters it to start the trip. After 5 wrong tries, the trip is locked.
4. The driver ends the trip, and the fare is computed from actual time: minimum hours, then billing blocks, plus a night charge.
5. The customer pays in the app. The driver's share goes into the **driver ledger**. Ops pays drivers weekly by UPI or bank transfer and records the reference.

Default pricing (editable in Ops → Pricing): ₹350 for the first 2 hours, then ₹120/hr billed in 30-minute blocks, ₹150 night charge (22:00–06:00 IST), 20% commission.

## Go-live setup

### 1. Google sign-in
1. https://console.cloud.google.com/apis/credentials → Create credentials → OAuth client ID → **Web application**.
2. Authorized JavaScript origins: `https://keradrive.nizamrazak.tech` (and `http://localhost:5173` for dev).
3. Set `GOOGLE_CLIENT_ID` in `api/.env`, and set `ADMIN_EMAILS` to your Google email(s).

### 2. Admin password
The ops dashboard signs in with `ADMIN_USERNAME` (a username or an email) and a password. Only a scrypt hash of the password is stored:
```bash
npm run admin:password
```
Type the password twice (it isn't shown on screen), then paste the printed `ADMIN_PASSWORD_HASH=…` line into `api/.env` and restart the server. Run this on the VPS too, or copy the line there. After 10 failed attempts from one IP, sign-in is blocked for 15 minutes.

### Customer & driver accounts with a password
Ops can create accounts that sign in with email + password (handy before Google sign-in is set up, or for staff and test accounts). Run as the app user on the server; it prints a new password once:
```bash
cd /opt/keradrive/app
sudo -u keradrive npm run -s account:create -- --role customer --email anu@example.com --name "Anu Thomas" --phone 9847012345
sudo -u keradrive npm run -s account:create -- --role driver --email rajesh@example.com --name "Rajesh Kumar" --phone 9946054321
```
Running it again for the same email resets the password. Drivers created this way are approved immediately.

### 3. Razorpay
1. Dashboard → Account & Settings → API keys. Start with **test** keys (`rzp_test_…`).
2. Settings → Payment capture → **Automatic capture**.
3. Webhooks → add `https://keradrive.nizamrazak.tech/api/webhooks/razorpay`, events `payment.captured` and `order.paid`, and set a secret. Put it in `RAZORPAY_WEBHOOK_SECRET`.
4. Switch to live keys after KYC is approved.

### 4. Ubuntu VPS
```bash
# Node 24
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt install -y nodejs
# Caddy (automatic HTTPS): https://caddyserver.com/docs/install#debian-ubuntu-raspbian

sudo useradd --system --create-home --home-dir /opt/keradrive keradrive
sudo -u keradrive git clone https://github.com/iamnizamrazak-creator/Driver-Booking-App-.git /opt/keradrive/app
sudo -u keradrive mkdir -p /opt/keradrive/data
cd /opt/keradrive/app && sudo -u keradrive cp api/.env.example api/.env   # then edit it (see below)
sudo -u keradrive npm ci && sudo -u keradrive npm run build

sudo cp deploy/keradrive.service /etc/systemd/system/ && sudo systemctl enable --now keradrive
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile        # set your domain
sudo systemctl reload caddy
```

Production `api/.env`:
```
NODE_ENV=production
APP_URL=https://keradrive.nizamrazak.tech
DATABASE_PATH=/opt/keradrive/data/keradrive.db
GOOGLE_CLIENT_ID=...
ADMIN_EMAILS=you@gmail.com
ADMIN_USERNAME=you@gmail.com
ADMIN_PASSWORD_HASH=scrypt$...
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
DEV_LOGIN=false
```
In production the server refuses to start without Google and Razorpay keys, and dev login and mock payments are always off.

**Backups**: install [Litestream](https://litestream.io/install/) with `deploy/litestream.yml`. It streams every SQLite write to cheap object storage, so losing the VPS doesn't lose bookings.

**Updates**: `ssh root@<server> /opt/keradrive/app/deploy/deploy.sh` (pulls, tests, builds, restarts).

**Current trial server**: https://keradrive.nizamrazak.tech (Hostinger KVM 2 at `187.77.136.7`, Kuala Lumpur). DNS A/AAAA records are in Hostinger DNS; Caddy renews the Let's Encrypt certificate automatically, and the bare IP redirects to the domain. Runs with `NODE_ENV=staging`: dev login on, dashboard admin shortcut off, mock payments. Nightly SQLite snapshots in `/opt/keradrive/backups` (14 days, same machine; add Litestream for off-site).

## Known MVP limits (deliberate)

- **Driver app must stay open while online.** A PWA can't track location or receive pushes in the background, especially on iOS. That's the main reason to build the native driver app first.
- No Google Maps yet: pickup is free text plus optional GPS, and distance is straight-line. Add Places autocomplete when you have a Maps key.
- Driver verification is offline (you check the licence in person). There are no document uploads yet.
- Phone numbers are collected but not OTP-verified.
- No cancellation fees, scheduled bookings, coupons, GST invoices or outstation trips yet.

## Suggested next steps

1. Pilot with 5–10 drivers in one part of Kochi; ops assigns by hand when needed.
2. Web push notifications and SMS/WhatsApp alerts for new bookings and assignment.
3. Native driver app (React Native/Expo) for background location and reliable alerts.
4. Scheduled ("book for tomorrow 9 AM") and one-way/outstation trips.
5. Razorpay Route or RazorpayX for automatic driver payouts once volume justifies the KYC.
