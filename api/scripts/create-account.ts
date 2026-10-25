// Creates (or resets the password of) a customer or driver account that signs in
// with email + password. Prints a newly generated password once; only its hash is stored.
//
//   npm run account:create -- --role customer --email anu@example.com --name "Anu Thomas" --phone 9847012345
//   npm run account:create -- --role driver --email rajesh@example.com --name "Rajesh Kumar" --phone 9946054321
//
// Drivers created here are approved straight away (verify their licence in person first).
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import { upsertUser } from '../src/auth.ts';
import { one, run, tx } from '../src/db.ts';
import { hashPassword } from '../src/password.ts';

const { values } = parseArgs({
  options: {
    role: { type: 'string' },
    email: { type: 'string' },
    name: { type: 'string' },
    phone: { type: 'string' },
  },
});

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const role = values.role;
if (role !== 'customer' && role !== 'driver') fail('--role must be customer or driver');
const email = (values.email ?? '').trim().toLowerCase();
if (!/^\S+@\S+\.\S+$/.test(email)) fail('--email must be a valid email');
const name = (values.name ?? '').trim() || email.split('@')[0];
const digits = (values.phone ?? '').replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '');
if (!/^[6-9]\d{9}$/.test(digits)) fail('--phone must be a 10-digit Indian mobile number');
const phone = '+91' + digits;

// Readable but strong: Kera-xxxx-xxxx-xxxx without look-alike characters.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const block = () => Array.from({ length: 4 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
let password: string;
do password = `Kera-${block()}-${block()}-${block()}`;
while (!(/[A-Z]/.test(password.slice(5)) && /[a-z]/.test(password) && /\d/.test(password)));

tx(() => {
  const user = upsertUser({ sub: null, email, name, picture: null });
  run('UPDATE users SET name = ?, phone = ?, password_hash = ? WHERE id = ?', name, phone, hashPassword(password), user.id);

  if (role === 'driver') {
    const expiry = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
    if (one('SELECT 1 FROM drivers WHERE user_id = ?', user.id)) {
      run("UPDATE drivers SET name = ?, phone = ?, status = 'approved' WHERE user_id = ?", name, phone, user.id);
    } else {
      run(
        `INSERT INTO drivers (user_id, name, phone, licence_no, licence_expiry, experience_years, can_manual, can_automatic, status, created_at)
         VALUES (?, ?, ?, 'PENDING-VERIFICATION', ?, 0, 1, 1, 'approved', ?)`,
        user.id,
        name,
        phone,
        expiry,
        Date.now(),
      );
    }
  }
});

console.log(`\n${role === 'driver' ? 'Driver' : 'Customer'} account ready`);
console.log(`  App:      ${role === 'driver' ? '/driver/' : '/'}`);
console.log(`  Email:    ${email}`);
console.log(`  Password: ${password}`);
console.log('\nThis password is shown once. Run the command again to reset it.\n');
