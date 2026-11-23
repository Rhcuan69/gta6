// The simulation: the player on foot or in a car, traffic, pedestrians, police,
// the wanted system, three story missions, combat, pickups and particles.
// Everything is driven by one seeded random, so a seed replays the same city.
import { CAR, MISSIONS, PEDS, PLAYER, POLICE, TRAFFIC, WANTED } from './config.js';
import { createCity, clampWorld, collideBuildings, nearestRoadCentre, onRoadAxis, PLACES } from './city.js';
import { createRandom } from './random.js';

export const EVENT_BUSTED = 1;
export const EVENT_WASTED = 2;
export const EVENT_MISSION = 4;
export const EVENT_STORY = 8;
export const EVENT_CRASH = 16;
export const EVENT_SHOT = 32;
export const EVENT_PUNCH = 64;
export const EVENT_PICKUP = 128;
export const EVENT_STEAL = 256;

export const ACT_ENTER = 1;
export const ACT_PUNCH = 2;
export const ACT_SHOOT = 4;

const TAU = Math.PI * 2;
const CAR_COLORS = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#f39c12', '#7f8c8d', '#16a085', '#d35400', '#ecf0f1', '#2c3e50'];
const CAR_KINDS = ['sedan', 'sedan', 'sedan', 'taxi', 'sport', 'truck', 'sedan', 'taxi'];

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}
function turnToward(angle, target, maxStep) {
  let d = target - angle;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return angle + clamp(d, -maxStep, maxStep);
}
function headingOf(axis, dir) {
  if (axis === 'x') return dir === 1 ? 0 : Math.PI;
  return dir === 1 ? Math.PI / 2 : -Math.PI / 2;
}
function laneOff(axis, dir) {
  // Right-hand traffic: east +27y, west -27y, south -27x, north +27x.
  if (axis === 'x') return dir === 1 ? 27 : -27;
  return dir === 1 ? -27 : 27;
}

