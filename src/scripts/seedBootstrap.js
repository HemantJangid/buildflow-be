import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * One-command bootstrap for a fresh DB (multi-tenant flow):
 * 1. Seed global permissions
 * 2. Create default org + admin user (admin@buildflow.com / admin123)
 *
 * Usage: npm run seed
 * Optional: npm run seed:demo — add demo users/projects/attendance in default org
 */
const run = (script) =>
  new Promise((resolve, reject) => {
    const child = spawn('node', [path.join(__dirname, script)], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '../..'),
      env: process.env,
    });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`))));
    child.on('error', reject);
  });

const main = async () => {
  await run('seedRolesAndPermissions.js');
  await run('seedAdmin.js');
};

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
