// Shapes exchanged between API and web apps.
import type { FareBreakdown } from './fare.ts';

export const BRAND = {
  name: 'KeraDrive',
  taglineMl: 'നിങ്ങളുടെ കാർ, ഞങ്ങളുടെ ഡ്രൈവർ',
  tagline: 'Your car. Our trusted driver.',
};

export type AppName = 'user' | 'driver' | 'admin';

export type BookingStatus =
  | 'searching'   // looking for a driver
  | 'assigned'    // driver accepted, heading to pickup
  | 'arrived'     // driver at pickup
  | 'in_progress' // OTP verified, trip running
  | 'completed'   // trip ended, awaiting payment
  | 'paid'
  | 'cancelled';

export const ACTIVE_STATUSES: BookingStatus[] = ['searching', 'assigned', 'arrived', 'in_progress', 'completed'];
export const DRIVER_BUSY_STATUSES: BookingStatus[] = ['assigned', 'arrived', 'in_progress'];

export type Transmission = 'manual' | 'automatic';
export type CarType = 'hatchback' | 'sedan' | 'suv' | 'muv' | 'luxury';
export type DriverStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface User {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
}

export interface Car {
  id: number;
  make: string;
  model: string;
  regNo: string;
  transmission: Transmission;
  carType: CarType;
}

export interface DriverProfile {
  id: number;
  userId: number;
  name: string;
  phone: string;
  licenceNo: string;
  licenceExpiry: string;
  experienceYears: number;
  canManual: boolean;
  canAutomatic: boolean;
  status: DriverStatus;
  online: boolean;
  rating: number | null;
  tripsCount: number;
}

export interface Me {
  user: User;
  driver: DriverProfile | null;
  isAdmin: boolean;
}

export interface Booking {
  id: number;
  status: BookingStatus;
  pickupAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  hoursBooked: number;
  notes: string;
  car: Car;
  customer: { name: string; phone: string | null };
  driver: { id: number; name: string; phone: string; avatarUrl: string | null; rating: number | null; experienceYears: number } | null;
  /** Only sent to the customer, and only before the trip starts. */
  otp?: string;
  estimate: FareBreakdown;
  fare: FareBreakdown | null;
  requestedAt: number;
  assignedAt: number | null;
  arrivedAt: number | null;
  startedAt: number | null;
  endedAt: number | null;
  paidAt: number | null;
  cancelledAt: number | null;
  cancelReason: string | null;
  rating: number | null;
  distanceKm?: number | null;
}

export interface PublicConfig {
  city: string;
  googleClientId: string | null;
  devLogin: boolean;
  razorpayKeyId: string | null;
  mockPayments: boolean;
  /** Ops dashboard offers username/password sign-in. */
  adminPasswordLogin: boolean;
  /** Customer/driver apps offer email + password sign-in. */
  passwordLogin: boolean;
}
