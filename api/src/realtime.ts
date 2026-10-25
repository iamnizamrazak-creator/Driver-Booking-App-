import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { appFrom, driverFor, isAdmin, userFromCookies } from './auth.ts';

let io: Server | null = null;

// Rooms: `user:<id>` (customer app), `driver:<driverId>` (driver app), `admin`.
export function initRealtime(server: HttpServer) {
  io = new Server(server, { path: '/socket.io' });
  io.on('connection', (socket) => {
    const app = appFrom(socket.handshake.auth?.app);
    const user = userFromCookies(socket.handshake.headers.cookie, app);
    if (!user) return socket.disconnect(true);

    if (app === 'user') socket.join(`user:${user.id}`);
    if (app === 'driver') {
      const driver = driverFor(user.id);
      if (driver) socket.join(`driver:${driver.id}`);
    }
    if (app === 'admin' && isAdmin(user)) socket.join('admin');
  });
}

export function emit(room: string, event: string, payload: unknown) {
  io?.to(room).emit(event, payload);
}
