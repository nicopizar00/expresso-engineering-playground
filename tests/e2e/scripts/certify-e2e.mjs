import { spawn } from 'node:child_process';

const forwardedArgs = process.argv.slice(2);
const testArgs =
  forwardedArgs[0] === '--' ? forwardedArgs.slice(1) : forwardedArgs;
const args = ['exec', 'playwright', 'test', ...testArgs];

const child = spawn('pnpm', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
});

child.on('error', (error) => {
  console.error(`Playwright certification could not start: ${error.message}`);
  process.exit(1);
});

child.on('close', (code) => {
  if (code === 0) {
    console.log('Playwright certification passed: process exited with code 0.');
    process.exit(0);
  }

  console.error(`Playwright certification failed: process exited with code ${code}.`);
  process.exit(code ?? 1);
});
