// Razorpay via its REST API (no SDK needed): create an order, verify the
// Checkout signature, and verify webhooks. Amounts sent to Razorpay are paise.
import crypto from 'node:crypto';
import { HttpError } from './auth.ts';
import { config } from './config.ts';

const API = 'https://api.razorpay.com/v1';

function authHeader() {
  const { keyId, keySecret } = config.razorpay;
  return 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
}

export async function createOrder(bookingId: number, amountRupees: number): Promise<{ id: string; amount: number; currency: string }> {
  const res = await fetch(`${API}/orders`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: amountRupees * 100,
      currency: 'INR',
      receipt: `booking_${bookingId}`,
      notes: { booking_id: String(bookingId) },
    }),
  });
  if (!res.ok) {
    console.error('Razorpay order failed', res.status, await res.text());
    throw new HttpError(502, 'Could not start payment, please try again');
  }
  return res.json() as Promise<{ id: string; amount: number; currency: string }>;
}

function safeEqualHex(a: string, b: string) {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string) {
  const expected = crypto.createHmac('sha256', config.razorpay.keySecret!).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqualHex(expected, signature);
}

export function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined) {
  if (!config.razorpay.webhookSecret || !signature) return false;
  const expected = crypto.createHmac('sha256', config.razorpay.webhookSecret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}
