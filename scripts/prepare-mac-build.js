'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (process.platform !== 'darwin') process.exit(0);

const binDir = path.join(__dirname, '..', 'node_modules', 'app-builder-bin', 'mac');
if (!fs.existsSync(binDir)) process.exit(0);

for (const name of fs.readdirSync(binDir)) {
  const target = path.join(binDir, name);
  try { fs.chmodSync(target, 0o755); } catch (_) { /* ignore */ }
}

try {
  execFileSync('xattr', ['-cr', path.join(__dirname, '..', 'node_modules', 'app-builder-bin')], { stdio: 'ignore' });
} catch (_) {
  /* xattr may be missing in unusual environments */
}
