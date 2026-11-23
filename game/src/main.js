// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between six screens: title, play, paused, busted, wasted and
// story-complete. Progress (cash, mission, earnings) autosaves to localStorage.
//
// ?seed=N fixes the city. ?shot=start|play|chase|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady.
import { BEST_KEY, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_BUSTED, EVENT_CRASH, EVENT_MISSION, EVENT_PICKUP, EVENT_PUNCH,
  EVENT_SHOT, EVENT_STEAL, EVENT_STORY, EVENT_WASTED,
} from './world.js';
import { ACTION_CONFIRM, ACTION_CONTINUE, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import {
  createRenderer, SCREEN_BUSTED, SCREEN_COMPLETE, SCREEN_PAUSED, SCREEN_PLAY,
  SCREEN_TITLE, SCREEN_WASTED,
} from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;
/** Autosave cadence while playing, in seconds. */
const SAVE_EVERY = 10;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed), seed);
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (!save || typeof save.cash !== 'number') return null;
    return save;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.getSave()));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function writeBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Ignore: best is a nicety, not the save.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, { save: null, best: scene.best });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let save = readSave();
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let saveTimer = 0;
  let storyShown = false;

  // Test hook: headless checks drive the game through this handle.
  window.__game = {
    world,
    get screen() {
      return screen;
    },
    start: () => startGame(false),
    continueGame: () => startGame(true),
  };

  function announce(message) {
    status.textContent = message;
  }

  function startGame(continueSave) {
    audio.unlock();
    world.reset();
    storyShown = false;
    if (continueSave) {
      const s = readSave();
      if (s) world.loadSave(s);
    }
    saveTimer = 0;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Playing Neon Harbor. ${world.currentMission() ? world.currentMission().title : 'Free roam.'}`);
  }

  function handleEvents(events) {
    if (events & EVENT_PUNCH) audio.punch();
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_STEAL) audio.steal();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_MISSION) {
      audio.mission();
      writeSave();
      save = readSave();
      if (world.state.stats.earned > best) {
        best = world.state.stats.earned;
        writeBest(best);
      }
      announce(`Mission complete. Earned $${world.state.stats.earned} so far.`);
    }
    if (events & EVENT_STORY) {
      screen = SCREEN_COMPLETE;
      storyShown = true;
      writeSave();
      save = readSave();
      announce('Story complete. Neon Harbor is yours.');
    }
    if (events & EVENT_BUSTED) {
      audio.busted();
      world.respawn('busted');
      writeSave();
      save = readSave();
      screen = SCREEN_BUSTED;
      announce('Busted. $200 bail.');
    } else if (events & EVENT_WASTED) {
      audio.busted();
      world.respawn('wasted');
      writeSave();
      save = readSave();
      screen = SCREEN_WASTED;
      announce('Wasted. $100 hospital bill.');
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.setMuted(!audio.isMuted());
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONTINUE) startGame(true);
      else if (actions & ACTION_CONFIRM) startGame(false);
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        announce('Back on the streets.');
      }
    } else if (screen === SCREEN_COMPLETE) {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        announce('Free roam. The city is yours.');
      }
    }
  }

  function step() {
    const ctl = input.move();
    const worldActions = input.takeWorldActions();
    const events = world.step(STEP, ctl, worldActions, screen === SCREEN_TITLE);
    if (screen === SCREEN_TITLE) return;
    handleEvents(events);
    // Engine hum and siren follow the live state.
    const p = world.state.player;
    audio.engine(!p.onFoot && p.car ? Math.abs(p.car.speed) / 560 : 0);
    audio.siren(world.state.wanted > 0 && screen === SCREEN_PLAY);
    // Autosave while playing.
    saveTimer += STEP;
    if (saveTimer >= SAVE_EVERY) {
      saveTimer = 0;
      writeSave();
      save = readSave();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world, screen, { save, best });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

  announce('Neon Harbor. Press Enter to start, C to continue.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
