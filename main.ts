// Neon Harbor entrypoint: gathers the finished open-world crime game in game/
// and its four gameplay screenshots, checks the screenshots are exactly the
// ones listed in shots.json and small enough for the scorer, then hands the
// whole package to /output with a dossier.json the judge reads.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// --- Neon Harbor screenshot gate -------------------------------------------
// The scorer refuses an entry whose screenshots do not match its manifest or
// whose files are too big, so confirm the set here and stop loudly instead of
// handing in a package the judge would throw out.
const SHOT_LIMIT_BYTES = 256 * 1024;

const manifest = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));
const wantedShots = manifest.map((shot) => shot.name);
const shotFolder = join(here, 'screenshots');
if (!existsSync(shotFolder)) {
  throw new Error(
    `Neon Harbor is missing its screenshots folder (${shotFolder}); expected shots: ${wantedShots.join(', ')}`,
  );
}
const presentShots = readdirSync(shotFolder).filter(
  (entry) => entry.endsWith('.jpg') || entry.endsWith('.jpeg') || entry.endsWith('.png'),
);
const missingShots = wantedShots.filter((name) => !presentShots.includes(name));
const extraShots = presentShots.filter((name) => !wantedShots.includes(name));
if (missingShots.length > 0 || extraShots.length > 0) {
  throw new Error(
    `Neon Harbor screenshots do not match shots.json — missing: ${missingShots.join(', ') || 'none'}, unexpected: ${extraShots.join(', ') || 'none'}`,
  );
}
for (const name of wantedShots) {
  const bytes = statSync(join(shotFolder, name)).size;
  if (bytes > SHOT_LIMIT_BYTES) {
    throw new Error(
      `Neon Harbor screenshot ${name} is ${bytes} bytes, over the 256 KiB cap; retake it smaller before submitting`,
    );
  }
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
