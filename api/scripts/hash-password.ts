// Prints an ADMIN_PASSWORD_HASH line for api/.env. The password is typed
// hidden and never stored; only its scrypt hash goes into the env file.
//   npm run admin:password
import readline from 'node:readline';
import { hashPassword } from '../src/password.ts';

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Mask input: echo nothing while the user types.
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (s.includes(question)) process.stdout.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const password = await ask('New admin password: ');
if (password.length < 10) {
  console.error('Use at least 10 characters.');
  process.exit(1);
}
if ((await ask('Repeat password: ')) !== password) {
  console.error('Passwords do not match.');
  process.exit(1);
}
console.log('\nAdd this line to api/.env (replacing any old one), then restart the server:\n');
console.log(`ADMIN_PASSWORD_HASH=${hashPassword(password)}`);
