/* ==========================================================
   トップのバナー（焚き火版）：30秒の「ようこそ」

   深夜、焚き火のそばで語り部の話を聞く情景。
   見上げた星空から視線が下り、火が育ち、語り部の言葉が縦書きで浮かぶ。
   作品は火の上の煙の中に浮かんでは消える。
   待機中と終わったあとは、火が燃え続ける締めの1枚。

   曲はその場で合成する。72BPM、3拍子、1小節2.5秒、12小節。
   焚き火の音・風・虫の声に、ハープ風の分散和音と笛の旋律を重ねる。
   薪がはぜる音と、画面の火の粉は同じ譜面から出す。

   0–6.5   星空から焚き火へ視線が下りる
   5–10    夜が更けたら／火のそばへ
   10.6–14 ひとつ、話をしましょう（12秒に流れ星）
   15–22   遊ぶ話も、読む話も（煙の中に作品）
   22.5    火が一度大きく揺れ、ようこそお越しくださいました。
   25      ヒノガタリ／山賀秀明
   27.5–30 締め

   作品の画像はページ内のブラウザゲームのカードから拾う（先頭5件）。
   もう一方（banner.js）とどちらを出すかは banner-pick.js が決める。
   ========================================================== */
(() => {
  const root = document.getElementById('welcome');
  if (!root || root.dataset.banner !== 'bonfire') return;
  const cv = root.querySelector('.wb-cv');
  const ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) return;
  const btnPlay = root.querySelector('.wb-play');
  const btnLabel = root.querySelector('.wb-play-label');
  const btnMute = root.querySelector('.wb-mute');
  const btnSkip = root.querySelector('.wb-skip');

  const DUR = 30;
  const BT = 60 / 72;
  const BAR = BT * 3;
  const SERIF = '"Hiragino Mincho ProN","Yu Mincho","YuMincho","MS PMincho",serif';
  const INK = '#f3e7d6';
  const LINES = [
    { s: '夜が更けたら', col: 0, t: 5, out: 9.6 },
    { s: '火のそばへ', col: 1, t: 7.3, out: 9.8 },
    { s: 'ひとつ、話をしましょう', col: 0, t: 10.6, out: 14.4 },
    { s: '遊ぶ話も、', col: 0, t: 15.4, out: 21.4 },
    { s: '読む話も', col: 1, t: 17.2, out: 21.6 },
  ];
  const WELCOME_T = 22.5;
  const LOGO_T = 25;
  const SMOKE_T = [15, 16.4, 17.8, 19.2, 20.6];

  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 小道具 ---------- */
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const eOut = k => 1 - Math.pow(1 - k, 3);
  const eIO = k => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const rnd = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function seeded(a) {
    return () => {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* 火の強さ。0.15 は熾火、1 がふだんの火。ようこその瞬間に一度だけ大きく揺れる */
  function fire(t) {
    let v = t < 1.5 ? .15 : lerp(.15, 1, eIO(seg(t, 1.5, 5.5)));
    if (t >= 22.1) v += .4 * (t < WELCOME_T ? seg(t, 22.1, WELCOME_T) : Math.exp(-(t - WELCOME_T) * 1.1));
    return v;
  }

  /* ---------- 譜面 ---------- */
  const CH = {
    Am: { root: 45, tones: [57, 60, 64] },
    F:  { root: 41, tones: [57, 60, 65] },
    C:  { root: 48, tones: [55, 60, 64] },
    G:  { root: 43, tones: [55, 59, 62] },
  };
  const BARS = ['Am', 'Am', 'Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'C', 'F', 'C'];
  /* 笛の旋律。[音, 拍の位置, 長さ（拍）] */
  const MELODY = {
    4: [[76, 0, 2], [79, 2, 1]],
    5: [[74, 0, 2], [71, 2, 1]],
    6: [[72, 0, 1.5], [71, 1.5, .5], [69, 2, 1]],
    7: [[69, 0, 2], [72, 2, 1]],
    8: [[74, 0, 1], [71, 1, 1], [67, 2, 1]],
    9: [[76, 0, 2], [74, 2, 1]],
    10: [[72, 0, 1.5], [69, 1.5, 1.5]],
    11: [[72, 0, 3]],
  };

  function compose() {
    const ev = [];
    const add = (t, k, ...a) => ev.push({ t, k, a });
    const r = seeded(7);

    add(0, 'bed', 31);
    add(0, 'wind', 31);
    for (let t = .6; t < 29; t += 1.1 + r() * 1.3) add(t, 'cricket', r() * 1.6 - .8, 4300 + r() * 400);
    for (let t = .2; t < 30; ) {
      const rate = 3 + 9 * fire(t);
      t += -Math.log(1 - r()) / rate;
      const big = r() < .12;
      add(t, 'crackle', big ? .1 + r() * .08 : .015 + r() * .05, 1400 + r() * 3800, r() * 1.2 - .6);
    }
    for (let i = 0; i < 9; i++) add(WELCOME_T + i * .07 + r() * .05, 'crackle', .06 + r() * .1, 1200 + r() * 3000, r() - .5);

    add(0, 'drone', 22, [45, 52], .05);

    for (let b = 2; b < 12; b++) {
      const c = CH[BARS[b]], t0 = b * BAR;
      const pat = [c.root + 12, c.tones[0], c.tones[1], c.tones[2], c.tones[0] + 12, c.tones[1]];
      add(t0, 'harp', c.root, .07);
      const n = b < 4 ? 3 : 6;
      for (let i = 0; i < n; i++) {
        if (b === 11 && i > 0) break;
        add(t0 + i * BT / 2, 'harp', pat[i], b < 4 ? .05 : .06);
      }
      const mel = MELODY[b];
      if (mel) mel.forEach(([m, at, d]) => add(t0 + at * BT, 'flute', d * BT * .95, m, b === 11 ? .05 : .045));
      if (b >= 6) add(t0, 'strings', b === 11 ? BAR * 1.6 : BAR, c.tones, [.012, .016, .022, .03, .026, .022][b - 6]);
    }
    [48, 55, 60, 64, 67, 72, 76].forEach((m, i) => add(11 * BAR + i * .07, 'harp', m, .055));

    add(12, 'sparkle');
    add(WELCOME_T - .4, 'whoosh', .12);
    add(WELCOME_T, 'bell', 84, .05);
    add(LOGO_T, 'bell', 81, .045);
    add(27.5, 'bell', 79, .04);

    return ev.sort((a, b) => a.t - b.t);
  }
  const SCORE = compose();

  /* ---------- 音 ---------- */
  const AC = window.AudioContext || window.webkitAudioContext;
  let ac = null, noise = null, irBuf = null, mix = null;
  let t0 = 0, p0 = 0, schedI = 0, schedTimer = 0, muted = false;

  function audioBoot() {
    if (!AC) return false;
    if (!ac) {
      try { ac = new AC(); } catch (e) { return false; }
      const len = Math.floor(ac.sampleRate * 3);
      noise = ac.createBuffer(1, len, ac.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const il = Math.floor(ac.sampleRate * 3.6);
      irBuf = ac.createBuffer(2, il, ac.sampleRate);
      for (let c = 0; c < 2; c++) {
        const b = irBuf.getChannelData(c);
        for (let i = 0; i < il; i++) b[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / il, 3.2);
      }
      document.addEventListener('visibilitychange', () => {
        if (!ac || state !== 'playing') return;
        if (document.hidden) ac.suspend(); else ac.resume();
      });
    }
    if (ac.state === 'suspended') ac.resume();
    return true;
  }

  function mixer(at) {
    const out = gain(muted ? 0 : 1);
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3;
    comp.attack.value = .01; comp.release.value = .3;
    const master = gain(1.5);
    master.gain.setValueAtTime(1.5, at + 29.2);
    master.gain.linearRampToValueAtTime(.0001, at + 31.8);
    master.connect(comp); comp.connect(out); out.connect(ac.destination);

    const dry = gain(1); dry.connect(master);
    const rv = ac.createConvolver(); rv.buffer = irBuf;
    const rev = gain(1), rvOut = gain(.42);
    rev.connect(rv); rv.connect(rvOut); rvOut.connect(master);
    const dl = ac.createDelay(2); dl.delayTime.value = BT * .75;
    const dly = gain(1), fb = gain(.38), dlOut = gain(.22);
    const dlp = filt('lowpass', 2400);
    dly.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(dlOut); dlOut.connect(master);
    return { out, dry, rev, dly };
  }

  function gain(v) { const g = ac.createGain(); g.gain.value = v; return g; }
  function filt(type, f, q) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; }
  function osc(type, f, t, end) { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.start(t); o.stop(end); return o; }
  function noiseSrc(t, end) { const s = ac.createBufferSource(); s.buffer = noise; s.loop = true; s.start(t, Math.random() * 2); s.stop(end); return s; }
  function send(node, dest, v) { const g = gain(v); node.connect(g); g.connect(dest); }
  function pan(node, p) {
    if (!ac.createStereoPanner) return node;
    const s = ac.createStereoPanner(); s.pan.value = clamp(p, -1, 1);
    node.connect(s);
    return s;
  }
  function decay(g, t, v, d, a = .003) {
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(.0001, t + a + d);
  }

  const PLAY = {
    /* 炎のごうごうという低い音。火の強さに合わせて大きさが動く */
    bed(t, dur) {
      const s = noiseSrc(t, t + dur), lp = filt('lowpass', 380, .3), hp = filt('highpass', 60), g = gain(0);
      const s2 = noiseSrc(t, t + dur), bp = filt('bandpass', 1300, .7), g2 = gain(0);
      g.gain.setValueAtTime(0, t); g2.gain.setValueAtTime(0, t);
      for (let k = .25; k < dur; k += .25) {
        const f = fire(k);
        g.gain.linearRampToValueAtTime(.09 * f * (.85 + .3 * rnd(k * 40)), t + k);
        g2.gain.linearRampToValueAtTime(.012 * f, t + k);
      }
      s.connect(lp); lp.connect(hp); hp.connect(g); g.connect(mix.dry);
      s2.connect(bp); bp.connect(g2); g2.connect(mix.dry);
    },
    wind(t, dur) {
      const s = noiseSrc(t, t + dur), b = filt('bandpass', 500, .6), g = gain(0);
      g.gain.setValueAtTime(0, t);
      for (let k = 0; k < dur; k += 2) {
        b.frequency.linearRampToValueAtTime(300 + rnd(k + 3) * 450, t + k);
        g.gain.linearRampToValueAtTime(.012 + rnd(k + 7) * .028, t + k);
      }
      s.connect(b); b.connect(g);
      pan(g, -.3).connect(mix.dry);
      send(g, mix.rev, .3);
    },
    cricket(t, p, f) {
      const o = osc('sine', f, t, t + .25), g = gain(0);
      g.gain.setValueAtTime(0, t);
      for (let i = 0; i < 3; i++) {
        const ti = t + i * .055;
        g.gain.setValueAtTime(0, ti);
        g.gain.linearRampToValueAtTime(.01, ti + .012);
        g.gain.linearRampToValueAtTime(0, ti + .035);
      }
      o.connect(g);
      const out = pan(g, p);
      out.connect(mix.dry); send(out, mix.rev, .4);
    },
    crackle(t, v, f, p) {
      const d = .004 + Math.random() * .02;
      const s = noiseSrc(t, t + d + .03), b = filt('bandpass', f, 1.2), g = gain(0);
      decay(g, t, v, d, .0008);
      s.connect(b); b.connect(g);
      const out = pan(g, p);
      out.connect(mix.dry); send(out, mix.rev, .15);
    },
    drone(t, dur, notes, v) {
      const b = filt('lowpass', 700), g = gain(0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 3);
      g.gain.setValueAtTime(v, t + dur - 2);
      g.gain.linearRampToValueAtTime(0, t + dur);
      notes.forEach(m => {
        osc('sine', mtof(m), t, t + dur).connect(b);
        const tri = osc('triangle', mtof(m) * 1.002, t, t + dur), tg = gain(.3);
        tri.connect(tg); tg.connect(b);
      });
      b.connect(g); g.connect(mix.dry); send(g, mix.rev, .5);
    },
    /* ハープ風。三角波に倍音を少し足し、明るさを落としながら減衰させる */
    harp(t, m, v) {
      const f = mtof(m), len = m < 50 ? 3.2 : 2.4;
      const b = filt('lowpass', 4200, .5), g = gain(0);
      b.frequency.setValueAtTime(4200, t);
      b.frequency.exponentialRampToValueAtTime(900, t + .7);
      decay(g, t, v, len, .004);
      [['triangle', 1, 1], ['sine', 2, .3], ['sine', 3, .08]].forEach(([ty, mul, lv]) => {
        const o = osc(ty, f * mul, t, t + len + .1), og = gain(lv);
        o.connect(og); og.connect(b);
      });
      b.connect(g);
      const out = pan(g, (m - 60) / 30);
      out.connect(mix.dry); send(out, mix.rev, .5); send(out, mix.dly, .2);
    },
    /* 笛。息の音を少し混ぜ、伸ばす音にだけ揺れを付ける */
    flute(t, dur, m, v) {
      const f = mtof(m), end = t + dur + .5;
      const g = gain(0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + .12);
      g.gain.setValueAtTime(v, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + .4);
      const o = osc('sine', f, t, end), o2 = osc('triangle', f, t, end), o2g = gain(.15);
      const lfo = osc('sine', 5, t, end), lg = gain(0);
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(dur > 1 ? 9 : 3, t + Math.min(.8, dur));
      lfo.connect(lg); lg.connect(o.detune); lg.connect(o2.detune);
      o.connect(g); o2.connect(o2g); o2g.connect(g);
      const n = noiseSrc(t, end), nb = filt('bandpass', f * 2, 1.5), ng = gain(.06);
      n.connect(nb); nb.connect(ng); ng.connect(g);
      g.connect(mix.dry); send(g, mix.rev, .6); send(g, mix.dly, .18);
    },
    strings(t, dur, tones, v) {
      const b = filt('lowpass', 900, .5), g = gain(0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + Math.min(1, dur * .4));
      g.gain.setValueAtTime(v, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + 1.2);
      tones.concat([tones[0] - 12]).forEach(m => [-6, 6].forEach(d => {
        const o = osc('sawtooth', mtof(m), t, t + dur + 1.3);
        o.detune.value = d; o.connect(b);
      }));
      b.connect(g); g.connect(mix.dry); send(g, mix.rev, .6);
    },
    bell(t, m, v) {
      const f = mtof(m), g = gain(1);
      [[1, 1, 3.5], [2.76, .4, 1.8], [5.4, .2, 1.1], [8.93, .1, .7]].forEach(([mul, lv, d]) => {
        const o = osc('sine', f * mul, t, t + d + .1), og = gain(0);
        decay(og, t, v * lv, d, .002);
        o.connect(og); og.connect(g);
      });
      g.connect(mix.dry); send(g, mix.rev, .7); send(g, mix.dly, .3);
    },
    sparkle(t) {
      const o = osc('sine', 2600, t, t + 1), g = gain(0);
      o.frequency.setValueAtTime(2600, t);
      o.frequency.exponentialRampToValueAtTime(900, t + .9);
      decay(g, t, .02, .9, .05);
      o.connect(g); g.connect(mix.dry); send(g, mix.dly, .6); send(g, mix.rev, .6);
      [96, 93, 91, 88].forEach((m, i) => PLAY.bell(t + .1 + i * .09, m, .012));
    },
    whoosh(t, v) {
      const s = noiseSrc(t, t + 2.2), b = filt('lowpass', 200, .8), g = gain(0);
      b.frequency.setValueAtTime(200, t);
      b.frequency.exponentialRampToValueAtTime(1600, t + .5);
      b.frequency.exponentialRampToValueAtTime(300, t + 2);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + .45);
      g.gain.linearRampToValueAtTime(0, t + 2.1);
      s.connect(b); b.connect(g); g.connect(mix.dry); send(g, mix.rev, .4);
    },
  };

  function schedule() {
    const horizon = ac.currentTime - t0 + .4;
    while (schedI < SCORE.length && SCORE[schedI].t < horizon) {
      const e = SCORE[schedI++];
      PLAY[e.k](t0 + e.t, ...e.a);
    }
    if (schedI >= SCORE.length) { clearInterval(schedTimer); schedTimer = 0; }
  }

  function audioStart() {
    if (!audioBoot()) return false;
    t0 = ac.currentTime + .12;
    mix = mixer(t0);
    schedI = 0;
    schedule();
    schedTimer = setInterval(schedule, 60);
    return true;
  }

  function audioStop(cut) {
    clearInterval(schedTimer); schedTimer = 0;
    const m = mix;
    if (!m) return;
    if (cut) m.out.gain.setTargetAtTime(0, ac.currentTime, .08);
    setTimeout(() => m.out.disconnect(), cut ? 800 : 3500);
  }

  const clock = () => (mix ? ac.currentTime - t0 : (performance.now() - p0) / 1000);

  /* ---------- 画面 ---------- */
  let W = 0, H = 0, DPR = 1;
  let vignette = null, grainPat = null, milky = null;

  function sprite(r, g, b, soft) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${r},${g},${b},1)`);
    gr.addColorStop(soft ? .5 : .35, `rgba(${r},${g},${b},${soft ? .35 : .5})`);
    gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = gr;
    x.fillRect(0, 0, 64, 64);
    return c;
  }
  /* 炎の色は根元の白っぽい黄から、橙、赤、暗い赤へ */
  const RAMP = [[255, 246, 214], [255, 214, 120], [252, 160, 60], [236, 100, 32], [190, 52, 20], [90, 22, 10]];
  const FL = Array.from({ length: 12 }, (_, i) => {
    const k = i / 11 * (RAMP.length - 1), a = Math.floor(k), f = k - a, b = Math.min(RAMP.length - 1, a + 1);
    return sprite(...[0, 1, 2].map(j => Math.round(lerp(RAMP[a][j], RAMP[b][j], f))), false);
  });
  const SMOKE = sprite(150, 140, 135, true);
  const SKYGLOW = sprite(110, 130, 190, true);

  const grainCv = document.createElement('canvas');
  grainCv.width = grainCv.height = 128;
  {
    const g = grainCv.getContext('2d'), id = g.createImageData(128, 128);
    for (let i = 0; i < 128 * 128; i++) {
      const v = Math.random() * 255;
      id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v;
      id.data[i * 4 + 3] = 255;
    }
    g.putImageData(id, 0, 0);
  }

  const STARS = Array.from({ length: 240 }, (_, i) => ({
    x: rnd(i), y: rnd(i + 300) * 1.25 - .35, r: .4 + Math.pow(rnd(i + 600), 3) * 1.4,
    tw: 1 + rnd(i + 900) * 3, ph: rnd(i + 1200) * 6, warm: rnd(i + 1500) < .2,
  }));
  const TREES = Array.from({ length: 70 }, (_, i) => ({ x: rnd(i + 2000) * 1.1 - .05, h: .05 + rnd(i + 2100) * .09, w: .012 + rnd(i + 2200) * .02 }));

  function resize() {
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const oldH = H;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    vignette = ctx.createRadialGradient(W / 2, H * .7, Math.min(W, H) * .25, W / 2, H * .6, Math.max(W, H) * .8);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,.65)');
    grainPat = ctx.createPattern(grainCv, 'repeat');
    milky = milkyWay();
    if (oldH && oldH !== H) parts.length = 0;
    if (state !== 'playing') { if (!parts.length) warm(); still(performance.now() / 1000); }
  }

  /* 天の川。左下から右上へ斜めに流れる帯。空の上の方まで描いておき、見上げた画面でも映るようにする */
  function milkyWay() {
    const c = document.createElement('canvas'), h = H * 1.4;
    c.width = Math.round(W * DPR); c.height = Math.round(h * DPR);
    const x = c.getContext('2d');
    x.scale(DPR, DPR);
    const r = seeded(11);
    const at = k => [k * W, h * (.95 - k * .8)];
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 70; i++) {
      const [px, py] = at(r()), s = H * (.12 + r() * .22);
      x.globalAlpha = .035 + r() * .03;
      x.drawImage(i % 3 ? SKYGLOW : SMOKE, px - s, py - s + (r() - .5) * H * .15, s * 2, s * 2);
    }
    for (let i = 0; i < 1400; i++) {
      const [px, py] = at(r()), d = (r() + r() + r() - 1.5) * H * .22;
      x.globalAlpha = .15 + r() * .45;
      x.fillStyle = r() < .15 ? '#ffe6c8' : '#e2e9ff';
      const sz = r() < .9 ? .6 : 1.1;
      x.fillRect(px + d * .55, py + d, sz, sz);
    }
    return c;
  }

  /* 場の配置。焚き火を中心に、語り部は右、言葉はその右、名前は左 */
  function lay() {
    const cx = W / 2, base = H * .87, fw = H * .3;
    const fs = Math.max(11, Math.min(H * .062, W * .05));
    const off = Math.max(W * .17, H * .42);
    const fsL = Math.max(16, Math.min(H * .11, W * .09));
    return {
      cx, base, fw, fs, fsL,
      col: i => cx + off + (1 - i) * fs * 1.7,
      top: H * .12,
      logoX: cx - off,
      horizon: H * .78,
    };
  }

  /* ---------- 炎・煙・火の粉 ---------- */
  const parts = [];
  let flameAcc = 0, smokeAcc = 0, emberAcc = 0;

  function emit(t, tm, dt) {
    const L = lay(), I = fire(t);
    flameAcc += 150 * I * dt;
    while (flameAcc >= 1) {
      flameAcc -= 1;
      const r = Math.random;
      parts.push({
        k: 0, x: L.cx + (r() + r() + r() - 1.5) * L.fw * .3, y: L.base - r() * L.fw * .05,
        vx: 0, vy: -H * (.24 + r() * .22) * (.6 + .4 * I), life: 0, max: .55 + r() * .5,
        r: L.fw * (.1 + r() * .08) * (.7 + .3 * Math.min(1.3, I)), ph: r() * 6,
      });
    }
    smokeAcc += 5 * I * dt;
    while (smokeAcc >= 1) {
      smokeAcc -= 1;
      parts.push({ k: 1, x: L.cx + (Math.random() - .5) * L.fw * .3, y: L.base - L.fw * .7, vx: H * .02, vy: -H * (.05 + Math.random() * .04), life: 0, max: 4 + Math.random() * 2, r: H * .05, ph: Math.random() * 6 });
    }
    emberAcc += (9 * I + (t < 7 ? 6 : 0)) * dt;
    while (emberAcc >= 1) { emberAcc -= 1; ember(L, .6, t < 7); }
  }

  function ember(L, sp, high) {
    const r = Math.random;
    parts.push({ k: 2, x: L.cx + (r() - .5) * L.fw * (high ? 3 : .5), y: L.base - L.fw * .25 * r(), vx: (r() - .5) * H * .08 * sp, vy: -H * (high ? .32 + r() * .2 : (.15 + r() * .25) * sp), life: 0, max: high ? 3.5 + r() * 2 : 1.5 + r() * 2.2, r: .6 + r() * 1.4, ph: r() * 6, high });
  }

  function stepParts(dt, tm) {
    const cx = W / 2;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life > p.max) { parts.splice(i, 1); continue; }
      if (p.k === 0) {
        p.vx += ((cx - p.x) * 2.2 + Math.sin(tm * 9 + p.ph) * H * .15 + H * .03) * dt;
        p.vy -= H * .25 * dt;
      } else if (p.k === 1) {
        p.vx += Math.sin(tm * .7 + p.ph) * H * .004 * dt;
        p.r += H * .035 * dt;
      } else {
        p.vx += Math.sin(p.life * 2.5 + p.ph) * H * .05 * dt;
        p.vy *= Math.pow(p.high ? .93 : .7, dt);
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    if (parts.length > 700) parts.splice(0, parts.length - 700);
  }

  /* 待機中に開いたとき、火がもう燃えている状態から始める */
  function warm() {
    for (let i = 0; i < 90; i++) { emit(40, i / 30, 1 / 30); stepParts(1 / 30, i / 30); }
  }

  function drawSmoke() {
    ctx.save();
    for (const p of parts) {
      if (p.k !== 1) continue;
      const k = p.life / p.max;
      ctx.globalAlpha = .07 * Math.sin(Math.PI * k);
      ctx.drawImage(SMOKE, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    ctx.restore();
  }

  function drawFlames(light) {
    const L = lay();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = .3 * light;
    const gw = L.fw * 1.3;
    ctx.drawImage(FL[2], L.cx - gw, L.base - gw * .35, gw * 2, gw * .7);
    for (const p of parts) {
      if (p.k !== 0) continue;
      const k = p.life / p.max, r = p.r * (1 - k * .65);
      ctx.globalAlpha = Math.min(1, k * 8) * Math.pow(1 - k, .8) * .36;
      ctx.drawImage(FL[Math.min(11, Math.floor(k * 12 + 1))], p.x - r, p.y - r * 1.6, r * 2, r * 3.2);
    }
    for (const p of parts) {
      if (p.k !== 2) continue;
      const k = p.life / p.max;
      const a = (1 - k) * (.55 + .45 * Math.sin(p.life * 13 + p.ph));
      ctx.globalAlpha = a * .3;
      ctx.drawImage(FL[3], p.x - p.r * 3, p.y - p.r * 3, p.r * 6, p.r * 6);
      ctx.globalAlpha = a;
      ctx.fillStyle = k < .4 ? '#ffd27a' : '#f0803f';
      ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
    }
    ctx.restore();
  }

  /* ---------- 景色 ---------- */
  function sky(sy, tm) {
    const L = lay();
    const g = ctx.createLinearGradient(0, -H * .4 + sy * .3, 0, L.horizon + sy);
    g.addColorStop(0, '#03040a');
    g.addColorStop(.6, '#080d1c');
    g.addColorStop(1, '#141c33');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (milky) ctx.drawImage(milky, 0, -H * .4 + sy * .3, W, H * 1.4);
    for (const s of STARS) {
      const y = s.y * H + sy * .3;
      if (y < -2 || y > L.horizon + sy) continue;
      const tw = .55 + .45 * Math.sin(tm * s.tw + s.ph);
      ctx.globalAlpha = Math.min(1, tw * (.45 + s.r * .5));
      ctx.fillStyle = s.warm ? '#ffe2c0' : '#dfe8ff';
      ctx.fillRect(s.x * W - s.r / 2, y - s.r / 2, s.r, s.r);
      if (s.r > 1.4) {
        ctx.globalAlpha *= .35;
        ctx.fillRect(s.x * W - s.r * 2, y - .25, s.r * 4, .5);
        ctx.fillRect(s.x * W - .25, y - s.r * 2, .5, s.r * 4);
      }
    }
    ctx.globalAlpha = 1;
  }

  function shootingStar(t) {
    const k = seg(t, 12, 12.9);
    if (k <= 0 || k >= 1) return;
    const e = eOut(k);
    const x0 = W * .82, y0 = H * .06, x1 = W * .42, y1 = H * .3;
    const hx = lerp(x0, x1, e), hy = lerp(y0, y1, e);
    const tx = lerp(x0, x1, Math.max(0, e - .25)), ty = lerp(y0, y1, Math.max(0, e - .25));
    const g = ctx.createLinearGradient(tx, ty, hx, hy);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(255,250,235,${.9 * (1 - k)})`);
    ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
  }

  function land(light) {
    const L = lay();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = light;
    const g = ctx.createRadialGradient(L.cx, L.base, 0, L.cx, L.base, H * 1.1);
    g.addColorStop(0, 'rgba(240,128,63,.22)'); g.addColorStop(1, 'rgba(240,128,63,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H * 1.2);
    ctx.restore();

    ctx.fillStyle = '#05070d';
    ctx.beginPath();
    ctx.moveTo(0, H * 1.2);
    ctx.lineTo(0, L.horizon);
    for (const tr of TREES) {
      const x = tr.x * W, h = tr.h * H, w = tr.w * H;
      ctx.lineTo(x - w, L.horizon);
      ctx.lineTo(x - w * .5, L.horizon - h * .45);
      ctx.lineTo(x - w * .75, L.horizon - h * .45);
      ctx.lineTo(x, L.horizon - h);
      ctx.lineTo(x + w * .75, L.horizon - h * .45);
      ctx.lineTo(x + w * .5, L.horizon - h * .45);
      ctx.lineTo(x + w, L.horizon);
    }
    ctx.lineTo(W, L.horizon);
    ctx.lineTo(W, H * 1.2);
    ctx.fill();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = light;
    ctx.translate(L.cx, L.base);
    ctx.scale(1, .22);
    const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, L.fw * 3);
    gg.addColorStop(0, 'rgba(250,140,60,.45)'); gg.addColorStop(1, 'rgba(250,140,60,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(-L.fw * 3, -L.fw * 3, L.fw * 6, L.fw * 6);
    ctx.restore();
  }

  function logs(light) {
    const L = lay(), lw = L.fw * .95, lh = L.fw * .11;
    [-.22, .2].forEach((a, i) => {
      ctx.save();
      ctx.translate(L.cx, L.base + lh * .2);
      ctx.rotate(a);
      ctx.fillStyle = '#1b100b';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-lw / 2, -lh / 2, lw, lh, lh / 2); else ctx.rect(-lw / 2, -lh / 2, lw, lh);
      ctx.fill();
      const g = ctx.createLinearGradient(0, -lh / 2, 0, lh / 2);
      g.addColorStop(0, `rgba(255,150,70,${.55 * light})`); g.addColorStop(.6, 'rgba(255,150,70,0)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.fillStyle = `rgba(255,190,110,${.6 * light})`;
      ctx.beginPath(); ctx.ellipse(i ? lw / 2 : -lw / 2, 0, lh * .2, lh * .45, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
  }

  /* 語り部。火の右に座り、火の側の輪郭だけが照らされる */
  function teller(light, tm) {
    const L = lay(), s = H * .24;
    const x = L.cx + L.fw * .95, y = L.base + s * .04;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(.3 * s, 0);
      ctx.bezierCurveTo(.36 * s, -.25 * s, .3 * s, -.5 * s, .17 * s, -.62 * s);
      ctx.bezierCurveTo(.2 * s, -.72 * s, .15 * s, -.9 * s, .02 * s, -.93 * s);
      ctx.bezierCurveTo(-.1 * s, -.95 * s, -.17 * s, -.85 * s, -.15 * s, -.74 * s);
      ctx.lineTo(-.1 * s, -.7 * s);
      ctx.bezierCurveTo(-.18 * s, -.66 * s, -.24 * s, -.55 * s, -.24 * s, -.45 * s);
      ctx.bezierCurveTo(-.3 * s, -.4 * s, -.36 * s, -.34 * s, -.38 * s, -.3 * s);
      ctx.bezierCurveTo(-.36 * s, -.26 * s, -.3 * s, -.25 * s, -.28 * s, -.24 * s);
      ctx.bezierCurveTo(-.4 * s, -.24 * s, -.5 * s, -.15 * s, -.46 * s, -.02 * s);
      ctx.lineTo(-.4 * s, 0);
      ctx.closePath();
      ctx.moveTo(-.37 * s, -.31 * s);
      ctx.lineTo(-.77 * s, .02 * s);
      ctx.lineTo(-.75 * s, .04 * s);
      ctx.lineTo(-.35 * s, -.28 * s);
      ctx.closePath();
    };
    const bob = Math.sin(tm * .9) * s * .006;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.save();
    ctx.translate(-s * .018, 0);
    path();
    ctx.fillStyle = `rgba(255,140,60,${.75 * light})`;
    ctx.fill();
    ctx.restore();
    path();
    ctx.fillStyle = '#06070b';
    ctx.fill();
    ctx.restore();
  }

  /* ---------- 作品と言葉 ---------- */
  let works = null;
  function loadWorks() {
    if (works) return;
    works = [...document.querySelectorAll('.wg-more-grid .card-thumb')].slice(0, SMOKE_T.length).map(el => {
      const w = { title: el.alt, pic: null };
      const img = new Image();
      img.onload = () => { w.pic = haze(img); };
      img.src = el.currentSrc || el.src;
      return w;
    });
  }

  /* 煙に映る絵。暖色に寄せ、縁を楕円にぼかす */
  function haze(img) {
    const c = document.createElement('canvas');
    c.width = 320; c.height = 180;
    const x = c.getContext('2d');
    const iw = img.naturalWidth, ih = img.naturalHeight, s = Math.max(320 / iw, 180 / ih);
    x.drawImage(img, (iw - 320 / s) / 2, (ih - 180 / s) / 2, 320 / s, 180 / s, 0, 0, 320, 180);
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = 'rgb(150,95,60)';
    x.fillRect(0, 0, 320, 180);
    x.globalCompositeOperation = 'destination-in';
    x.translate(160, 90);
    x.scale(1, .5625);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 160);
    g.addColorStop(.45, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(-160, -160, 320, 320);
    return c;
  }

  function visions(t) {
    if (!works) return;
    const L = lay();
    const w = Math.min(W * .36, H * .8), h = w * .5625;
    SMOKE_T.forEach((ts, i) => {
      const wk = works[i];
      const k = seg(t, ts, ts + 3.2);
      if (!wk || !wk.pic || k <= 0 || k >= 1) return;
      const a = Math.pow(Math.sin(Math.PI * k), 1.5), ta = Math.pow(Math.sin(Math.PI * k), 6);
      const x = L.cx + (i % 2 ? 1 : -1) * Math.min(W * .07, w * .3) + Math.sin(t * .8 + i) * W * .01;
      const y = L.base - L.fw * 1.1 - h / 2 - k * H * .12;
      const s = 1 + k * .08;
      ctx.save();
      ctx.globalAlpha = a * .75;
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(wk.pic, x - w * s / 2, y - h * s / 2, w * s, h * s);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = ta * .8;
      ctx.fillStyle = INK;
      ctx.font = `600 ${Math.max(10, L.fs * .62)}px ${SERIF}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(wk.title, x, y + h * s * .42);
      ctx.restore();
    });
  }

  /* 縦書き。句読点はマスの右上に寄せる */
  function vtext(str, x, y, fs, t, t0, step, alpha) {
    if (alpha <= 0) return;
    const cs = [...str];
    ctx.save();
    ctx.font = `600 ${fs}px ${SERIF}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = INK;
    ctx.shadowColor = 'rgba(240,128,63,.55)';
    ctx.shadowBlur = fs * .5;
    cs.forEach((c, i) => {
      const k = seg(t, t0 + i * step, t0 + i * step + .8);
      if (k <= 0) return;
      const punct = c === '、' || c === '。';
      ctx.globalAlpha = alpha * k;
      ctx.fillText(c, x + (punct ? fs * .55 : 0), y + fs * (i * 1.08 + .5) + (1 - eOut(k)) * fs * .35 - (punct ? fs * .55 : 0));
    });
    ctx.restore();
  }

  function words(t) {
    const L = lay();
    for (const ln of LINES) {
      if (t < ln.t || t > ln.out + 1) continue;
      vtext(ln.s, L.col(ln.col), L.top, L.fs, t, ln.t, .14, 1 - seg(t, ln.out, ln.out + .9));
    }
    vtext('ようこそ', L.col(0), L.top, L.fs, t, WELCOME_T, .16, 1);
    vtext('お越しくださいました。', L.col(1), L.top, L.fs, t, WELCOME_T + .7, .13, 1);
    vtext('ヒノガタリ', L.logoX, L.top, L.fsL, t, LOGO_T, .28, 1);
    const sf = Math.max(10, H * .034);
    vtext('山賀秀明', L.logoX - L.fsL * .95, L.top + L.fsL * 2.2, sf, t, LOGO_T + 1.6, .12, .8);
  }

  /* ---------- 描く ---------- */
  function scene(t, tm) {
    const light = fire(t) * (.88 + .08 * Math.sin(tm * 13.1) * Math.sin(tm * 7.3) + .04 * Math.sin(tm * 23.7));
    const sy = H * .6 * (1 - eIO(seg(t, 0, 6.5)));
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    sky(sy, tm);
    shootingStar(t);
    if (sy > 1) {
      const g = ctx.createLinearGradient(0, H * .55, 0, H);
      g.addColorStop(0, 'rgba(240,128,63,0)'); g.addColorStop(1, `rgba(240,128,63,${.22 * light * Math.min(1, sy / (H * .2))})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, H * .55, W, H * .45);
    }
    ctx.save();
    ctx.translate(0, sy);
    land(light);
    drawSmoke();
    visions(t);
    logs(light);
    drawFlames(light);
    teller(light, tm);
    ctx.restore();
    words(t);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
    if (grainPat) {
      ctx.save();
      ctx.globalAlpha = .04;
      const f = Math.floor(tm * 18);
      ctx.translate(-rnd(f) * 128, -rnd(f + 99) * 128);
      ctx.fillStyle = grainPat;
      ctx.fillRect(0, 0, W + 128, H + 128);
      ctx.restore();
    }
    const fade = 1 - seg(t, 0, 1.2);
    if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, W, H); }
  }

  const END = 40;
  function still(tm) { if (W) scene(END, tm); }

  /* ---------- 進行 ---------- */
  let state = 'poster';
  let raf = 0, lastT = 0, onScreen = true, cues = [], cueI = 0;

  function makeCues() {
    return SCORE.filter(e => e.k === 'crackle' && e.a[0] > .09).map(e => ({
      t: e.t, f: () => { const L = lay(); for (let i = 0; i < 4; i++) ember(L, 1.4); },
    }));
  }

  function frame() {
    raf = 0;
    if (state !== 'playing') return;
    const t = Math.max(0, clock());
    if (t >= DUR) { finish(false); return; }
    const dt = clamp(t - lastT, 0, .05);
    lastT = t;
    while (cueI < cues.length && cues[cueI].t <= t) cues[cueI++].f();
    if (onScreen) {
      emit(t, t, dt);
      stepParts(dt, t);
      scene(t, t);
    }
    raf = requestAnimationFrame(frame);
  }

  let idleLast = 0;
  function idle(now) {
    raf = 0;
    if (state === 'playing') return;
    const dt = clamp((now - idleLast) / 1000, 0, .05), tm = now / 1000;
    idleLast = now;
    emit(END, tm, dt);
    stepParts(dt, tm);
    still(tm);
    if (onScreen && !reduce) raf = requestAnimationFrame(idle);
  }
  function kickIdle() {
    if (raf || state === 'playing' || reduce || !onScreen) return;
    idleLast = performance.now();
    raf = requestAnimationFrame(idle);
  }

  function play() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (mix) audioStop(true);
    mix = null;
    loadWorks();
    parts.length = 0;
    cues = makeCues(); cueI = 0; lastT = 0;
    if (!audioStart()) p0 = performance.now();
    state = 'playing';
    root.classList.add('is-playing');
    raf = requestAnimationFrame(frame);
  }

  function finish(cut) {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    audioStop(cut);
    mix = null;
    state = 'end';
    root.classList.remove('is-playing');
    btnLabel.textContent = 'もう一度聞く';
    still(performance.now() / 1000);
    kickIdle();
  }

  btnPlay.addEventListener('click', play);
  btnSkip.addEventListener('click', () => finish(true));
  btnMute.addEventListener('click', () => {
    muted = !muted;
    btnMute.setAttribute('aria-pressed', String(muted));
    btnMute.textContent = muted ? '音を出す' : '消音';
    if (mix) mix.out.gain.setTargetAtTime(muted ? 0 : 1, ac.currentTime, .03);
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => {
      onScreen = es[0].isIntersecting;
      kickIdle();
    }).observe(root);
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(cv);
  else window.addEventListener('resize', resize);

  root.classList.add('is-live');
  resize();
  kickIdle();
})();
