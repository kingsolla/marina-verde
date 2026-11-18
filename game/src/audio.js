// Marina Verde — sound. Everything is synthesised with WebAudio: no audio
// files, no network. Engine hum, police siren, pickup chime, gunshot, punch
// thud, UI blips, and a laid-back bass-and-hats loop for the city.
// v2: the music loop moved to radio.js (3 stations); audio.js adds a
// helicopter rotor loop, per-weapon gunshot pitch and a shop cash-register
// sound. Mute silences everything (all gains hang off the master gain).
export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    musicTimer: null,
    enabled: true,
    started: false,
  };

  audio.init = function init() {
    if (audio.ctx) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audio.ctx = new Ctx();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 0.5;
      audio.master.connect(audio.ctx.destination);
      audio.started = true;
      audio.startEngine();
      // Music is owned by radio.js in v2 (3 stations); audio.init only
      // starts the engine hum here.
    } catch {
      audio.ctx = null;
    }
  };

  audio.resume = function resume() {
    if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
  };

  function noiseBuffer(duration) {
    const buf = audio.ctx.createBuffer(1, audio.ctx.sampleRate * duration, audio.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  audio.startEngine = function startEngine() {
    audio.engineOsc = audio.ctx.createOscillator();
    audio.engineOsc.type = 'sawtooth';
    audio.engineOsc.frequency.value = 55;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    audio.engineGain = audio.ctx.createGain();
    audio.engineGain.gain.value = 0;
    audio.engineOsc.connect(filter);
    filter.connect(audio.engineGain);
    audio.engineGain.connect(audio.master);
    audio.engineOsc.start();
  };

  // speed01: 0 parked, 1 flat out. Called every frame while driving.
  audio.setEngine = function setEngine(speed01, on) {
    if (!audio.ctx || !audio.engineGain) return;
    const t = audio.ctx.currentTime;
    audio.engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.09 : 0, t, 0.1);
    audio.engineOsc.frequency.setTargetAtTime(55 + speed01 * 165, t, 0.08);
  };

  audio.startSiren = function startSiren() {
    if (!audio.ctx || audio.sirenOsc) return;
    audio.sirenOsc = audio.ctx.createOscillator();
    audio.sirenOsc.type = 'triangle';
    audio.sirenOsc.frequency.value = 720;
    audio.sirenGain = audio.ctx.createGain();
    audio.sirenGain.gain.value = 0.0;
    const lfo = audio.ctx.createOscillator();
    lfo.frequency.value = 0.9;
    const lfoGain = audio.ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(audio.sirenOsc.frequency);
    audio.sirenOsc.connect(audio.sirenGain);
    audio.sirenGain.connect(audio.master);
    audio.sirenOsc.start();
    lfo.start();
    audio.sirenGain.gain.setTargetAtTime(0.045, audio.ctx.currentTime, 0.4);
    audio.sirenLfo = lfo;
  };

  audio.stopSiren = function stopSiren() {
    if (!audio.ctx || !audio.sirenOsc) return;
    const t = audio.ctx.currentTime;
    audio.sirenGain.gain.setTargetAtTime(0, t, 0.2);
    const osc = audio.sirenOsc;
    const lfo = audio.sirenLfo;
    setTimeout(() => {
      try {
        osc.stop();
        lfo.stop();
      } catch { /* already stopped */ }
    }, 600);
    audio.sirenOsc = null;
    audio.sirenLfo = null;
  };

  audio.blip = function blip(freq = 880, dur = 0.12, type = 'sine', vol = 0.2) {
    if (!audio.ctx) return;
    const o = audio.ctx.createOscillator();
    const g = audio.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audio.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.ctx.currentTime + dur);
    o.connect(g);
    g.connect(audio.master);
    o.start();
    o.stop(audio.ctx.currentTime + dur);
  };

  audio.pickup = function pickup() {
    audio.blip(660, 0.1);
    setTimeout(() => audio.blip(880, 0.1), 90);
    setTimeout(() => audio.blip(1320, 0.16), 180);
  };

  audio.gunshot = function gunshot(freq = 900) {
    if (!audio.ctx) return;
    const src = audio.ctx.createBufferSource();
    src.buffer = noiseBuffer(0.14);
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const g = audio.ctx.createGain();
    g.gain.setValueAtTime(0.5, audio.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.ctx.currentTime + 0.14);
    src.connect(filter);
    filter.connect(g);
    g.connect(audio.master);
    src.start();
  };

  // Helicopter rotor: looped filtered noise with a 13 Hz thump (LFO on gain).
  audio.startHeliRotor = function startHeliRotor() {
    if (!audio.ctx || audio.heliSrc) return;
    const src = audio.ctx.createBufferSource();
    src.buffer = noiseBuffer(2);
    src.loop = true;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const g = audio.ctx.createGain();
    g.gain.value = 0.05;
    const lfo = audio.ctx.createOscillator();
    lfo.frequency.value = 13;
    const lfoGain = audio.ctx.createGain();
    lfoGain.gain.value = 0.035;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    src.connect(filter);
    filter.connect(g);
    g.connect(audio.master);
    src.start();
    lfo.start();
    audio.heliSrc = src;
    audio.heliLfo = lfo;
    audio.heliGain = g;
  };

  audio.stopHeliRotor = function stopHeliRotor() {
    if (!audio.ctx || !audio.heliSrc) return;
    const src = audio.heliSrc;
    const lfo = audio.heliLfo;
    setTimeout(() => {
      try { src.stop(); lfo.stop(); } catch { /* already stopped */ }
    }, 300);
    audio.heliSrc = null;
    audio.heliLfo = null;
  };

  // Shop cash-register cha-ching.
  audio.chaChing = function chaChing() {
    audio.cash();
    setTimeout(() => audio.blip(1568, 0.12), 160);
  };

  audio.thud = function thud() {
    audio.blip(120, 0.14, 'triangle', 0.35);
  };

  audio.cash = function cash() {
    audio.blip(988, 0.09);
    setTimeout(() => audio.blip(1319, 0.14), 100);
  };

  // A slow, sunny bass line with hats: C — A- — F — G, one bar each.
  audio.startMusic = function startMusic() {
    if (!audio.ctx || audio.musicTimer) return;
    const roots = [130.81, 110.0, 87.31, 98.0];
    let bar = 0;
    let step = 0;
    audio.musicTimer = setInterval(() => {
      if (!audio.ctx || audio.ctx.state !== 'running') return;
      if (step % 2 === 0) {
        const o = audio.ctx.createOscillator();
        const g = audio.ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = roots[bar % 4] * (step === 6 ? 1.5 : 1);
        g.gain.setValueAtTime(0.11, audio.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audio.ctx.currentTime + 0.22);
        o.connect(g);
        g.connect(audio.master);
        o.start();
        o.stop(audio.ctx.currentTime + 0.24);
      }
      if (step % 2 === 1) {
        const src = audio.ctx.createBufferSource();
        src.buffer = noiseBuffer(0.03);
        const hp = audio.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 6000;
        const g = audio.ctx.createGain();
        g.gain.setValueAtTime(0.05, audio.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audio.ctx.currentTime + 0.03);
        src.connect(hp);
        hp.connect(g);
        g.connect(audio.master);
        src.start();
      }
      step += 1;
      if (step >= 8) {
        step = 0;
        bar += 1;
      }
    }, 210);
  };

  return audio;
}
