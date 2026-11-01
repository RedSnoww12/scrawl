// Reads and updates CHANGELOG.md for the release workflows in .github/workflows/.
//
//   node scripts/changelog.mjs notes 1.1.0                     prints the 1.1.0 section
//   node scripts/changelog.mjs release 1.0.0 1.1.0 2026-11-20  moves [Unreleased] under 1.1.0
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../CHANGELOG.md', import.meta.url);
const REPO = 'https://github.com/RedSnoww12/scrawl';

const fail = msg => { console.error(msg); process.exit(1); };
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The text under "## [version]", up to the next "## [" heading or the link list. */
function section(text, version) {
  const m = text.match(new RegExp(`^## \\[${esc(version)}\\][^\\n]*\\n([\\s\\S]*?)(?=^## \\[|^\\[[^\\]]+\\]: |(?![\\s\\S]))`, 'm'));
  return m ? m[1].trim() : null;
}

const [cmd, ...args] = process.argv.slice(2);
const text = readFileSync(FILE, 'utf8');

if (cmd === 'notes') {
  const [version] = args;
  const body = section(text, version);
  if (body === null) fail(`CHANGELOG.md has no section for ${version}.`);
  process.stdout.write(body + '\n');
} else if (cmd === 'release') {
  const [prev, next, date] = args;
  if (!prev || !next || !date) fail('Usage: release <previous version> <new version> <YYYY-MM-DD>');
  if (section(text, next) !== null) fail(`CHANGELOG.md already has a section for ${next}.`);
  if (!section(text, 'Unreleased')) fail('Nothing under ## [Unreleased] in CHANGELOG.md. Add the changes first.');
  const out = text
    .replace(/^## \[Unreleased\]\n/m, `## [Unreleased]\n\n## [${next}] - ${date}\n`)
    .replace(/^\[Unreleased\]: .*$/m, `[Unreleased]: ${REPO}/compare/v${next}...HEAD\n[${next}]: ${REPO}/compare/v${prev}...v${next}`);
  writeFileSync(FILE, out);
} else {
  fail('Usage: changelog.mjs notes <version> | release <previous> <new> <date>');
}
