const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dest = path.join(root, 'site-dist');
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(path.join(root, 'site'), dest, { recursive: true });
fs.cpSync(path.join(root, 'renderer', 'assets'), path.join(dest, 'assets'), { recursive: true, filter: src => !src.endsWith('icon.svg') });
process.stdout.write('Built the static download website in site-dist/.\n');
