// The screenshot scenes behind ?shot=start|play|chase|end. Each one stages a real,
// deterministic scene from the seeded world (the same seed always gives the same
// frame), so the screenshots are repeatable.
import { STEP } from './config.js';

/**
 * Set `world` to the named scene and return the screen to draw over it and the
 * best score to show. Unknown names fall back to start.
 */
export function stageShot(name, world) {
  const staged = world.stageShot(name);
  // Let the world settle for a few steps so traffic, smoke and the mission
  // marker are mid-motion, exactly as a live game looks.
  if (name === 'play' || name === 'chase') {
    const steps = name === 'chase' ? 12 : 45;
    for (let i = 0; i < steps; i += 1) {
      world.step(STEP, { mx: 0, my: -1, run: false }, 0, false);
    }
  }
  return staged;
}
