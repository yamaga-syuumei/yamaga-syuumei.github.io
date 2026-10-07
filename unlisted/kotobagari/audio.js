// 音。すべて Web Audio で合成する（音声ファイルを持たない）。
// BGM は段階（0〜4）ごとにパートを重ねる。効果音の音程は、いま鳴っている和音に合わせる。

const Sound = (() => {
  let ctx = null, master, bgmBus, sfxBus, noiseBuf;
  let volume = TUNE.volume;

  // I–V–vi–IV（ハ長調）。数字は根音からの半音
  const PROG = [
    { root: 0, tones: [0, 4, 7] },
    { root: 7, tones: [7, 11, 14] },
    { root: 9, tones: [9, 12, 16] },
    { root: 5, tones: [5, 9, 12] },
  ];
  const BASE = 48;

  const bgm = { on: false, tier: 0, e: 0, step: 0, next: 0, timer: 0, shift: 0 };

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = volume;
    bgmBus = ctx.createGain(); bgmBus.gain.value = 0.55;
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9;
    bgmBus.connect(master); sfxBus.connect(master); master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function setVolume(v) {
    volume = v;
    if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
  }

  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  function tone(t, { type = 'sine', f = 440, f2 = null, dur = 0.2, gain = 0.3, attack = 0.004, bus = sfxBus, filter = null, q = 1 }) {
    if (!ctx) return;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) {
      const bq = ctx.createBiquadFilter(); bq.type = filter.type; bq.Q.value = q;
      bq.frequency.setValueAtTime(filter.f, t);
      if (filter.f2) bq.frequency.exponentialRampToValueAtTime(filter.f2, t + dur);
      o.connect(bq); node = bq;
    }
    node.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(t, { dur = 0.1, gain = 0.2, type = 'highpass', f = 3000, f2 = null, q = 0.8, attack = 0.002, bus = sfxBus }) {
    if (!ctx) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const bq = ctx.createBiquadFilter(); bq.type = type; bq.Q.value = q;
    bq.frequency.setValueAtTime(f, t);
    if (f2) bq.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bq); bq.connect(g); g.connect(bus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- BGM

  function chordAt(step) { return PROG[Math.floor(step / 16) % PROG.length]; }
  function current() { return chordAt(bgm.step); }

  function scheduleStep(t, step) {
    const tier = bgm.tier, i = step % 16, ch = chordAt(step), sh = bgm.shift;
    const b = bgmBus;
    // キック
    if (i % 4 === 0 || (tier >= 3 && i % 8 === 6)) {
      tone(t, { f: 150, f2: 42, dur: 0.22, gain: 0.9, bus: b });
    }
    // スネア
    if (tier >= 1 && (i === 4 || i === 12)) {
      noise(t, { dur: 0.16, gain: 0.35, type: 'bandpass', f: 1800, q: 0.7, bus: b });
      tone(t, { f: 210, f2: 160, dur: 0.08, gain: 0.25, bus: b });
    }
    // ハイハット
    if (tier >= 1 && (i % 2 === 1 || tier >= 3)) {
      noise(t, { dur: i % 4 === 2 ? 0.09 : 0.035, gain: 0.09, f: 8000, bus: b });
    }
    // ベース
    if (tier >= 1 && [0, 3, 6, 8, 10, 14].includes(i)) {
      tone(t, { type: 'sawtooth', f: hz(BASE - 12 + ch.root + sh), dur: 0.18, gain: 0.22, bus: b, filter: { type: 'lowpass', f: 600, f2: 200 } });
    }
    // 和音
    if (tier >= 2 && (i === 0 || i === 8)) {
      for (const n of ch.tones) {
        tone(t, { type: 'sawtooth', f: hz(BASE + 12 + n + sh), dur: 0.9, gain: 0.05, attack: 0.03, bus: b, filter: { type: 'lowpass', f: 2400, f2: 900 } });
      }
    }
    // 旋律（分散和音）
    if (tier >= 3) {
      const n = ch.tones[[0, 1, 2, 1][i % 4]] + (i >= 8 ? 12 : 0);
      tone(t, { type: 'square', f: hz(BASE + 24 + n + sh), dur: 0.12, gain: 0.05, bus: b, filter: { type: 'lowpass', f: 4000 } });
    }
    // 最高段階：シンバルと8分の手拍子
    if (tier >= 4) {
      if (i === 0) noise(t, { dur: 1.1, gain: 0.12, f: 5000, bus: b });
      if (i % 2 === 0) noise(t, { dur: 0.05, gain: 0.07, type: 'bandpass', f: 1200, q: 1.5, bus: b });
    }
  }

  function tick() {
    if (!bgm.on || !ctx) return;
    const bpm = TUNE.bpm[0] + (TUNE.bpm[1] - TUNE.bpm[0]) * bgm.e;
    const spb = 60 / bpm / 4;
    while (bgm.next < ctx.currentTime + 0.12) {
      scheduleStep(bgm.next, bgm.step);
      bgm.next += spb;
      bgm.step++;
    }
  }

  function startBgm() {
    init(); if (!ctx) return;
    bgm.on = true; bgm.step = 0; bgm.next = ctx.currentTime + 0.05;
    clearInterval(bgm.timer); bgm.timer = setInterval(tick, 25);
  }
  function stopBgm() { bgm.on = false; clearInterval(bgm.timer); }
  function setIntensity(e, tier) {
    bgm.e = e;
    bgm.tier = tier;
    bgm.shift = tier >= 4 ? 2 : 0;
  }

  // ---------------------------------------------------------------- 効果音

  const now = () => ctx ? ctx.currentTime : 0;

  function shot() {
    init(); const t = now();
    noise(t, { dur: 0.05, gain: 0.25, f: 2500 });
    tone(t, { type: 'square', f: 1400, f2: 300, dur: 0.05, gain: 0.08 });
  }

  // 和音の音から、コンボが進むほど高い音を選ぶ
  function chordNote(combo) {
    const ch = current();
    const k = Math.min(combo, 8);
    return BASE + ch.tones[k % 3] + 12 * Math.floor(k / 3) + bgm.shift;
  }

  function hit(kind, combo) {
    init(); const t = now();
    const m = chordNote(combo);
    tone(t, { type: 'triangle', f: hz(m + 12), dur: 0.25, gain: 0.35 });
    tone(t, { type: 'square', f: hz(m + 19), dur: 0.12, gain: 0.06 });
    noise(t, { dur: 0.08, gain: 0.18, type: 'bandpass', f: 3000, q: 1 });
    if (kind === 'head') {
      tone(t + 0.03, { f: hz(m + 24), dur: 0.6, gain: 0.25 });
      tone(t + 0.03, { f: hz(m + 31), dur: 0.5, gain: 0.12 });
      tone(t, { f: 200, f2: 60, dur: 0.18, gain: 0.5 });
    }
    if (kind === 'double') {
      const ch = current();
      for (const n of ch.tones) {
        tone(t, { type: 'sawtooth', f: hz(BASE + 12 + n + bgm.shift), dur: 0.9, gain: 0.12, filter: { type: 'lowpass', f: 5000, f2: 400 } });
        tone(t, { type: 'sawtooth', f: hz(BASE + 24 + n + bgm.shift), dur: 0.7, gain: 0.07 });
      }
      tone(t, { f: 160, f2: 32, dur: 0.7, gain: 0.9 });
      noise(t, { dur: 1.4, gain: 0.3, f: 4000 });
    }
  }

  function windup(dur) {
    init(); const t = now();
    noise(t, { dur, gain: 0.25, type: 'bandpass', f: 400, f2: 6000, q: 3, attack: dur * 0.8 });
    tone(t, { type: 'sawtooth', f: 200, f2: 1200, dur, gain: 0.06, attack: dur * 0.8 });
  }

  function miss() {
    init(); const t = now();
    tone(t, { f: 110, f2: 55, dur: 0.15, gain: 0.3 });
    noise(t, { dur: 0.06, gain: 0.08, type: 'lowpass', f: 600 });
  }

  function comboBreak() {
    init(); const t = now();
    tone(t, { type: 'triangle', f: 520, f2: 260, dur: 0.25, gain: 0.15 });
    tone(t + 0.12, { type: 'triangle', f: 390, f2: 180, dur: 0.3, gain: 0.12 });
  }

  function tierUp(tier) {
    init(); const t = now();
    noise(t, { dur: 0.6, gain: 0.18, type: 'bandpass', f: 800, f2: 8000, q: 2, attack: 0.5 });
    const ch = current();
    ch.tones.forEach((n, i) => tone(t + 0.45 + i * 0.05, { type: 'square', f: hz(BASE + 24 + n + tier), dur: 0.35, gain: 0.08 }));
    if (tier >= 4) cheer(2.2);
  }

  function cheer(dur = 1.6) {
    init(); const t = now();
    for (let i = 0; i < 6; i++) {
      noise(t + i * 0.08, { dur, gain: 0.07, type: 'bandpass', f: 700 + Math.random() * 1500, q: 4, attack: 0.25 });
    }
    for (let i = 0; i < 10; i++) {
      noise(t + 0.2 + Math.random() * dur * 0.7, { dur: 0.05, gain: 0.08, type: 'bandpass', f: 2200, q: 2 });
    }
  }

  function beep(high) {
    init(); const t = now();
    tone(t, { type: 'square', f: high ? 1320 : 880, dur: high ? 0.4 : 0.12, gain: 0.12 });
  }

  function jingle(rank, max) {
    init(); const t = now();
    const good = rank / max;
    const notes = good >= 0.8 ? [0, 4, 7, 12, 16, 19, 24] : good >= 0.4 ? [0, 4, 7, 12] : [7, 4, 0];
    notes.forEach((n, i) => {
      tone(t + i * 0.09, { type: 'square', f: hz(BASE + 24 + n), dur: 0.3, gain: 0.1 });
      tone(t + i * 0.09, { type: 'triangle', f: hz(BASE + 12 + n), dur: 0.4, gain: 0.15 });
    });
    if (good >= 0.8) cheer(2.5);
  }

  // 野獣の眼光：低い唸りの後に、きらりと光る音
  function glint() {
    init(); const t = now();
    tone(t, { type: 'sawtooth', f: 55, f2: 40, dur: 1.1, gain: 0.25, attack: 0.05, filter: { type: 'lowpass', f: 300 } });
    noise(t, { dur: 0.9, gain: 0.12, type: 'lowpass', f: 200 });
    [0, 7, 12, 19, 24].forEach((n, i) => tone(t + 0.18 + i * 0.03, { f: hz(96 + n), dur: 0.9, gain: 0.08 }));
    noise(t + 0.18, { dur: 0.5, gain: 0.15, f: 9000 });
  }

  function pop() {
    init(); const t = now();
    noise(t, { dur: 0.5, gain: 0.25, type: 'lowpass', f: 2500, f2: 300 });
    tone(t, { f: 90, f2: 40, dur: 0.3, gain: 0.4 });
  }

  return { init, setVolume, startBgm, stopBgm, setIntensity, shot, hit, windup, miss, comboBreak, tierUp, cheer, beep, jingle, pop, glint };
})();
