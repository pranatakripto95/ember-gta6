// Ember Vice — audio.js
// One job: every sound is synthesised with WebAudio — no audio files.
// Engine hum, sirens, gunshots, pickups, UI clicks and a low-key ambient
// music loop. Created lazily on the first user gesture; M toggles mute.

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;

  // Am minor-ish pad progression for the Solmar evening: Am – F – C – G.
  const CHORDS = [
    [110.0, 130.8, 164.8, 220.0],
    [87.3, 130.8, 174.6, 220.0],
    [130.8, 164.8, 196.0, 261.6],
    [98.0, 146.8, 196.0, 246.9],
  ];
  const BASS = [55.0, 43.7, 65.4, 49.0];

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      // Engine: two detuned saws through a lowpass, pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 58;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      engineOsc._mate = engineOsc2;
      // Siren: a triangle that alternates two notes.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      startMusic();
      return true;
    } catch (_) {
      return false;
    }
  }

  function startMusic() {
    if (musicTimer) return;
    const barMs = 2400;
    musicTimer = setInterval(() => {
      if (!ctx || muted) return;
      const chord = CHORDS[musicStep % CHORDS.length];
      const bass = BASS[musicStep % BASS.length];
      const now = ctx.currentTime;
      for (const f of chord) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.5, now + 0.4);
        g.gain.linearRampToValueAtTime(0, now + barMs / 1000);
        o.connect(g); g.connect(musicGain);
        o.start(now); o.stop(now + barMs / 1000 + 0.1);
      }
      const b = ctx.createOscillator();
      b.type = 'triangle';
      b.frequency.value = bass;
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0, now);
      bg.gain.linearRampToValueAtTime(0.9, now + 0.2);
      bg.gain.linearRampToValueAtTime(0, now + barMs / 1000);
      b.connect(bg); bg.connect(musicGain);
      b.start(now); b.stop(now + barMs / 1000 + 0.1);
      musicStep += 1;
    }, barMs);
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!ctx) return;
    const now = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.connect(g); g.connect(master);
    o.start(now); o.stop(now + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ctx) return;
    const now = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq || 1800;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(now);
  }

  return {
    unlock() { ensure(); },
    get isMuted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    click() { if (ensure()) blip(660, 0.08, 'square', 0.12); },
    pickup() {
      if (!ensure()) return;
      blip(880, 0.12, 'sine', 0.25);
      blip(1318, 0.18, 'sine', 0.2, 0.09);
    },
    cash() {
      if (!ensure()) return;
      blip(1046, 0.1, 'sine', 0.22);
      blip(1568, 0.22, 'sine', 0.2, 0.08);
    },
    gunshot() { if (ensure()) { noise(0.16, 0.5, 2400); blip(140, 0.12, 'square', 0.3); } },
    punch() { if (ensure()) noise(0.09, 0.35, 500); },
    crash() { if (ensure()) noise(0.3, 0.4, 700); },
    horn() { if (ensure()) blip(370, 0.25, 'square', 0.1); },
    missionDone() {
      if (!ensure()) return;
      [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.22, 'sine', 0.22, i * 0.11));
    },
    busted() {
      if (!ensure()) return;
      [392, 330, 262].forEach((f, i) => blip(f, 0.3, 'triangle', 0.25, i * 0.16));
    },
    // Continuous layers, called every frame with the current state.
    update({ driving, speed01, wanted }) {
      if (!ctx) return;
      const t = ctx.currentTime;
      if (engineGain) {
        const target = driving ? 0.05 + speed01 * 0.09 : 0;
        engineGain.gain.setTargetAtTime(target, t, 0.1);
        const f = 55 + speed01 * 130;
        engineOsc.frequency.setTargetAtTime(f, t, 0.08);
        engineOsc._mate.frequency.setTargetAtTime(f * 1.02, t, 0.08);
      }
      if (sirenGain && sirenOsc) {
        const on = wanted >= 2;
        sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, t, 0.2);
        if (on) sirenOsc.frequency.setTargetAtTime((Math.floor(t * 2) % 2 === 0) ? 720 : 960, t, 0.05);
      }
    },
  };
}
