// Drawing only: the world's state and the current screen in, pixels out. The camera
// follows the player across the 3600x3600 city and the 1280x720 view is scaled to fit
// the window. Flat shapes, canvas text for the HUD, panels for the screens.
import { CAR, FONT, HARBOR_Y, PALETTE, PLAYER, WORLD } from './config.js';
import { PLACES } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_COMPLETE = 'complete';

const VIEW = { width: 1280, height: 720 };
const PITCH = WORLD.pitch;
const HALF_ROAD = WORLD.road / 2;

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

function starPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const cashLabel = cachedLabel('$');
  const ammoLabel = cachedLabel('AMMO ');
  const speedLabel = cachedLabel('');
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function textPlain(value, x, y, size, color, align, baseline) {
    if (!fonts.has(`p${size}`)) fonts.set(`p${size}`, `${size}px ${FONT}`);
    context.font = fonts.get(`p${size}`);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function drawCity(state, city) {
    const camX = state.camX;
    const camY = state.camY;
    const left = camX - VIEW.width / 2 - 60;
    const top = camY - VIEW.height / 2 - 60;
    const right = camX + VIEW.width / 2 + 60;
    const bottom = camY + VIEW.height / 2 + 60;

    // Ground.
    context.fillStyle = PALETTE.grass;
    context.fillRect(left, top, right - left, bottom - top);
    // Harbour water.
    context.fillStyle = PALETTE.water;
    context.fillRect(left, Math.max(top, HARBOR_Y), right - left, Math.max(0, bottom - Math.max(top, HARBOR_Y)));
    context.fillStyle = PALETTE.waterDeep;
    for (let x = Math.floor(left / 90) * 90; x < right; x += 90) {
      context.fillRect(x, HARBOR_Y + 46, 46, 5);
      context.fillRect(x + 30, HARBOR_Y + 130, 60, 5);
    }
    // Pier.
    context.fillStyle = PALETTE.pier;
    context.fillRect(left, HARBOR_Y - 42, right - left, 42);
    context.fillStyle = '#6e5640';
    for (let x = Math.floor(left / 70) * 70; x < right; x += 70) context.fillRect(x, HARBOR_Y - 42, 4, 42);

    // Roads: asphalt bands, then dashed centre lines.
    context.fillStyle = PALETTE.asphalt;
    for (let k = 0; k < WORLD.roads; k += 1) {
      const c = k * PITCH;
      context.fillRect(c - HALF_ROAD, 0, WORLD.road, HARBOR_Y);
      context.fillRect(0, c - HALF_ROAD, WORLD.size, WORLD.road);
    }
    context.fillStyle = PALETTE.roadLine;
    for (let k = 0; k < WORLD.roads; k += 1) {
      const c = k * PITCH;
      for (let d = 0; d < HARBOR_Y; d += 64) {
        if ((d / 64) % 2 === 0) context.fillRect(c - 2, d, 4, 30);
        if ((d / 64) % 2 === 0) context.fillRect(d, c - 2, 30, 4);
      }
    }

    // Sidewalk blocks, parks, lots, buildings.
    for (const b of city.blocks) {
      if (b.x + b.w < left || b.x > right || b.y + b.h < top || b.y > bottom) continue;
      context.fillStyle = b.type === 'park' ? '#2a5230' : PALETTE.sidewalk;
      context.fillRect(b.x, b.y, b.w, b.h);
    }
    for (const lot of city.lots) {
      if (lot.x + lot.w < left || lot.x > right || lot.y + lot.h < top || lot.y > bottom) continue;
      context.fillStyle = '#2e3138';
      context.fillRect(lot.x, lot.y, lot.w, lot.h);
      context.strokeStyle = '#565b68';
      context.lineWidth = 2;
      for (let x = lot.x + 24; x < lot.x + lot.w - 10; x += 48) {
        context.beginPath();
        context.moveTo(x, lot.y + 8);
        context.lineTo(x, lot.y + lot.h - 8);
        context.stroke();
      }
    }
    for (const t of city.trees) {
      if (t.x < left || t.x > right || t.y < top || t.y > bottom) continue;
      context.fillStyle = PALETTE.parkTreeDark;
      context.beginPath();
      context.arc(t.x + 3, t.y + 4, t.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.parkTree;
      context.beginPath();
      context.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      context.fill();
    }
    for (const b of city.buildings) {
      if (b.x + b.w < left || b.x > right || b.y + b.h < top || b.y > bottom) continue;
      context.fillStyle = 'rgba(0,0,0,0.35)';
      context.fillRect(b.x + 5, b.y + 6, b.w, b.h);
      context.fillStyle = PALETTE.buildingEdge;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = b.color;
      context.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
      // Roof detail: inner court and vents.
      context.fillStyle = 'rgba(255,255,255,0.10)';
      context.fillRect(b.x + b.w * 0.18, b.y + b.h * 0.18, b.w * 0.64, b.h * 0.64);
      context.fillStyle = 'rgba(0,0,0,0.25)';
      context.fillRect(b.x + b.w * 0.3, b.y + b.h * 0.3, b.w * 0.14, b.h * 0.14);
      context.fillRect(b.x + b.w * 0.58, b.y + b.h * 0.55, b.w * 0.12, b.h * 0.12);
      if (b.name) {
        textPlain(b.name, b.x + b.w / 2, b.y + b.h / 2, 15, '#ffffff', 'center', 'middle');
      }
    }
  }

  function drawPickups(state) {
    for (const pk of state.pickups) {
      const bob = Math.sin(pk.t * 3) * 2;
      if (pk.kind === 'cash') {
        context.fillStyle = '#1e7a34';
        context.fillRect(pk.x - 11, pk.y - 7 + bob, 22, 14);
        context.fillStyle = PALETTE.cash;
        context.fillRect(pk.x - 9, pk.y - 5 + bob, 18, 10);
        textPlain('$', pk.x, pk.y + 3 + bob, 11, '#14532a', 'center', 'middle');
      } else if (pk.kind === 'health') {
        context.fillStyle = '#f5f5f5';
        context.fillRect(pk.x - 10, pk.y - 10 + bob, 20, 20);
        context.fillStyle = PALETTE.health;
        context.fillRect(pk.x - 3, pk.y - 8 + bob, 6, 16);
        context.fillRect(pk.x - 8, pk.y - 3 + bob, 16, 6);
      } else if (pk.kind === 'ammo') {
        context.fillStyle = '#8a6d1f';
        context.fillRect(pk.x - 10, pk.y - 7 + bob, 20, 14);
        context.fillStyle = PALETTE.ammo;
        context.fillRect(pk.x - 8, pk.y - 5 + bob, 16, 10);
        textPlain('AMMO', pk.x, pk.y + 3 + bob, 8, '#5a4510', 'center', 'middle');
      } else if (pk.kind === 'gun') {
        context.fillStyle = '#3a3f4a';
        context.fillRect(pk.x - 13, pk.y - 4 + bob, 26, 8);
        context.fillStyle = PALETTE.gun;
        context.fillRect(pk.x - 11, pk.y - 2 + bob, 22, 4);
        context.fillRect(pk.x + 4, pk.y + 2 + bob, 5, 9);
      }
    }
  }

  function drawCar(car, isPlayer, time) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    const L = car.kind === 'truck' ? 68 : CAR.length;
    const W = car.kind === 'truck' ? 30 : CAR.width;
    // Shadow.
    context.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(-L / 2 + 3, -W / 2 + 4, L, W, 7);
    context.fill();
    // Wheels.
    context.fillStyle = '#0c0c10';
    const wy = W / 2 - 2;
    context.fillRect(-L / 2 + 6, -wy - 3, 12, 6);
    context.fillRect(-L / 2 + 6, wy - 3, 12, 6);
    context.fillRect(L / 2 - 18, -wy - 3, 12, 6);
    context.fillRect(L / 2 - 18, wy - 3, 12, 6);
    // Body.
    context.fillStyle = car.wrecked ? '#3a3a42' : car.color;
    roundRect(-L / 2, -W / 2, L, W, 7);
    context.fill();
    if (car.kind === 'police') {
      context.fillStyle = PALETTE.policeDark;
      context.fillRect(-6, -W / 2, 14, W);
      textPlain('HPD', 1, 1, 10, '#ffffff', 'center', 'middle');
    } else if (car.kind === 'taxi') {
      context.fillStyle = '#1c1a26';
      context.fillRect(-8, -W / 2, 16, 4);
      context.fillRect(-8, W / 2 - 4, 16, 4);
      context.fillStyle = PALETTE.mission;
      context.fillRect(-4, -W / 2 - 5, 8, 5);
    } else if (car.kind === 'truck') {
      context.fillStyle = 'rgba(0,0,0,0.25)';
      context.fillRect(-L / 2 + 4, -W / 2 + 4, L * 0.55, W - 8);
    }
    // Cabin + windshield.
    context.fillStyle = car.wrecked ? '#22222a' : '#1d2733';
    roundRect(-8, -W / 2 + 5, 18, W - 10, 3);
    context.fill();
    context.fillStyle = 'rgba(140,190,230,0.55)';
    context.fillRect(8, -W / 2 + 6, 4, W - 12);
    // Headlights and taillights.
    context.fillStyle = '#ffe9a8';
    context.fillRect(L / 2 - 2, -W / 2 + 3, 3, 5);
    context.fillRect(L / 2 - 2, W / 2 - 8, 3, 5);
    context.fillStyle = '#ff3b30';
    context.fillRect(-L / 2 - 1, -W / 2 + 3, 3, 5);
    context.fillRect(-L / 2 - 1, W / 2 - 8, 3, 5);
    // Police light bar.
    if (car.kind === 'police' && !car.wrecked) {
      const flash = Math.floor(time * 6) % 2 === 0;
      context.fillStyle = flash ? '#ff2e2e' : '#2e6bff';
      context.fillRect(-4, -W / 2 - 2, 8, 5);
      context.fillStyle = flash ? '#2e6bff' : '#ff2e2e';
      context.fillRect(-4, W / 2 - 3, 8, 5);
    }
    // Smoke from a wreck.
    if (car.wrecked) {
      context.fillStyle = 'rgba(120,125,135,0.5)';
      context.beginPath();
      context.arc(-L / 4 + Math.sin(time * 3) * 4, -W / 4, 9, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    if (isPlayer) {
      context.strokeStyle = PALETTE.player;
      context.lineWidth = 2.5;
      context.beginPath();
      context.arc(car.x, car.y, 34, 0, Math.PI * 2);
      context.stroke();
    }
  }

  function drawPed(ped) {
    if (ped.state === 'down') {
      context.fillStyle = 'rgba(0,0,0,0.35)';
      context.beginPath();
      context.ellipse(ped.x, ped.y, 16, 8, ped.angle, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#9aa0ab';
      context.beginPath();
      context.ellipse(ped.x, ped.y, 13, 6, ped.angle, 0, Math.PI * 2);
      context.fill();
      return;
    }
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.beginPath();
    context.ellipse(ped.x, ped.y + 8, 10, 5, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.pedShirt[ped.shirt];
    context.beginPath();
    context.arc(ped.x, ped.y, 10, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(ped.x + Math.cos(ped.angle) * 3, ped.y + Math.sin(ped.angle) * 3, 5.5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#1c1a26';
    context.beginPath();
    context.arc(ped.x + Math.cos(ped.angle) * 9, ped.y + Math.sin(ped.angle) * 9, 2.5, 0, Math.PI * 2);
    context.fill();
  }

  function drawPlayer(state) {
    const p = state.player;
    if (!p.onFoot) return;
    const blink = p.invuln > 0 && Math.floor(p.invuln * 10) % 2 === 0;
    if (blink) return;
    context.fillStyle = 'rgba(0,0,0,0.35)';
    context.beginPath();
    context.ellipse(p.x, p.y + 10, 12, 6, 0, 0, Math.PI * 2);
    context.fill();
    // Body: yellow jacket, dark jeans, facing tick.
    context.fillStyle = '#2b3242';
    context.beginPath();
    context.arc(p.x, p.y + 4, 9, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(p.x, p.y - 2, 10, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(p.x + Math.cos(p.angle) * 3, p.y - 2 + Math.sin(p.angle) * 3, 5.5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#1c1a26';
    context.beginPath();
    context.arc(p.x + Math.cos(p.angle) * 8, p.y - 2 + Math.sin(p.angle) * 8, 2.5, 0, Math.PI * 2);
    context.fill();
    // Punch swing.
    if (p.punchCd > 0.28) {
      context.strokeStyle = '#ffffff';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(p.x, p.y, 22, p.angle - 0.7, p.angle + 0.7);
      context.stroke();
    }
    // Marker ring so the player is easy to find.
    context.strokeStyle = 'rgba(255,210,63,0.85)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(p.x, p.y, 18, 0, Math.PI * 2);
    context.stroke();
  }

  function drawParticles(state) {
    for (const pt of state.particles) {
      context.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      context.fillStyle = pt.color;
      context.beginPath();
      context.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawMissionMarker(world) {
    const state = world.state;
    if (state.storyDone) return;
    const step = world.currentStep();
    if (!step || step.x === undefined) return;
    const pulse = 1 + Math.sin(state.time * 5) * 0.15;
    const x = step.x;
    const y = step.y;
    const camX = state.camX;
    const camY = state.camY;
    const onScreen = Math.abs(x - camX) < VIEW.width / 2 - 40 && Math.abs(y - camY) < VIEW.height / 2 - 40;
    if (onScreen) {
      // Beam + diamond on the target.
      context.fillStyle = 'rgba(255,210,63,0.18)';
      context.fillRect(x - 26, y - 130, 52, 130);
      context.save();
      context.translate(x, y - 8);
      context.rotate(Math.PI / 4);
      context.fillStyle = PALETTE.mission;
      const s = 16 * pulse;
      context.fillRect(-s / 2, -s / 2, s, s);
      context.restore();
      context.strokeStyle = PALETTE.mission;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(x, y, 30 * pulse, 0, Math.PI * 2);
      context.stroke();
    } else {
      // Edge arrow pointing at the target.
      const dx = x - camX;
      const dy = y - camY;
      const ax = camX + Math.max(-VIEW.width / 2 + 46, Math.min(VIEW.width / 2 - 46, dx * 0.9));
      // Keep the arrow clear of the bottom hint line and the minimap corner.
      let ay = camY + Math.max(-VIEW.height / 2 + 46, Math.min(VIEW.height / 2 - 46, dy * 0.9));
      ay = Math.min(ay, camY + VIEW.height / 2 - 96);
      if (ax > camX + VIEW.width / 2 - 260 && ay < camY - VIEW.height / 2 + 240) ay = camY - VIEW.height / 2 + 240;
      const a = Math.atan2(dy, dx);
      context.save();
      context.translate(ax, ay);
      context.rotate(a);
      context.fillStyle = PALETTE.mission;
      context.beginPath();
      context.moveTo(18, 0);
      context.lineTo(-10, -12);
      context.lineTo(-10, 12);
      context.closePath();
      context.fill();
      context.restore();
      const dist = Math.round(Math.hypot(dx, dy));
      textPlain(`${dist}m`, ax, ay - 22, 15, PALETTE.mission, 'center', 'middle');
    }
  }

  function drawMinimap(world) {
    const state = world.state;
    const size = 196;
    const mx = VIEW.width - size - 16;
    const my = 16;
    const scale = size / WORLD.size;
    context.fillStyle = PALETTE.minimapBg;
    roundRect(mx - 6, my - 6, size + 12, size + 12, 8);
    context.fill();
    context.save();
    context.beginPath();
    context.rect(mx, my, size, size);
    context.clip();
    // Water strip.
    context.fillStyle = PALETTE.minimapWater;
    context.fillRect(mx, my + (HARBOR_Y - 40) * scale, size, size - (HARBOR_Y - 40) * scale);
    // Roads.
    context.strokeStyle = PALETTE.minimapRoad;
    context.lineWidth = 3;
    for (let k = 0; k < WORLD.roads; k += 1) {
      const c = k * PITCH * scale;
      context.beginPath();
      context.moveTo(mx + c, my);
      context.lineTo(mx + c, my + size);
      context.stroke();
      context.beginPath();
      context.moveTo(mx, my + c);
      context.lineTo(mx + size, my + c);
      context.stroke();
    }
    // Landmark dots.
    context.fillStyle = '#8b93a3';
    for (const key of Object.keys(PLACES)) {
      const pl = PLACES[key];
      context.fillRect(mx + pl.x * scale - 1.5, my + pl.y * scale - 1.5, 3, 3);
    }
    // Mission marker.
    if (!state.storyDone) {
      const step = world.currentStep();
      if (step && step.x !== undefined) {
        context.fillStyle = PALETTE.mission;
        const s = 7 + Math.sin(state.time * 5) * 2;
        context.save();
        context.translate(mx + step.x * scale, my + step.y * scale);
        context.rotate(Math.PI / 4);
        context.fillRect(-s / 2, -s / 2, s, s);
        context.restore();
      }
    }
    // Cars.
    context.fillStyle = '#c9c9d6';
    for (const car of state.cars) {
      if (car.driver === 'police') continue;
      context.fillRect(mx + car.x * scale - 1, my + car.y * scale - 1, 2, 2);
    }
    // Police: flashing blue/red dots.
    const flash = Math.floor(state.time * 4) % 2 === 0;
    context.fillStyle = flash ? '#ff2e2e' : '#2e6bff';
    for (const car of state.cars) {
      if (car.driver !== 'police') continue;
      context.beginPath();
      context.arc(mx + car.x * scale, my + car.y * scale, 3.5, 0, Math.PI * 2);
      context.fill();
    }
    // Player: white arrow.
    const p = state.player;
    context.save();
    context.translate(mx + p.x * scale, my + p.y * scale);
    context.rotate(p.angle);
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.moveTo(7, 0);
    context.lineTo(-5, -5);
    context.lineTo(-5, 5);
    context.closePath();
    context.fill();
    context.restore();
    context.restore();
    // Viewport rectangle.
    context.strokeStyle = 'rgba(255,255,255,0.35)';
    context.lineWidth = 1;
    context.strokeRect(
      mx + (state.camX - VIEW.width / 2) * scale,
      my + (state.camY - VIEW.height / 2) * scale,
      VIEW.width * scale,
      VIEW.height * scale,
    );
    textPlain('NEON HARBOR', mx + size / 2, my + size + 20, 11, PALETTE.hudMuted, 'center', 'middle');
  }

  function drawHud(world) {
    const state = world.state;
    const p = state.player;
    // Top-left panel: cash, health, wanted stars.
    context.fillStyle = PALETTE.hudBg;
    roundRect(14, 14, 268, 108, 10);
    context.fill();
    text(cashLabel(state.cash), 28, 52, 30, '#7ee081', 'left', 'alphabetic');
    // Health bar.
    context.fillStyle = '#3a2a30';
    roundRect(28, 64, 150, 14, 7);
    context.fill();
    context.fillStyle = state.health > 40 ? PALETTE.health : '#ff2e2e';
    const hw = Math.max(0, (state.health / PLAYER.health) * 150);
    if (hw > 0) {
      roundRect(28, 64, hw, 14, 7);
      context.fill();
    }
    textPlain('HP', 186, 76, 13, PALETTE.hudText, 'left', 'middle');
    // Wanted stars.
    for (let i = 0; i < 5; i += 1) {
      starPath(context, 40 + i * 30, 100, 11);
      context.fillStyle = i < state.wanted ? PALETTE.star : PALETTE.starEmpty;
      context.fill();
      context.strokeStyle = 'rgba(0,0,0,0.5)';
      context.lineWidth = 1;
      context.stroke();
    }
    if (state.wanted > 0) textPlain('WANTED', 200, 104, 13, PALETTE.danger, 'left', 'middle');
    // Ammo / weapon.
    if (p.hasGun) {
      text(ammoLabel(p.ammo), 28, 142, 18, PALETTE.ammo, 'left', 'alphabetic');
      textPlain('PISTOL — F to shoot', 134, 142, 14, PALETTE.hudText, 'left', 'alphabetic');
    }
    // Speed, bottom-right.
    if (!p.onFoot && p.car) {
      const mph = Math.round(Math.abs(p.speed) * 0.12);
      text(speedLabel(mph), VIEW.width - 28, VIEW.height - 24, 34, PALETTE.hudText, 'right', 'alphabetic');
      textPlain('MPH', VIEW.width - 28, VIEW.height - 52, 13, PALETTE.hudMuted, 'right', 'alphabetic');
      // Car health.
      context.fillStyle = PALETTE.hudBg;
      roundRect(VIEW.width - 228, VIEW.height - 96, 200, 22, 8);
      context.fill();
      context.fillStyle = p.car.hp > 40 ? '#4fc3f7' : '#ff2e2e';
      const cw = Math.max(0, (p.car.hp / CAR.hp) * 188);
      if (cw > 0) {
        roundRect(VIEW.width - 222, VIEW.height - 90, cw, 10, 5);
        context.fill();
      }
      textPlain('CAR', VIEW.width - 232, VIEW.height - 79, 12, PALETTE.hudText, 'right', 'middle');
    }
    // Mission objective, bottom-centre.
    if (!state.storyDone) {
      const mission = world.currentMission();
      const step = world.currentStep();
      if (mission && step) {
        const label = `${mission.title}  ·  ${step.label}`;
        const w = context.measureText(label).width;
        context.font = `bold 17px ${FONT}`;
        const tw = context.measureText(label).width;
        void w;
        context.fillStyle = PALETTE.hudBg;
        roundRect(VIEW.width / 2 - tw / 2 - 16, VIEW.height - 62, tw + 32, 34, 9);
        context.fill();
        textPlain(label, VIEW.width / 2, VIEW.height - 40, 17, PALETTE.mission, 'center', 'middle');
        if (step.x !== undefined) {
          const d = Math.round(Math.hypot(step.x - p.x, step.y - p.y));
          textPlain(`${d}m`, VIEW.width / 2, VIEW.height - 16, 14, PALETTE.hudMuted, 'center', 'middle');
        }
      }
    } else {
      textPlain('STORY COMPLETE — free roam. Grab cash, steal cars, dodge the cops.', VIEW.width / 2, VIEW.height - 24, 15, PALETTE.mission, 'center', 'middle');
    }
    // Context hint, bottom-left.
    let hint = 'WASD move · SHIFT run · SPACE punch · F shoot';
    if (!p.onFoot) hint = 'W/S drive · A/D steer · E exit car';
    else {
      let near = false;
      for (const car of state.cars) {
        if (car.driver !== 'player' && !car.wrecked && Math.hypot(car.x - p.x, car.y - p.y) < 60) {
          near = true;
          break;
        }
      }
      if (near) hint = 'E — STEAL THIS CAR';
    }
    textPlain(hint, 28, VIEW.height - 24, 15, PALETTE.hudText, 'left', 'alphabetic');
    // Busted progress.
    if (p.onFoot && p.bustT > 0.05) {
      const bw = 220;
      context.fillStyle = PALETTE.hudBg;
      roundRect(VIEW.width / 2 - bw / 2, 130, bw, 26, 8);
      context.fill();
      context.fillStyle = PALETTE.danger;
      roundRect(VIEW.width / 2 - bw / 2 + 4, 134, (bw - 8) * Math.min(1, p.bustT / 1.2), 18, 6);
      context.fill();
      textPlain('BUSTED INCOMING — RUN!', VIEW.width / 2, 122, 15, PALETTE.danger, 'center', 'alphabetic');
    }
    // Toast message.
    if (state.messageT > 0 && state.message) {
      const alpha = Math.min(1, state.messageT);
      context.globalAlpha = alpha;
      context.font = `bold 19px ${FONT}`;
      const tw = context.measureText(state.message).width;
      context.fillStyle = PALETTE.hudBg;
      roundRect(VIEW.width / 2 - tw / 2 - 18, 138, tw + 36, 36, 9);
      context.fill();
      textPlain(state.message, VIEW.width / 2, 163, 19, PALETTE.hudText, 'center', 'middle');
      context.globalAlpha = 1;
    }
    drawMinimap(world);
  }

  function drawPanel(title, titleColor, lines, prompt, accent) {
    const width = 640;
    const lineH = 30;
    const height = 190 + lines.length * lineH + 60;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = 'rgba(8, 6, 16, 0.72)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    context.fillStyle = PALETTE.panel;
    roundRect(x, y, width, height, 12);
    context.fill();
    context.strokeStyle = accent || PALETTE.panelEdge;
    context.lineWidth = 3;
    roundRect(x, y, width, height, 12);
    context.stroke();
    text(title, VIEW.width / 2, y + 78, 52, titleColor, 'center', 'alphabetic');
    for (let i = 0; i < lines.length; i += 1) {
      textPlain(lines[i], VIEW.width / 2, y + 140 + i * lineH, 19, PALETTE.hudText, 'center', 'alphabetic');
    }
    text(prompt, VIEW.width / 2, y + height - 34, 22, PALETTE.mission, 'center', 'alphabetic');
  }

  function drawTitle(world, save) {
    const state = world.state;
    // Dusk gradient over the city.
    const grad = context.createLinearGradient(0, 0, 0, VIEW.height);
    grad.addColorStop(0, 'rgba(42, 20, 63, 0.55)');
    grad.addColorStop(1, 'rgba(10, 8, 20, 0.82)');
    context.fillStyle = grad;
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    text('NEON', VIEW.width / 2, 218, 110, PALETTE.titleA, 'center', 'alphabetic');
    text('HARBOR', VIEW.width / 2, 318, 110, PALETTE.titleB, 'center', 'alphabetic');
    textPlain('An open-world crime story — a city to take, on foot or behind the wheel.', VIEW.width / 2, 356, 20, PALETTE.hudText, 'center', 'alphabetic');
    const lines = [
      'Mara Quinn is back in Neon Harbor, in debt to the fixer Otto Vane.',
      'Three jobs stand between her and a clean slate. Steal cars, dodge the',
      'Harbour Precinct, and finish the run — or just cruise the city and cause trouble.',
      '',
      'WASD / Arrows — move & drive      E — steal / exit car',
      'SPACE — punch      F — shoot      SHIFT — run      P — pause      M — mute',
    ];
    for (let i = 0; i < lines.length; i += 1) {
      textPlain(lines[i], VIEW.width / 2, 408 + i * 28, 18, i < 3 ? PALETTE.hudMuted : PALETTE.hudText, 'center', 'alphabetic');
    }
    const prompt = save
      ? `ENTER — new game      C — continue ($${save.cash}, mission ${Math.min(save.missionIndex + 1, 3)}/3${save.storyDone ? ', story done' : ''})`
      : 'Press ENTER or click to start';
    text(prompt, VIEW.width / 2, 640, 24, PALETTE.mission, 'center', 'alphabetic');
    textPlain('A fully original game: city, characters, story, art and sound made for this entry. No Rockstar material.', VIEW.width / 2, 684, 14, PALETTE.hudMuted, 'center', 'alphabetic');
  }

  /** Paint one frame: the city, the world, then the HUD or a panel for the screen. */
  function draw(world, screen, meta) {
    const state = world.state;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    // Camera transform: the view is centred on the camera point.
    context.translate(VIEW.width / 2 - state.camX, VIEW.height / 2 - state.camY);
    drawCity(state, world.city);
    drawPickups(state);
    drawMissionMarker(world);
    // Draw order: parked/traffic first, player car on top.
    const cars = state.cars;
    for (const car of cars) {
      if (car.driver !== 'player') drawCar(car, false, state.time);
    }
    for (const car of cars) {
      if (car.driver === 'player') drawCar(car, true, state.time);
    }
    for (const ped of state.peds) drawPed(ped);
    drawPlayer(state);
    drawParticles(state);
    // Back to screen space for the HUD and panels.
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      drawTitle(world, meta && meta.save);
      return;
    }
    drawHud(world);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', PALETTE.hudText, ['The city waits for no one — except right now.'], 'Press P to resume', PALETTE.hudMuted);
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', PALETTE.danger, [
        `The Harbour Precinct caught Mara. $200 bail.`,
        `Cash $${state.cash} · Missions earned $${state.stats.earned}`,
        `Cars stolen ${state.stats.stolen} · Times busted ${state.stats.busted}`,
      ], 'Press ENTER to get back out there');
    } else if (screen === SCREEN_WASTED) {
      drawPanel('WASTED', PALETTE.danger, [
        'Mara went down. St. Marina patched her up — $100.',
        `Cash $${state.cash} · Missions earned $${state.stats.earned}`,
        `Cars stolen ${state.stats.stolen} · Times wasted ${state.stats.wasted}`,
      ], 'Press ENTER to get back out there');
    } else if (screen === SCREEN_COMPLETE) {
      drawPanel('STORY COMPLETE', PALETTE.mission, [
        'All three jobs done. Otto is paid, the slate is clean,',
        'and Neon Harbor is Mara’s to cruise.',
        `Total earned $${state.stats.earned} · Cash $${state.cash}`,
        `Cars stolen ${state.stats.stolen} · Pedestrians floored ${state.stats.knocked}`,
      ], 'Press ENTER for free roam', PALETTE.mission);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