export function createWorld(random, seed) {
  let rng = random;
  const city = createCity(rng);
  let idCounter = 1;

  const state = {
    time: 0,
    cash: 0,
    health: PLAYER.health,
    heat: 0,
    wanted: 0,
    player: null,
    cars: [],
    peds: [],
    pickups: [],
    particles: [],
    missionIndex: 0,
    missionStep: 0,
    storyDone: false,
    stats: { earned: 0, busted: 0, wasted: 0, stolen: 0, knocked: 0 },
    message: '',
    messageT: 0,
    camX: 1800,
    camY: 1800,
    titlePan: 0,
  };

  function say(text, seconds = 3.5) {
    state.message = text;
    state.messageT = seconds;
  }

  function addParticles(x, y, count, color, speed, life, size) {
    for (let i = 0; i < count; i += 1) {
      const a = rng() * TAU;
      const s = speed * (0.4 + rng() * 0.8);
      state.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life * (0.6 + rng() * 0.7), maxLife: life,
        color, size: size * (0.7 + rng() * 0.6),
      });
    }
    if (state.particles.length > 220) state.particles.splice(0, state.particles.length - 220);
  }

  function randomRoadPoint() {
    // A random point on a random road, with a right-hand lane offset.
    if (rng() < 0.5) {
      const cy = Math.floor(rng() * 10) * 360;
      return { x: 60 + rng() * 3480, y: cy + (rng() < 0.5 ? 27 : -27), axis: 'x', dir: rng() < 0.5 ? 1 : -1, road: cy };
    }
    const cx = Math.floor(rng() * 10) * 360;
    return { x: cx + (rng() < 0.5 ? 27 : -27), y: 60 + rng() * 3480, axis: 'y', dir: rng() < 0.5 ? 1 : -1, road: cx };
  }

  function makeCar(x, y, axis, dir, kind, driver) {
    const road = axis === 'x' ? nearestRoadCentre(y) : nearestRoadCentre(x);
    const off = laneOff(axis, dir);
    return {
      id: idCounter += 1,
      x: axis === 'x' ? x : road + off,
      y: axis === 'y' ? y : road + off,
      angle: headingOf(axis, dir),
      axis, dir, road, laneOff: off,
      speed: 0,
      targetSpeed: TRAFFIC.speedMin + rng() * (TRAFFIC.speedMax - TRAFFIC.speedMin),
      color: kind === 'police' ? '#e8e8f0' : CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)],
      kind,
      driver,
      hp: CAR.hp,
      wrecked: false,
      smoke: 0,
      stuckT: 0,
      reverseT: 0,
    };
  }

  function spawnTrafficCar(nearX, nearY) {
    for (let tries = 0; tries < 12; tries += 1) {
      const p = randomRoadPoint();
      if (nearX !== undefined && dist2(p.x, p.y, nearX, nearY) > 1100 * 1100) continue;
      if (nearX !== undefined && dist2(p.x, p.y, nearX, nearY) < 260 * 260) continue;
      const kind = CAR_KINDS[Math.floor(rng() * CAR_KINDS.length)];
      const car = makeCar(p.x, p.y, p.axis, p.dir, kind, 'traffic');
      car.speed = car.targetSpeed;
      state.cars.push(car);
      return car;
    }
    return null;
  }

  function spawnParkedCar() {
    // Parked on a parking lot, or along a road edge.
    if (city.lots.length > 0 && rng() < 0.4) {
      const lot = city.lots[Math.floor(rng() * city.lots.length)];
      const x = lot.x + 30 + rng() * (lot.w - 60);
      const y = lot.y + 30 + rng() * (lot.h - 60);
      const car = makeCar(x, y, 'x', 1, CAR_KINDS[Math.floor(rng() * CAR_KINDS.length)], 'parked');
      car.angle = rng() < 0.5 ? 0 : Math.PI / 2;
      state.cars.push(car);
      return car;
    }
    const p = randomRoadPoint();
    const car = makeCar(p.x, p.y, p.axis, p.dir, CAR_KINDS[Math.floor(rng() * CAR_KINDS.length)], 'parked');
    car.angle = headingOf(p.axis, p.dir);
    if (p.axis === 'x') car.y = p.road + (p.dir === 1 ? 44 : -44);
    else car.x = p.road + (p.dir === 1 ? -44 : 44);
    state.cars.push(car);
    return car;
  }

  function spawnPolice(nearX, nearY) {
    let best = randomRoadPoint();
    let bestScore = -Infinity;
    for (let tries = 0; tries < 8; tries += 1) {
      const q = randomRoadPoint();
      const d = Math.sqrt(dist2(q.x, q.y, nearX, nearY));
      const score = -Math.abs(d - POLICE.spawnDist);
      if (score > bestScore) {
        bestScore = score;
        best = q;
      }
    }
    const car = makeCar(best.x, best.y, best.axis, best.dir, 'police', 'police');
    car.speed = POLICE.chaseSpeed * 0.7;
    state.cars.push(car);
    return car;
  }

  function pickPedTarget(ped) {
    const p = randomRoadPoint();
    ped.tx = clamp(p.x + (rng() - 0.5) * 200, 40, 3560);
    ped.ty = clamp(p.y + (rng() - 0.5) * 200, 40, 3300);
  }

  function spawnPed(x, y) {
    const px = x !== undefined ? x : 100 + rng() * 3400;
    const py = y !== undefined ? y : 100 + rng() * 3200;
    const ped = {
      id: idCounter += 1,
      x: px, y: py,
      angle: rng() * TAU,
      speed: 55 + rng() * 45,
      shirt: Math.floor(rng() * 8),
      state: 'walk',
      tx: px, ty: py,
      downT: 0,
      fleeT: 0,
      retargetT: 0,
    };
    pickPedTarget(ped);
    state.peds.push(ped);
    return ped;
  }

  function spawnPickup(x, y, kind, amount) {
    state.pickups.push({ x, y, kind, amount: amount ?? 0, t: rng() * TAU });
  }

  function spawnCashPickups(count) {
    for (let i = 0; i < count; i += 1) {
      const p = randomRoadPoint();
      spawnPickup(p.x + (rng() - 0.5) * 60, p.y + (rng() - 0.5) * 60, 'cash', 25 + Math.floor(rng() * 4) * 25);
    }
  }

  function addHeat(amount) {
    state.heat = clamp(state.heat + amount, 0, 100);
    updateWanted();
  }

  function updateWanted() {
    const t = WANTED.thresholds;
    let w = 0;
    for (let i = 0; i < t.length; i += 1) if (state.heat >= t[i]) w = i + 1;
    state.wanted = w;
  }

  function currentMission() {
    return MISSIONS[state.missionIndex] ?? null;
  }

  function currentStep() {
    const m = currentMission();
    return m ? m.steps[state.missionStep] : null;
  }

  function startMission(index) {
    state.missionIndex = index;
    state.missionStep = 0;
    const m = MISSIONS[index];
    if (!m) return;
    const step = m.steps[0];
    if (step && step.wanted) {
      state.heat = Math.max(state.heat, WANTED.thresholds[step.wanted - 1]);
      updateWanted();
    }
    say(`${m.title} — ${m.brief}`, 6);
  }

  function completeStep() {
    const m = currentMission();
    if (!m) return EVENT_MISSION;
    state.missionStep += 1;
    if (state.missionStep >= m.steps.length) {
      state.cash += m.reward;
      state.stats.earned += m.reward;
      say(`MISSION COMPLETE — ${m.title}: +$${m.reward}`, 5);
      if (state.missionIndex + 1 >= MISSIONS.length) {
        state.storyDone = true;
        return EVENT_MISSION | EVENT_STORY;
      }
      startMission(state.missionIndex + 1);
      return EVENT_MISSION;
    }
    const step = currentStep();
    if (step && step.wanted) {
      state.heat = Math.max(state.heat, WANTED.thresholds[step.wanted - 1]);
      updateWanted();
    }
    return 0;
  }

  function respawn(kind) {
    const p = state.player;
    if (kind === 'busted') {
      state.cash = Math.max(0, state.cash - 200);
      state.stats.busted += 1;
      p.x = PLACES.police.x;
      p.y = PLACES.police.y + 120;
    } else {
      state.cash = Math.max(0, state.cash - 100);
      state.stats.wasted += 1;
      p.x = PLACES.hospital.x;
      p.y = PLACES.hospital.y + 120;
    }
    p.onFoot = true;
    p.car = null;
    p.speed = 0;
    p.health = PLAYER.health;
    p.bustT = 0;
    p.invuln = 2;
    state.heat = 0;
    updateWanted();
    state.cars = state.cars.filter((c) => c.driver !== 'police');
    // Mission 3 fails if you get caught: run it again.
    if (state.missionIndex === 2 && !state.storyDone) startMission(2);
    say(kind === 'busted' ? 'BUSTED — the harbour precinct let you go. $200 bail.' : 'WASTED — you wake up at St. Marina Hospital. $100 bill.', 5);
  }

  function reset() {
    rng = createRandom(seed);
    idCounter = 1;
    state.time = 0;
    state.cash = 0;
    state.health = PLAYER.health;
    state.heat = 0;
    state.wanted = 0;
    state.cars = [];
    state.peds = [];
    state.pickups = [];
    state.particles = [];
    state.missionIndex = 0;
    state.missionStep = 0;
    state.storyDone = false;
    state.stats = { earned: 0, busted: 0, wasted: 0, stolen: 0, knocked: 0 };
    state.message = '';
    state.messageT = 0;
    state.player = {
      x: PLACES.bar.x, y: PLACES.bar.y + 140,
      angle: -Math.PI / 2, onFoot: true, car: null,
      speed: 0, punchCd: 0, shootCd: 0, ammo: 0, hasGun: false,
      bustT: 0, invuln: 0,
    };
    state.camX = state.player.x;
    state.camY = state.player.y;
    for (let i = 0; i < TRAFFIC.count; i += 1) spawnTrafficCar(state.player.x, state.player.y);
    for (let i = 0; i < TRAFFIC.parked; i += 1) spawnParkedCar();
    for (let i = 0; i < PEDS.count; i += 1) spawnPed();
    spawnCashPickups(12);
    spawnPickup(PLACES.hospital.x + 60, PLACES.hospital.y + 60, 'health', 50);
    spawnPickup(PLACES.gun.x + 40, PLACES.gun.y - 40, 'gun', 0);
    spawnPickup(PLACES.gun.x - 60, PLACES.gun.y + 40, 'ammo', 24);
    startMission(0);
  }

  function loadSave(save) {
    state.cash = save.cash || 0;
    state.stats.earned = save.earned || 0;
    state.stats.busted = save.busted || 0;
    state.stats.wasted = save.wasted || 0;
    state.stats.stolen = save.stolen || 0;
    state.stats.knocked = save.knocked || 0;
    if (save.storyDone) {
      state.storyDone = true;
      state.missionIndex = MISSIONS.length;
    } else {
      startMission(Math.min(save.missionIndex || 0, MISSIONS.length - 1));
    }
    say(save.storyDone ? 'Welcome back to Neon Harbor. Story complete — free roam.' : `Welcome back. ${currentMission().title}`, 5);
  }

  function getSave() {
    return {
      cash: state.cash,
      earned: state.stats.earned,
      busted: state.stats.busted,
      wasted: state.stats.wasted,
      stolen: state.stats.stolen,
      knocked: state.stats.knocked,
      missionIndex: state.storyDone ? MISSIONS.length : state.missionIndex,
      storyDone: state.storyDone,
    };
  }

  // ---- traffic AI ----
  function stepTrafficCar(car, dt) {
    if (car.driver === 'parked' || car.wrecked) return;
    if (car.driver === 'police') return; // police steer in stepPoliceCar
    // At an intersection, sometimes turn.
    if (onRoadAxis(car.x) && onRoadAxis(car.y) && rng() < 0.9 * dt) {
      const h = headingOf(car.axis, car.dir);
      const turn = [0, Math.PI / 2, -Math.PI / 2][Math.floor(rng() * 3)];
      const nh = h + turn;
      let axis;
      let dir;
      if (Math.abs(Math.sin(nh)) < 0.5) {
        axis = 'x';
        dir = Math.cos(nh) >= 0 ? 1 : -1;
      } else {
        axis = 'y';
        dir = Math.sin(nh) >= 0 ? 1 : -1;
      }
      const cx = nearestRoadCentre(car.x);
      const cy = nearestRoadCentre(car.y);
      car.axis = axis;
      car.dir = dir;
      car.road = axis === 'x' ? cy : cx;
      car.laneOff = laneOff(axis, dir);
      car.angle = headingOf(axis, dir);
    }
    // Slow for the car ahead in the same lane.
    let target = car.targetSpeed;
    for (let i = 0; i < state.cars.length; i += 1) {
      const o = state.cars[i];
      if (o === car || o.driver === 'parked' || o.wrecked) continue;
      const dx = o.x - car.x;
      const dy = o.y - car.y;
      const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
      const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
      if (ahead > 0 && ahead < 85 && side < 30) {
        target = Math.min(target, Math.max(0, o.speed - 20));
        break;
      }
    }
    car.speed += clamp(target - car.speed, -260 * dt, 200 * dt);
    if (car.axis === 'x') {
      car.x += car.dir * car.speed * dt;
      car.y = car.road + car.laneOff;
    } else {
      car.y += car.dir * car.speed * dt;
      car.x = car.road + car.laneOff;
    }
    // Wrap around the city edge so traffic never runs out.
    if (car.x < -80) car.x = 3680;
    if (car.x > 3680) car.x = -80;
    if (car.y < -80) car.y = 3440;
    if (car.y > 3440) car.y = -80;
    car.angle = headingOf(car.axis, car.dir);
  }

  function stepPoliceCar(car, dt) {
    const p = state.player;
    const want = angleTo(car.x, car.y, p.x, p.y);
    const dist = Math.sqrt(dist2(car.x, car.y, p.x, p.y));
    if (car.reverseT > 0) {
      car.reverseT -= dt;
      car.speed = -160;
    } else {
      // A cop that catches the player on foot stops on them to make the arrest;
      // against a car it keeps ramming.
      const closeOnFoot = p.onFoot && dist < 70;
      const target = closeOnFoot ? 0 : POLICE.chaseSpeed;
      car.speed += clamp(target - car.speed, -600 * dt, 420 * dt);
      if (!closeOnFoot) {
        if (car.speed < 40) car.stuckT += dt;
        else car.stuckT = 0;
        if (car.stuckT > 1.4) {
          car.reverseT = 0.8;
          car.stuckT = 0;
        }
      } else {
        car.stuckT = 0;
      }
    }
    car.angle = turnToward(car.angle, want, 3.4 * dt);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const fixed = collideBuildings(city, nx, ny, CAR.radius);
    if (fixed.hit && car.speed > 60) {
      addParticles(car.x, car.y, 6, '#ffd23f', 160, 0.4, 3);
      car.speed *= 0.4;
    }
    const clamped = clampWorld(fixed.x, fixed.y, CAR.radius);
    car.x = clamped.x;
    car.y = clamped.y;
    if (Math.abs(car.speed) > 300 && rng() < 0.2) {
      state.particles.push({
        x: car.x - Math.cos(car.angle) * 20, y: car.y - Math.sin(car.angle) * 20,
        vx: 0, vy: 0, life: 0.5, maxLife: 0.5, color: '#8a8f9c', size: 7,
      });
    }
    // Busted: a cop car sitting on the player on foot.
    if (p.onFoot && dist < 56) {
      p.bustT += dt;
      if (p.bustT > 0.4) say('THE COPS HAVE YOU — BREAK AWAY!', 1);
    }
  }

  function stepPed(ped, dt) {
    if (ped.state === 'down') {
      ped.downT -= dt;
      if (ped.downT <= 0) {
        ped.state = 'flee';
        ped.fleeT = 2.5;
      }
      return;
    }
    let tx = ped.tx;
    let ty = ped.ty;
    let speed = ped.speed;
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      const a = angleTo(state.player.x, state.player.y, ped.x, ped.y);
      tx = ped.x + Math.cos(a) * 200;
      ty = ped.y + Math.sin(a) * 200;
      speed = ped.speed * 2.1;
      if (ped.fleeT <= 0) ped.state = 'walk';
    } else {
      ped.retargetT -= dt;
      if (dist2(ped.x, ped.y, tx, ty) < 30 * 30 || ped.retargetT <= 0) {
        pickPedTarget(ped);
        ped.retargetT = 6 + rng() * 6;
      }
    }
    const a = angleTo(ped.x, ped.y, tx, ty);
    ped.angle = turnToward(ped.angle, a, 6 * dt);
    const nx = ped.x + Math.cos(ped.angle) * speed * dt;
    const ny = ped.y + Math.sin(ped.angle) * speed * dt;
    const fixed = collideBuildings(city, nx, ny, PLAYER.radius);
    const clamped = clampWorld(fixed.x, fixed.y, PLAYER.radius);
    ped.x = clamped.x;
    ped.y = clamped.y;
  }

  function knockPed(ped, cause) {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.downT = 2.2;
    state.stats.knocked += 1;
    addParticles(ped.x, ped.y, 8, '#ff8fa3', 120, 0.5, 3);
    if (rng() < 0.55) {
      const amount = 10 + Math.floor(rng() * 4) * 10;
      spawnPickup(ped.x + (rng() - 0.5) * 30, ped.y + (rng() - 0.5) * 30, 'cash', amount);
    }
    if (cause === 'punch') addHeat(WANTED.punchPed);
    else if (cause === 'shot') addHeat(WANTED.killPed);
    else if (cause === 'car') addHeat(WANTED.runOver);
    for (const o of state.peds) {
      if (o !== ped && o.state !== 'down' && dist2(o.x, o.y, ped.x, ped.y) < 260 * 260) {
        o.state = 'flee';
        o.fleeT = 3;
      }
    }
  }

  function wreckCar(car) {
    car.wrecked = true;
    car.hp = 0;
    car.speed = 0;
    car.smoke = 3;
    addParticles(car.x, car.y, 18, '#5a5f6c', 120, 1.2, 6);
    addParticles(car.x, car.y, 10, '#ff9f43', 200, 0.5, 4);
    if (car.driver === 'player') {
      const p = state.player;
      p.onFoot = true;
      p.car = null;
      p.speed = 0;
      p.x = car.x - Math.sin(car.angle) * 34;
      p.y = car.y + Math.cos(car.angle) * 34;
      state.health -= 15;
      say('Your car is wrecked!', 3);
    }
    car.driver = 'none';
  }

  function stepPlayer(dt, ctl, actions) {
    const p = state.player;
    p.punchCd = Math.max(0, p.punchCd - dt);
    p.shootCd = Math.max(0, p.shootCd - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    let events = 0;

    if (p.onFoot) {
      const mx = ctl.mx;
      const my = ctl.my;
      const len = Math.hypot(mx, my);
      if (len > 0.01) {
        const speed = ctl.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
        p.angle = Math.atan2(my, mx);
        const nx = p.x + (mx / len) * speed * dt;
        const ny = p.y + (my / len) * speed * dt;
        const fixed = collideBuildings(city, nx, ny, PLAYER.radius);
        const clamped = clampWorld(fixed.x, fixed.y, PLAYER.radius);
        p.x = clamped.x;
        p.y = clamped.y;
      }
      if (actions & ACT_ENTER) {
        let best = null;
        let bestD = 60 * 60;
        for (const car of state.cars) {
          if (car.driver === 'player' || car.wrecked) continue;
          const d = dist2(p.x, p.y, car.x, car.y);
          if (d < bestD) {
            bestD = d;
            best = car;
          }
        }
        if (best) {
          if (best.driver === 'traffic') {
            const driver = spawnPed(best.x + 20, best.y + 20);
            driver.state = 'flee';
            driver.fleeT = 4;
            addHeat(WANTED.stealCarSeen);
            say('You jacked the car — the driver ran for it!', 2.5);
          } else if (best.driver === 'police') {
            addHeat(50);
            say('You stole a POLICE car. The whole precinct is coming.', 3);
          } else {
            addHeat(12);
            say('Car taken.', 2);
          }
          best.driver = 'player';
          best.speed = 0;
          p.car = best;
          p.onFoot = false;
          p.speed = 0;
          state.stats.stolen += 1;
          events |= EVENT_STEAL;
        }
      }
      if ((actions & ACT_PUNCH) && p.punchCd <= 0) {
        p.punchCd = PLAYER.punchCooldown;
        events |= EVENT_PUNCH;
        const reach = PLAYER.punchRange;
        let best = null;
        let bestD = reach * reach;
        for (const ped of state.peds) {
          if (ped.state === 'down') continue;
          const d = dist2(p.x, p.y, ped.x, ped.y);
          if (d < bestD) {
            const a = angleTo(p.x, p.y, ped.x, ped.y);
            let diff = Math.abs(a - p.angle);
            if (diff > Math.PI) diff = TAU - diff;
            if (diff < 1.4) {
              bestD = d;
              best = ped;
            }
          }
        }
        if (best) {
          knockPed(best, 'punch');
          addParticles(best.x, best.y, 6, '#ffffff', 140, 0.3, 3);
        }
      }
      if ((actions & ACT_SHOOT) && p.shootCd <= 0) {
        p.shootCd = PLAYER.shootCooldown;
        if (p.hasGun && p.ammo > 0) {
          p.ammo -= 1;
          events |= EVENT_SHOT;
          addHeat(WANTED.shoot * 0.4);
          const mx = p.x + Math.cos(p.angle) * 26;
          const my = p.y + Math.sin(p.angle) * 26;
          addParticles(mx, my, 5, '#ffe08a', 200, 0.15, 3);
          let bestPed = null;
          let bestD = PLAYER.shootRange;
          for (const ped of state.peds) {
            if (ped.state === 'down') continue;
            const dx = ped.x - p.x;
            const dy = ped.y - p.y;
            const along = dx * Math.cos(p.angle) + dy * Math.sin(p.angle);
            const side = Math.abs(-dx * Math.sin(p.angle) + dy * Math.cos(p.angle));
            if (along > 10 && along < bestD && side < 22) {
              bestD = along;
              bestPed = ped;
            }
          }
          let bestCar = null;
          let bestCarD = PLAYER.shootRange;
          for (const car of state.cars) {
            if (car.driver === 'player') continue;
            const dx = car.x - p.x;
            const dy = car.y - p.y;
            const along = dx * Math.cos(p.angle) + dy * Math.sin(p.angle);
            const side = Math.abs(-dx * Math.sin(p.angle) + dy * Math.cos(p.angle));
            if (along > 10 && along < bestCarD && side < 26) {
              bestCarD = along;
              bestCar = car;
            }
          }
          if (bestPed && (!bestCar || bestD < bestCarD)) {
            knockPed(bestPed, 'shot');
            addParticles(bestPed.x, bestPed.y, 8, '#ff8fa3', 150, 0.4, 3);
          } else if (bestCar) {
            bestCar.hp -= PLAYER.shootDamage;
            addParticles(bestCar.x, bestCar.y, 6, '#ffd23f', 180, 0.3, 3);
            if (bestCar.driver === 'police') addHeat(WANTED.ramCop);
            if (bestCar.hp <= 0 && !bestCar.wrecked) wreckCar(bestCar);
          }
        } else if (p.hasGun) {
          say('Out of ammo — find more at the Gun Shop.', 2.5);
        } else {
          say('No weapon. The Gun Shop on Marina Row sells one.', 2.5);
        }
      }
    } else {
      const car = p.car;
      if (!car || car.wrecked) {
        p.onFoot = true;
        p.car = null;
        return events;
      }
      const throttle = ctl.my < 0 ? 1 : ctl.my > 0 ? -0.7 : 0; // W/up = forward
      const steer = ctl.mx;
      if (throttle > 0) car.speed += CAR.accel * throttle * dt;
      else if (throttle < 0) {
        if (car.speed > 20) car.speed -= CAR.brake * dt;
        else car.speed -= CAR.reverseAccel * 0.7 * dt;
      } else {
        car.speed -= car.speed * CAR.drag * dt;
        if (Math.abs(car.speed) < 8) car.speed = 0;
      }
      car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
      const turnAuthority = clamp(Math.abs(car.speed) / 220, 0, 1);
      car.angle += steer * CAR.turnRate * turnAuthority * (car.speed >= 0 ? 1 : -1) * dt;
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      const fixed = collideBuildings(city, nx, ny, CAR.radius);
      if (fixed.hit) {
        const impact = Math.abs(car.speed);
        if (impact > 180) {
          events |= EVENT_CRASH;
          car.hp -= impact * 0.06;
          if (p.invuln <= 0) {
            state.health -= impact * 0.02;
            p.invuln = 0.6;
          }
          addParticles(car.x, car.y, 10, '#ffd23f', 200, 0.4, 3);
        }
        car.speed *= -0.25;
        if (car.hp <= 0 && !car.wrecked) wreckCar(car);
      }
      const clamped = clampWorld(fixed.x, fixed.y, CAR.radius);
      car.x = clamped.x;
      car.y = clamped.y;
      if (Math.abs(car.speed) > 320 && Math.abs(steer) > 0.5 && rng() < 0.35) {
        state.particles.push({
          x: car.x - Math.cos(car.angle) * 22, y: car.y - Math.sin(car.angle) * 22,
          vx: 0, vy: 0, life: 0.5, maxLife: 0.5, color: '#8a8f9c', size: 7,
        });
      }
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      p.speed = car.speed;
      for (const ped of state.peds) {
        if (ped.state === 'down') continue;
        if (dist2(ped.x, ped.y, car.x, car.y) < 30 * 30) {
          if (Math.abs(car.speed) > 70) knockPed(ped, 'car');
          else {
            const a = angleTo(car.x, car.y, ped.x, ped.y);
            ped.x += Math.cos(a) * 400 * dt;
            ped.y += Math.sin(a) * 400 * dt;
          }
        }
      }
      if ((actions & ACT_ENTER) && !car.wrecked) {
        const sideX = car.x - Math.sin(car.angle) * 30;
        const sideY = car.y + Math.cos(car.angle) * 30;
        const spot = collideBuildings(city, sideX, sideY, PLAYER.radius);
        const c = clampWorld(spot.x, spot.y, PLAYER.radius);
        p.x = c.x;
        p.y = c.y;
        p.onFoot = true;
        p.speed = 0;
        car.driver = 'parked';
        car.speed = 0;
        p.car = null;
      }
    }
    return events;
  }

  function stepCarCollisions(dt) {
    const cars = state.cars;
    for (let i = 0; i < cars.length; i += 1) {
      const a = cars[i];
      if (a.wrecked) continue;
      for (let j = i + 1; j < cars.length; j += 1) {
        const b = cars[j];
        if (b.wrecked) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const min = (CAR.radius * 2) * (CAR.radius * 2);
        if (d2 >= min || d2 < 0.01) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const overlap = (CAR.radius * 2 - d) / 2;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
        const rel = Math.abs(a.speed - b.speed);
        if (rel > 120) {
          a.hp -= rel * 0.05;
          b.hp -= rel * 0.05;
          addParticles((a.x + b.x) / 2, (a.y + b.y) / 2, 8, '#ffd23f', 180, 0.35, 3);
          const tmp = a.speed;
          a.speed = b.speed * 0.5;
          b.speed = tmp * 0.5;
          if (a.driver === 'player' || b.driver === 'player') {
            if (state.player.invuln <= 0) {
              state.health -= rel * 0.015;
              state.player.invuln = 0.5;
            }
            if ((a.driver === 'police' || b.driver === 'police') && rel > 200) addHeat(WANTED.ramCop);
          }
          if (a.hp <= 0 && !a.wrecked) wreckCar(a);
          if (b.hp <= 0 && !b.wrecked) wreckCar(b);
        }
      }
      if (a.hp < 45 && !a.wrecked) {
        a.smoke -= dt;
        if (a.smoke <= 0) {
          a.smoke = 0.12;
          state.particles.push({
            x: a.x + (rng() - 0.5) * 20, y: a.y + (rng() - 0.5) * 20,
            vx: (rng() - 0.5) * 20, vy: -30 - rng() * 30, life: 0.9, maxLife: 0.9,
            color: '#6a6f7c', size: 8,
          });
        }
      }
    }
  }

  function stepPickups(dt) {
    const p = state.player;
    let events = 0;
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pk = state.pickups[i];
      pk.t += dt;
      if (dist2(p.x, p.y, pk.x, pk.y) < 34 * 34) {
        events |= EVENT_PICKUP;
        if (pk.kind === 'cash') {
          state.cash += pk.amount;
          say(`+$${pk.amount}`, 1.5);
        } else if (pk.kind === 'health') {
          state.health = Math.min(PLAYER.health, state.health + pk.amount);
          say(`+${pk.amount} health`, 2);
          spawnPickup(PLACES.hospital.x + 60, PLACES.hospital.y + 60, 'health', 50);
        } else if (pk.kind === 'gun') {
          p.hasGun = true;
          p.ammo += 24;
          say('Pistol picked up — F to shoot.', 3);
        } else if (pk.kind === 'ammo') {
          p.ammo += pk.amount;
          say(`+${pk.amount} ammo`, 2);
          const q = randomRoadPoint();
          spawnPickup(q.x, q.y, 'ammo', 24);
        }
        state.pickups.splice(i, 1);
      }
    }
    if (state.pickups.filter((pk) => pk.kind === 'cash').length < 8 && rng() < 0.02) {
      spawnCashPickups(1);
    }
    return events;
  }

  function stepMissions() {
    if (state.storyDone) return 0;
    const step = currentStep();
    if (!step) return 0;
    const p = state.player;
    if (step.kind === 'enterCar') {
      if (!p.onFoot) return completeStep();
    } else if (step.kind === 'goto' || step.kind === 'evade') {
      if (dist2(p.x, p.y, step.x, step.y) < 95 * 95) {
        if (step.needCar && p.onFoot) return 0;
        if (state.missionIndex === 1 && state.missionStep === 0) {
          addHeat(35);
          say('Package grabbed — the harbour cops spotted you!', 3.5);
        }
        return completeStep();
      }
    }
    return 0;
  }

  function stepPolice(dt) {
    const p = state.player;
    const cops = state.cars.filter((c) => c.driver === 'police');
    if (state.wanted > 0 && cops.length < Math.min(state.wanted, POLICE.maxActive)) {
      spawnPolice(p.x, p.y);
    }
    if (state.wanted === 0) {
      for (let i = state.cars.length - 1; i >= 0; i -= 1) {
        const c = state.cars[i];
        if (c.driver === 'police' && dist2(c.x, c.y, p.x, p.y) > POLICE.despawnDist * POLICE.despawnDist) {
          state.cars.splice(i, 1);
        }
      }
    }
    const nearestCop = cops.reduce((best, c) => Math.min(best, dist2(c.x, c.y, p.x, p.y)), Infinity);
    const seen = nearestCop < 520 * 520;
    state.heat = clamp(state.heat - (seen ? WANTED.decaySeen : WANTED.decayQuiet) * dt, 0, 100);
    updateWanted();
    if (p.onFoot && p.bustT >= 1.2) return EVENT_BUSTED;
    return 0;
  }

  function step(dt, ctl, actions, isTitle) {
    state.time += dt;
    if (state.messageT > 0) state.messageT -= dt;
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }

    if (isTitle) {
      state.titlePan += dt * 0.05;
      state.camX = 1800 + Math.cos(state.titlePan) * 700;
      state.camY = 1800 + Math.sin(state.titlePan * 0.7) * 700;
      for (const car of state.cars) stepTrafficCar(car, dt);
      for (const ped of state.peds) stepPed(ped, dt);
      return 0;
    }

    let events = 0;
    events |= stepPlayer(dt, ctl, actions);
    for (const car of state.cars) {
      if (car.driver === 'police') stepPoliceCar(car, dt);
      else stepTrafficCar(car, dt);
    }
    for (const ped of state.peds) stepPed(ped, dt);
    stepCarCollisions(dt);
    events |= stepPickups(dt);
    events |= stepMissions();
    events |= stepPolice(dt);

    const p = state.player;
    let traffic = 0;
    for (const car of state.cars) {
      if (car.driver === 'traffic') {
        traffic += 1;
        if (dist2(car.x, car.y, p.x, p.y) > 1500 * 1500) {
          const q = randomRoadPoint();
          car.x = q.x;
          car.y = q.y;
          car.axis = q.axis;
          car.dir = q.dir;
          car.road = q.road;
          car.laneOff = laneOff(q.axis, q.dir);
          car.angle = headingOf(q.axis, q.dir);
          car.speed = car.targetSpeed;
        }
      }
    }
    if (traffic < TRAFFIC.count && rng() < 0.1) spawnTrafficCar(p.x, p.y);
    for (const ped of state.peds) {
      if (dist2(ped.x, ped.y, p.x, p.y) > 1400 * 1400) {
        const q = randomRoadPoint();
        ped.x = q.x;
        ped.y = q.y;
        pickPedTarget(ped);
      }
    }

    if (state.wanted === 0 && state.health < PLAYER.health) {
      state.health = Math.min(PLAYER.health, state.health + 2 * dt);
    }
    if (state.health <= 0) return events | EVENT_WASTED;
    // Busted pressure fades only when no cop car is right on top of the player.
    if (p.onFoot) {
      let copNear = false;
      for (const car of state.cars) {
        if (car.driver === 'police' && dist2(car.x, car.y, p.x, p.y) < 60 * 60) {
          copNear = true;
          break;
        }
      }
      if (!copNear) p.bustT = Math.max(0, p.bustT - dt * 0.8);
    }

    state.camX = clamp(p.x, 640, 3600 - 640);
    state.camY = clamp(p.y, 360, 3340 - 360);
    return events;
  }

  // ---- deterministic screenshot scenes ----
  function placePlayerCar(x, y, angle, color) {
    const car = makeCar(x, y, 'x', 1, 'sport', 'player');
    car.angle = angle;
    car.color = color;
    car.speed = 300;
    state.cars.push(car);
    const p = state.player;
    p.car = car;
    p.onFoot = false;
    p.x = x;
    p.y = y;
    p.angle = angle;
    p.speed = 300;
    state.camX = clamp(x, 640, 3600 - 640);
    state.camY = clamp(y, 360, 3340 - 360);
    return car;
  }

  function stageShot(name) {
    reset();
    const p = state.player;
    if (name === 'start') {
      p.x = PLACES.bar.x;
      p.y = PLACES.bar.y + 150;
      p.angle = -Math.PI / 2;
      state.camX = p.x;
      state.camY = p.y;
      spawnParkedCar();
      spawnParkedCar();
      return { screen: 'title', best: 0 };
    }
    if (name === 'chase') {
      const car = placePlayerCar(1080, 720, 0, '#c0392b');
      car.speed = 420;
      state.heat = 62;
      updateWanted();
      for (let i = 0; i < 3; i += 1) {
        const cop = makeCar(1080 - 180 - i * 110, 720 + (i % 2 === 0 ? 27 : -27), 'x', 1, 'police', 'police');
        cop.angle = 0;
        cop.speed = 480;
        state.cars.push(cop);
      }
      for (let i = 0; i < 4; i += 1) spawnTrafficCar(1080, 720);
      addParticles(car.x - 30, car.y, 10, '#6a6f7c', 60, 1.0, 7);
      say('3 STARS — lose the cops and reach the safehouse!', 5);
      state.missionIndex = 2;
      state.missionStep = 0;
      return { screen: 'play', best: state.cash };
    }
    if (name === 'end') {
      state.cash = 4200;
      state.stats.earned = 4200;
      state.missionIndex = MISSIONS.length;
      state.storyDone = true;
      p.x = PLACES.safehouse.x;
      p.y = PLACES.safehouse.y + 120;
      p.angle = -Math.PI / 2;
      state.camX = p.x;
      state.camY = p.y;
      spawnParkedCar();
      say('STORY COMPLETE — Neon Harbor is yours.', 5);
      return { screen: 'complete', best: state.cash };
    }
    // 'play': driving through downtown traffic with the HUD and minimap live.
    const car = placePlayerCar(1440, 1440, 0, '#2980b9');
    car.speed = 260;
    state.cash = 1250;
    state.heat = 18;
    updateWanted();
    state.missionIndex = 0;
    state.missionStep = 1;
    for (let i = 0; i < 6; i += 1) spawnTrafficCar(1440, 1440);
    say('Deliver the car to the Chop Shop — follow the yellow marker.', 5);
    return { screen: 'play', best: state.cash };
  }

  reset();

  return {
    state,
    city,
    step,
    reset,
    loadSave,
    getSave,
    currentMission,
    currentStep,
    startMission,
    respawn,
    stageShot,
    say,
  };
}
