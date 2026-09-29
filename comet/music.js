/* ==========================================================
   ボス戦と燃焼中の曲

   録音を流すのではなく、その場で合成して鳴らす。
   盛り上がり（level 0〜9）が上がるほど楽器が重なる。
   ボス戦では惑星を削るほど上がり、残りわずかになると「溜め」に入って
   曲をこもらせ、スネアを詰めてせり上げ、2半音上に転調する。

   16分音符を1ステップ、16ステップで1小節、4小節で和音が1巡する。
   少し先まで予約しておき、時計は AudioContext の時刻を使う。

   Web Audio が使えないブラウザでは ok() が false を返し、sound.js が mp3 に戻す。
   ========================================================== */
const Mus = (() => {
  const AC = window.AudioContext || window.webkitAudioContext;

  const MUSIC_GAIN = 0.55;           // mp3 の BGM と大きさを揃える係数
  const LOOKAHEAD = 0.14;
  const FILTER_OPEN = 18000;
  const FILTER_DANGER = 1000;        // 核が保たないとき、曲をここまでこもらせる
  const FILTER_REACH = 2400;         // 溜めの間のこもり方

  /* 和音の進行（ニ短調）。1小節に1つ。bass は低音、tones は和音の3音（MIDI 番号） */
  const PROG = [
    { bass: 38, tones: [57, 62, 65] },   // Dm
    { bass: 46, tones: [58, 62, 65] },   // B♭
    { bass: 48, tones: [55, 60, 64] },   // C
    { bass: 45, tones: [57, 61, 64] },   // A
  ];
  /* 盛り上がりが上がりきったときの旋律。8分音符で1小節8つ、0 は休み */
  const HOOK = [
    [74, 0, 77, 0, 81, 79, 77, 74],
    [74, 0, 77, 0, 82, 81, 77, 0],
    [76, 0, 79, 0, 84, 81, 79, 76],
    [73, 0, 76, 0, 81, 0, 79, 76],
  ];
  const ARP = [0, 1, 2, 3, 2, 1, 2, 3];

  let ac = null;
  let master = null, musBus = null, lp = null, duckG = null, fxBus = null;
  let revIn = null, dlyIn = null, dly = null;
  let noiseBuf = null;
  let bgmVol = 0.4;

  const seq = {
    on: false, step: 0, next: 0,
    level: 0, bpm: 140, key: 0,
    danger: false, reach: false, reachT: 0,
    kicks: [], beats: [],
  };
  let timer = null;

  /* dev:start */
  let capture = null;
  /* dev:end */

  const ok = () => !!AC;
  const now = () => (ac ? ac.currentTime : 0);
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const stepDur = () => 60 / seq.bpm / 4;

  /* ---------- 組み立て ---------- */

  function boot() {
    if (!AC) return false;
    if (ac) { if (ac.state === 'suspended' && !document.hidden) ac.resume(); return true; }
    try { ac = new AC(); } catch (e) { return false; }

    master = ac.createGain();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ac.destination);

    musBus = ac.createGain();
    lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = FILTER_OPEN; lp.Q.value = 0.8;
    duckG = ac.createGain();
    musBus.connect(lp); lp.connect(duckG); duckG.connect(master);
    /* 曲を止めても最後まで鳴らしきる音（撃破の締めなど）はこちらを通す */
    fxBus = ac.createGain();
    fxBus.connect(master);

    const rev = ac.createConvolver();
    rev.buffer = impulse(2.4, 2.6);
    revIn = ac.createGain();
    const revOut = ac.createGain(); revOut.gain.value = 0.3;
    revIn.connect(rev); rev.connect(revOut); revOut.connect(master);

    dly = ac.createDelay(1.5);
    dlyIn = ac.createGain();
    const fb = ac.createGain(); fb.gain.value = 0.3;
    const dlyLp = ac.createBiquadFilter(); dlyLp.type = 'lowpass'; dlyLp.frequency.value = 3200;
    const dlyOut = ac.createGain(); dlyOut.gain.value = 0.26;
    dlyIn.connect(dly); dly.connect(dlyLp); dlyLp.connect(fb); fb.connect(dly);
    dlyLp.connect(dlyOut); dlyOut.connect(master);
    dly.delayTime.value = stepDur() * 3;

    noiseBuf = makeNoise(1.5);
    applyVol();

    /* 裏に回ったら止める。タイマーが間引かれて曲が途切れ途切れになるため */
    document.addEventListener('visibilitychange', () => {
      if (!ac) return;
      if (document.hidden) ac.suspend();
      else { ac.resume(); seq.next = Math.max(seq.next, now() + 0.05); }
    });
    return true;
  }

  function impulse(sec, decay) {
    const len = Math.floor(ac.sampleRate * sec);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function makeNoise(sec) {
    const len = Math.floor(ac.sampleRate * sec);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function applyVol() {
    if (!ac) return;
    musBus.gain.setTargetAtTime(bgmVol * MUSIC_GAIN, now(), 0.05);
    fxBus.gain.setTargetAtTime(bgmVol * MUSIC_GAIN, now(), 0.05);
  }

  /* ---------- 部品 ---------- */

  function env(g, t, a, peak, d, sustain, hold, r) {
    const p = g.gain;
    p.setValueAtTime(0.0001, t);
    p.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    const s = Math.max(0.0001, peak * sustain);
    p.exponentialRampToValueAtTime(s, t + a + d);
    if (hold > 0) p.setValueAtTime(s, t + a + d + hold);
    p.exponentialRampToValueAtTime(0.0001, t + a + d + hold + r);
    return t + a + d + hold + r;
  }

  function voice(bus) { const g = ac.createGain(); g.gain.value = 0; g.connect(bus); return g; }

  function osc(type, f, t, stop, dest, detune) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (detune) o.detune.value = detune;
    o.connect(dest);
    o.start(t); o.stop(stop + 0.02);
    return o;
  }

  function noise(t, stop, dest) {
    const s = ac.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    s.connect(dest);
    s.start(t, Math.random() * 1.2); s.stop(stop + 0.02);
  }

  function filter(type, f, q) {
    const b = ac.createBiquadFilter();
    b.type = type; b.frequency.value = f; b.Q.value = q || 0.7;
    return b;
  }

  function send(node, r, d) {
    if (r) { const a = ac.createGain(); a.gain.value = r; node.connect(a); a.connect(revIn); }
    if (d) { const b = ac.createGain(); b.gain.value = d; node.connect(b); b.connect(dlyIn); }
  }

  /* ---------- 楽器 ---------- */

  const INST = {
    kick(t, p, bus) {
      const g = voice(bus);
      const stop = env(g, t, 0.002, p.v || 0.9, 0.12, 0.3, 0, 0.22);
      const o = osc('sine', 160, t, stop, g);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      const c = voice(bus), hp = filter('highpass', 2500);
      hp.connect(c);
      env(c, t, 0.001, (p.v || 0.9) * 0.25, 0.01, 0.01, 0, 0.01);
      noise(t, t + 0.03, hp);
    },
    clap(t, p, bus) {
      const bp = filter('bandpass', 1300, 1.2), g = voice(bus);
      bp.connect(g);
      g.gain.setValueAtTime(0.0001, t);
      for (const o of [0, 0.011, 0.022]) {
        g.gain.setValueAtTime((p.v || 0.6) * 0.9, t + o);
        g.gain.exponentialRampToValueAtTime(0.05, t + o + 0.009);
      }
      g.gain.setValueAtTime((p.v || 0.6) * 0.7, t + 0.033);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      noise(t, t + 0.24, bp);
      send(g, 0.25, 0);
    },
    snare(t, p, bus) {
      const g = voice(bus), bp = filter('bandpass', 1900, 0.9);
      bp.connect(g);
      const stop = env(g, t, 0.001, p.v || 0.5, 0.05, 0.3, 0, 0.12);
      noise(t, stop, bp);
      const b = voice(bus);
      env(b, t, 0.001, (p.v || 0.5) * 0.5, 0.05, 0.1, 0, 0.05);
      osc('triangle', 200, t, t + 0.12, b);
    },
    hat(t, p, bus) {
      const g = voice(bus), hp = filter('highpass', 7500);
      hp.connect(g);
      const stop = env(g, t, 0.001, p.v || 0.2, p.open ? 0.08 : 0.02, 0.2, 0, p.open ? 0.18 : 0.03);
      noise(t, stop, hp);
    },
    crash(t, p, bus) {
      const g = voice(bus), hp = filter('highpass', 4200);
      hp.connect(g);
      const stop = env(g, t, 0.002, p.v || 0.3, 0.2, 0.25, 0, 1.3);
      noise(t, stop, hp);
      send(g, 0.4, 0);
    },
    bass(t, p, bus) {
      const g = voice(bus), f = filter('lowpass', 260, 6);
      f.connect(g);
      const dur = p.dur || stepDur() * 2;
      const stop = env(g, t, 0.004, p.v || 0.4, dur * 0.4, 0.55, dur * 0.3, 0.06);
      f.frequency.setValueAtTime(1000, t);
      f.frequency.exponentialRampToValueAtTime(240, t + dur * 0.8);
      osc('sawtooth', mtof(p.m), t, stop, f);
      osc('square', mtof(p.m), t, stop, f, 7);
    },
    pad(t, p, bus) {
      const g = voice(bus), f = filter('lowpass', p.bright || 900, 0.6);
      f.connect(g);
      const dur = p.dur || 2;
      const stop = env(g, t, dur * 0.3, p.v || 0.05, dur * 0.2, 0.8, dur * 0.3, dur * 0.4);
      for (const m of p.notes) { osc('sawtooth', mtof(m), t, stop, f, -8); osc('sawtooth', mtof(m), t, stop, f, 8); }
      send(g, 0.5, 0);
    },
    arp(t, p, bus) {
      const g = voice(bus), f = filter('lowpass', 2800, 2);
      f.connect(g);
      const stop = env(g, t, 0.002, p.v || 0.07, 0.05, 0.2, 0, 0.08);
      osc('square', mtof(p.m), t, stop, f);
      send(g, 0.1, 0.4);
    },
    stab(t, p, bus) {
      const g = voice(bus), f = filter('lowpass', 2200, 1);
      f.connect(g);
      const stop = env(g, t, 0.003, p.v || 0.08, 0.06, 0.3, 0, 0.12);
      for (const m of p.notes) { osc('sawtooth', mtof(m), t, stop, f, -10); osc('sawtooth', mtof(m), t, stop, f, 10); }
      send(g, 0.25, 0.2);
    },
    lead(t, p, bus) {
      const g = voice(bus), f = filter('lowpass', 3400, 1.5);
      f.connect(g);
      const dur = p.dur || stepDur() * 2;
      const stop = env(g, t, 0.01, p.v || 0.08, 0.06, 0.7, dur * 0.6, 0.12);
      const a = osc('sawtooth', mtof(p.m), t, stop, f, -7);
      const b = osc('sawtooth', mtof(p.m), t, stop, f, 7);
      const lfo = ac.createOscillator(), lg = ac.createGain();
      lfo.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(12, t + 0.25);
      lfo.connect(lg); lg.connect(a.detune); lg.connect(b.detune);
      lfo.start(t); lfo.stop(stop + 0.02);
      send(g, 0.3, 0.35);
    },
    choir(t, p, bus) {
      const g = voice(bus), f = filter('lowpass', 1800, 0.5);
      f.connect(g);
      const dur = p.dur || 2;
      const stop = env(g, t, dur * 0.35, p.v || 0.05, dur * 0.2, 0.8, dur * 0.2, dur * 0.4);
      for (const m of p.notes) { osc('triangle', mtof(m), t, stop, f, -5); osc('sine', mtof(m + 12), t, stop, f, 5); }
      send(g, 0.7, 0);
    },
    bell(t, p, bus) {
      const g = voice(bus);
      const dur = p.dur || 0.8;
      const stop = env(g, t, 0.002, p.v || 0.14, 0.05, 0.35, 0, dur);
      osc('sine', mtof(p.m), t, stop, g);
      const h = voice(bus);
      env(h, t, 0.002, (p.v || 0.14) * 0.35, 0.03, 0.2, 0, dur * 0.5);
      osc('sine', mtof(p.m) * 2.76, t, stop, h);
      send(g, 0.45, 0.25);
    },
    impact(t, p, bus) {
      const g = voice(bus);
      const stop = env(g, t, 0.003, p.v || 0.6, 0.2, 0.3, 0, 0.7);
      const o = osc('sine', 90, t, stop, g);
      o.frequency.exponentialRampToValueAtTime(32, t + 0.6);
      const n = voice(bus), f = filter('lowpass', 600);
      f.connect(n);
      env(n, t, 0.002, (p.v || 0.6) * 0.5, 0.1, 0.2, 0, 0.5);
      noise(t, t + 0.7, f);
      send(g, 0.3, 0);
    },
    riser(t, p, bus) {
      const dur = p.dur || 2;
      const g = voice(bus), f = filter('bandpass', 400, 2.5);
      f.connect(g);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(p.v || 0.2, t + dur * 0.95);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
      f.frequency.setValueAtTime(400, t);
      f.frequency.exponentialRampToValueAtTime(7000, t + dur);
      noise(t, t + dur + 0.08, f);
      send(g, 0.3, 0);
    },
  };

  function play(name, t, p, bus) {
    /* dev:start */
    if (capture) { capture.push({ n: name, t: +(t - capture.t0).toFixed(3), s: seq.step }); return; }
    /* dev:end */
    if (!ac) return;
    INST[name](t, p || {}, bus || musBus);
  }

  function duck(t, depth, dur) {
    /* dev:start */
    if (capture) return;
    /* dev:end */
    if (!ac) return;
    const g = duckG.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(1 - depth, t + 0.01);
    g.linearRampToValueAtTime(1, t + dur);
  }

  /* ---------- 曲 ---------- */

  function scheduleStep(step, t) {
    const s = step % 16;
    const bar = Math.floor(step / 16) % PROG.length;
    const L = seq.level;
    const k = seq.key;
    const ch = PROG[bar];

    if (s % 4 === 0) { seq.beats.push({ t, beat: Math.floor(step / 4) }); if (seq.beats.length > 64) seq.beats.shift(); }

    /* 溜め。小節の区切りを無視してスネアを詰め、キックは頭だけ。和音は1つ前へ引っぱる */
    if (seq.reach) {
      const el = Math.min(1, (t - seq.reachT) / 3);
      play('snare', t, { v: 0.1 + 0.35 * el });
      if (el > 0.5 && s % 2 === 1) play('snare', t + stepDur() / 2, { v: 0.08 + 0.3 * el });
      if (s % 4 === 0) { play('kick', t, { v: 0.85 }); seq.kicks.push(t); if (seq.kicks.length > 64) seq.kicks.shift(); }
      if (s === 0) play('pad', t, { notes: PROG[3].tones.map(m => m + k), dur: stepDur() * 16, v: 0.07, bright: 800 + 1600 * el });
      if (s % 2 === 0) play('bass', t, { m: PROG[3].bass + k, dur: stepDur() * 1.2, v: 0.36 });
      if (L >= 5) play('arp', t, { m: PROG[3].tones[ARP[s % 8] % 3] + 24 + k, v: 0.05 });
      return;
    }

    if (s === 0) play('pad', t, { notes: ch.tones.map(m => m + k), dur: stepDur() * 15,
      v: 0.045 + 0.03 * Math.min(L, 8) / 8, bright: 700 + 220 * L });

    const kick = (L >= 3 && s % 4 === 0) || (L >= 1 && (s === 0 || s === 8));
    if (kick) {
      play('kick', t, { v: L < 3 ? 0.75 : 0.95 });
      seq.kicks.push(t); if (seq.kicks.length > 64) seq.kicks.shift();
      if (L >= 6) duck(t, 0.32, stepDur() * 3);
    }
    if (L >= 2) {
      if (L >= 7 && s % 4 !== 0) play('bass', t, { m: ch.bass + k + (s % 2 ? 12 : 0), dur: stepDur() * 0.9, v: 0.32 });
      else if (L < 7 && s % 2 === 0) play('bass', t, { m: ch.bass + k, dur: stepDur() * 1.4, v: 0.38 });
    }
    if (L >= 3 && (s === 4 || s === 12)) play('clap', t, { v: 0.6 });
    if (L >= 4 && s % 4 === 2) play('hat', t, { v: 0.16, open: L >= 6 });
    if (L >= 4 && s % 2 === 1) play('hat', t, { v: 0.05 });
    if (L >= 5) {
      const ai = ARP[s % 8];
      const am = ai === 3 ? ch.tones[0] + 12 : ch.tones[ai];
      play('arp', t, { m: am + 12 + (s >= 8 && L >= 8 ? 12 : 0) + k, v: 0.05 });
    }
    if (L >= 6 && (s === 6 || s === 14)) play('stab', t, { notes: ch.tones.map(m => m + 12 + k), v: 0.06 });
    if (L >= 8 && s % 2 === 0) {
      const hm = HOOK[bar][s / 2];
      if (hm) play('lead', t, { m: hm + k, dur: stepDur() * 1.7, v: 0.07 });
    }
    if (L >= 9 && s === 0) play('choir', t, { notes: ch.tones.map(m => m + 12 + k), dur: stepDur() * 15, v: 0.045 });
    if (L >= 9 && s === 0 && bar === 0) play('crash', t, { v: 0.22 });
    if (L >= 5 && bar === 3 && s >= 12) play('snare', t, { v: 0.14 + (s - 12) * 0.07 });
  }

  function tick() {
    if (!ac || !seq.on) return;
    const horizon = now() + LOOKAHEAD;
    if (seq.next < now() - 0.25) seq.next = now() + 0.03;
    while (seq.next < horizon) {
      scheduleStep(seq.step, seq.next);
      seq.next += stepDur();
      seq.step++;
    }
  }

  function start() {
    if (!boot() || seq.on) return;
    seq.on = true;
    seq.step = 0;
    seq.next = now() + 0.06;
    seq.kicks.length = 0; seq.beats.length = 0;
    seq.danger = false; seq.reach = false; seq.key = 0;
    const t = now();
    lp.frequency.cancelScheduledValues(t); lp.frequency.setValueAtTime(FILTER_OPEN, t);
    duckG.gain.cancelScheduledValues(t); duckG.gain.setValueAtTime(1, t);
    musBus.gain.cancelScheduledValues(t);
    musBus.gain.setValueAtTime(0.0001, t);
    musBus.gain.exponentialRampToValueAtTime(Math.max(0.0002, bgmVol * MUSIC_GAIN), t + 0.3);
    if (!timer) timer = setInterval(tick, 25);
    tick();
  }

  function stop(fade) {
    if (!ac || !seq.on) return;
    const f = fade === undefined ? 0.6 : fade;
    const t = now();
    musBus.gain.cancelScheduledValues(t);
    musBus.gain.setValueAtTime(Math.max(0.0001, musBus.gain.value), t);
    musBus.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.02, f));
    seq.on = false; seq.reach = false;
    setTimeout(() => { if (!seq.on) applyVol(); }, (f + 0.1) * 1000);
  }

  function setLevel(v) { seq.level = Math.max(0, Math.min(9, v)); }

  function setTempo(bpm) {
    bpm = Math.max(80, Math.min(180, bpm));
    if (Math.abs(bpm - seq.bpm) < 0.01) return;
    seq.bpm = bpm;
    if (ac) dly.delayTime.setTargetAtTime(stepDur() * 3, now(), 0.1);
  }

  function setKey(semi) { seq.key = semi; }

  function filterTo(f, sec) {
    const t = now();
    lp.frequency.cancelScheduledValues(t);
    lp.frequency.setValueAtTime(lp.frequency.value, t);
    lp.frequency.exponentialRampToValueAtTime(f, t + sec);
  }

  /* 核が保たない。曲をこもらせる */
  function danger(on) {
    if (!ac || on === seq.danger) return;
    seq.danger = on;
    if (on) filterTo(FILTER_DANGER, 0.5);
    else filterTo(seq.reach ? FILTER_REACH : FILTER_OPEN, 0.3);
  }

  /* 溜め。残りわずかの惑星に入ったら、せり上げて次の小節の頭で転調して解き放つ */
  function reach(on) {
    if (!ac || !seq.on || on === seq.reach) return;
    seq.reach = on;
    const t = now();
    if (on) {
      seq.reachT = t;
      if (!seq.danger) filterTo(FILTER_REACH, 0.4);
      play('riser', t, { dur: 2.8, v: 0.2 }, fxBus);   // こもらせた側を通すと、せり上がりまで削れる
    } else {
      if (!seq.danger) filterTo(FILTER_OPEN, 0.06);
      /* 小節の頭へ飛んで解き放つ */
      seq.step = Math.ceil(seq.step / 16) * 16;
      seq.next = now() + 0.02;
      play('crash', seq.next, { v: 0.35 });
      play('impact', seq.next, { v: 0.55 });
      duck(seq.next, 0.4, 0.5);
    }
  }

  /* 惑星を落とした。駆け上がる鈴と衝撃音で締める。曲を止めても鳴りきる */
  function finale() {
    if (!boot()) return;
    const t = now();
    const root = PROG[0].tones[1] + seq.key;
    /* 短調の曲を長調の和音で締める。勝ったことが耳で分かる */
    [0, 4, 7, 12, 16, 19, 24].forEach((d, i) => play('bell', t + i * 0.06, { m: root + 12 + d, v: 0.12, dur: 1.1 }, fxBus));
    play('crash', t, { v: 0.45 }, fxBus);
    play('impact', t, { v: 0.8 }, fxBus);
    play('choir', t + 0.1, { notes: [root + 12, root + 16, root + 19], dur: 1.8, v: 0.07 }, fxBus);
  }

  /* いまの和音の i 番目の音。効果音を曲の調に合わせるのに使う */
  function tone(i) {
    const ch = PROG[Math.floor(seq.step / 16) % PROG.length];
    return ch.tones[i % 3] + 12 * Math.floor(i / 3) + seq.key;
  }

  function pulse() {
    if (!ac || !seq.on) return { kick: 0, beat: 0, phase: 0 };
    const t = now();
    let kp = 0, phase = 0, beat = 0;
    for (let i = seq.kicks.length - 1; i >= 0; i--) {
      if (seq.kicks[i] <= t) { kp = Math.exp(-(t - seq.kicks[i]) * 8); break; }
    }
    for (let i = seq.beats.length - 1; i >= 0; i--) {
      if (seq.beats[i].t <= t) { phase = (t - seq.beats[i].t) / (stepDur() * 4); beat = seq.beats[i].beat; break; }
    }
    return { kick: kp, beat, phase: Math.min(1, phase) };
  }

  function setVol(v) { bgmVol = v; applyVol(); }

  return {
    ok, boot, start, stop, playing: () => seq.on, tick,
    setLevel, setTempo, setKey, danger, reach, finale,
    tone, mtof, pulse, setVol,
    /* dev:start */
    state: () => ({ on: seq.on, level: seq.level, bpm: seq.bpm, key: seq.key, step: seq.step,
      danger: seq.danger, reach: seq.reach, ctx: ac ? ac.state : 'none',
      lp: lp ? Math.round(lp.frequency.value) : null }),
    capture(sec) {
      if (!boot()) return null;
      capture = [];
      capture.t0 = seq.next;
      const end = seq.next + sec;
      const keep = { on: seq.on, next: seq.next, step: seq.step, kicks: seq.kicks.length, beats: seq.beats.length };
      seq.on = true;
      while (seq.next < end) { scheduleStep(seq.step, seq.next); seq.next += stepDur(); seq.step++; }
      seq.on = keep.on; seq.next = keep.next; seq.step = keep.step;
      seq.kicks.length = keep.kicks; seq.beats.length = keep.beats;
      const out = capture; capture = null;
      return out;
    },
    /* dev:end */
  };
})();
