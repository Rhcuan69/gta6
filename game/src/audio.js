// Procedural sound: everything is synthesized with WebAudio, no audio files and
// no network. Created on the first user gesture; M toggles mute.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, duration, type, volume, slideTo) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + duration);
    gain.gain.setValueAtTime(volume || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  function noise(duration, volume, lowpass) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume || 0.25;
    let node = src;
    if (lowpass) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      src.connect(filter);
      node = filter;
    }
    node.connect(gain);
    gain.connect(master);
    src.start(t);
  }

  return {
    unlock,
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.35;
      if (muted) this.engine(0);
      return muted;
    },
    isMuted() {
      return muted;
    },
    /** Continuous engine hum; speed 0 silences it. */
    engine(speedNorm) {
      if (!ensure() || muted) {
        if (engineOsc) {
          engineOsc.stop();
          engineOsc = null;
        }
        return;
      }
      if (speedNorm <= 0.02) {
        if (engineOsc) {
          engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        }
        return;
      }
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 900;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      engineOsc.frequency.setTargetAtTime(55 + speedNorm * 130, ctx.currentTime, 0.08);
      engineGain.gain.setTargetAtTime(0.05 + speedNorm * 0.05, ctx.currentTime, 0.08);
    },
    /** Two-tone police siren while any cop is chasing. */
    siren(on) {
      if (!ensure()) return;
      if (!on || muted) {
        if (sirenOsc) {
          sirenOsc.stop();
          sirenOsc = null;
          if (sirenTimer) {
            clearInterval(sirenTimer);
            sirenTimer = null;
          }
        }
        return;
      }
      if (sirenOsc) return;
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.045;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      let high = true;
      sirenOsc.frequency.value = 700;
      sirenTimer = setInterval(() => {
        if (!sirenOsc) return;
        high = !high;
        sirenOsc.frequency.setTargetAtTime(high ? 950 : 700, ctx.currentTime, 0.05);
      }, 380);
    },
    punch() {
      noise(0.12, 0.3, 500);
      tone(90, 0.12, 'sine', 0.3, 50);
    },
    shot() {
      noise(0.14, 0.4, 3000);
      tone(220, 0.1, 'square', 0.15, 60);
    },
    crash() {
      noise(0.35, 0.4, 900);
      tone(70, 0.3, 'sine', 0.35, 35);
    },
    steal() {
      tone(320, 0.09, 'square', 0.12);
      setTimeout(() => tone(420, 0.12, 'square', 0.12), 90);
    },
    pickup() {
      tone(660, 0.08, 'sine', 0.18);
      setTimeout(() => tone(990, 0.12, 'sine', 0.18), 70);
    },
    mission() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((n, i) => setTimeout(() => tone(n, 0.22, 'triangle', 0.2), i * 110));
    },
    busted() {
      tone(392, 0.3, 'sawtooth', 0.18, 196);
      setTimeout(() => tone(196, 0.5, 'sawtooth', 0.18, 98), 280);
    },
  };
}
