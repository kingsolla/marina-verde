// Marina Verde — radio (v2). Three synthesised stations, WebAudio only, no
// files and no network. R cycles stations; the HUD shows "♪ station name".
// The music drops to 40% volume on foot and rides at full volume while
// driving. Mute silences the radio too (it runs through the master gain).
import { RADIO_STATIONS } from './config.js';

export function createRadio(audio) {
  const radio = {
    station: 0,
    gain: null,
    timer: null,
    step: 0,
    bar: 0,
  };

  radio.start = function start() {
    if (!audio.ctx || radio.timer) return;
    radio.gain = audio.ctx.createGain();
    radio.gain.gain.value = 0.4;
    radio.gain.connect(audio.master);
    radio.timer = setInterval(() => radio.tick(), 105);
  };

  radio.currentName = function currentName() {
    return RADIO_STATIONS[radio.station].name;
  };

  // "Now playing" title: rotates every 8 bars (~7 s) per station (DESIGN §10.4).
  radio.currentSong = function currentSong() {
    const st = RADIO_STATIONS[radio.station];
    return st.songs[Math.floor(radio.bar / 8) % st.songs.length];
  };

  radio.cycleStation = function cycleStation() {
    radio.station = (radio.station + 1) % RADIO_STATIONS.length;
    radio.step = 0;
    radio.bar = 0;
    return radio.currentName();
  };

  // Driving = full volume, on foot = 40%.
  radio.setDriving = function setDriving(driving) {
    if (!radio.gain) return;
    radio.gain.gain.setTargetAtTime(driving ? 0.5 : 0.2, audio.ctx.currentTime, 0.3);
  };

  function note(freq, dur, type, vol) {
    const o = audio.ctx.createOscillator();
    const g = audio.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audio.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.ctx.currentTime + dur);
    o.connect(g);
    g.connect(radio.gain);
    o.start();
    o.stop(audio.ctx.currentTime + dur + 0.02);
  }

  function noise(dur, vol, freq, type = 'highpass') {
    const buf = audio.ctx.createBuffer(1, audio.ctx.sampleRate * dur, audio.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const src = audio.ctx.createBufferSource();
    src.buffer = buf;
    const f = audio.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = audio.ctx.createGain();
    g.gain.setValueAtTime(vol, audio.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.ctx.currentTime + dur);
    src.connect(f);
    f.connect(g);
    g.connect(radio.gain);
    src.start();
  }

  radio.tick = function tick() {
    if (!audio.ctx || audio.ctx.state !== 'running' || !radio.gain) return;
    const id = RADIO_STATIONS[radio.station].id;
    if (id === 'verde') {
      // Verde FM: the v1 chill bass-and-hats loop (C–A–F–G), one bar each.
      const roots = [130.81, 110.0, 87.31, 98.0];
      if (radio.step % 2 === 0) note(roots[radio.bar % 4] * (radio.step === 6 ? 1.5 : 1), 0.22, 'triangle', 0.11);
      if (radio.step % 2 === 1) noise(0.03, 0.05, 6000);
      radio.step += 1;
      if (radio.step >= 8) { radio.step = 0; radio.bar += 1; }
    } else if (id === 'neon') {
      // Neon Nights: 16th-note synthwave arpeggio in A minor, 132 BPM feel.
      const arp = [220, 261.63, 329.63, 440, 523.25, 440, 329.63, 261.63];
      note(arp[radio.step % 8], 0.1, 'square', 0.05);
      if (radio.step % 4 === 0) note(55, 0.3, 'sine', 0.12); // sub bass on the beat
      if (radio.step % 2 === 1) noise(0.02, 0.03, 8000);
      radio.step += 1;
    } else {
      // Marina Rock: square-wave power-chord riff + kick.
      const riff = [110, 110, 130.81, 110, 98, 110, 146.83, 130.81];
      if (radio.step % 2 === 0) {
        note(riff[radio.step / 2], 0.2, 'square', 0.07);
        note(riff[radio.step / 2] * 1.5, 0.2, 'square', 0.04);
      }
      if (radio.step % 4 === 0) note(60, 0.12, 'sine', 0.22); // kick
      if (radio.step % 2 === 1) noise(0.03, 0.04, 5000);
      radio.step += 1;
      if (radio.step >= 8) radio.step = 0;
    }
  };

  return radio;
}
