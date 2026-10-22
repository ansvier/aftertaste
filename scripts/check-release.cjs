const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const skip = new Set(['node_modules', '.git', 'release', 'site-dist', '.openai']);
const files = [];
function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { if (skip.has(entry.name)) continue; const file = path.join(dir, entry.name); if (entry.isDirectory()) walk(file); else files.push(file); } }
walk(root);
const problems = [];
for (const file of files) {
  const relative = path.relative(root, file);
  if (/\.(?:webp|png|ttf|ico|icns)$/i.test(file)) continue;
  const contents = fs.readFileSync(file, 'utf8');
  if (/[\u0400-\u04ff]/u.test(contents)) problems.push(`${relative}: non-English Cyrillic content`);
  if (/sk-(?:proj-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{24,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(contents)) problems.push(`${relative}: possible embedded credential`);
  if (['app' + 'gprj_', '/Us' + 'ers/', 'private' + '-knowledge', 'authorized' + '-context.json'].some(marker => contents.includes(marker))) problems.push(`${relative}: private-project state`);
  if (/\.(cjs|js)$/.test(file)) { try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); } catch { problems.push(`${relative}: invalid JavaScript`); } }
}
for (const file of ['README.md', 'LICENSE', 'SECURITY.md', 'CONTRIBUTING.md', 'THIRD_PARTY_NOTICES.md', 'docs/PRIVACY.md', 'docs/CHATGPT.md', 'docs/RELEASE_VALIDATION.md', '.github/workflows/release.yml', 'site/index.html']) if (!fs.existsSync(path.join(root, file))) problems.push(`Missing ${file}`);
// The checker names privacy boundaries without embedding a private project's identifiers itself.
if (problems.length) { process.stderr.write(problems.join('\n') + '\n'); process.exit(1); }
process.stdout.write(`Checked ${files.length} source files: English-only text, syntax, release documentation, and credential patterns.\n`);
