import { io, type Socket } from 'socket.io-client';
import type { AppName } from '../../../shared/types.ts';

let currentApp: AppName = 'user';

export function setApp(app: AppName) {
  currentApp = app;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', 'X-App': currentApp },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Network error, please try again');
  return data as T;
}

let socket: Socket | null = null;

/** One socket per app; reconnects automatically and re-joins rooms server-side. */
export function getSocket(): Socket {
  if (!socket) socket = io({ path: '/socket.io', auth: { app: currentApp }, withCredentials: true });
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}
