/* ==========================================================
   トップのバナー：30秒の「ようこそ」

   待機中は締めの1枚を出し、再生ボタンで30秒の映像を流す。
   曲は録音ではなくその場で合成する。120BPM、1拍0.5秒、1小節2秒、15小節。
   映像の時計は AudioContext の時刻を使い、曲と拍がずれないようにする。
   Web Audio が無い環境では無音で映像だけ流す。

   0–4   点火：線が伸び、火の粉が灯る
   4–8   WELCOME：1拍に1文字
   8–10  よ・う・こ・そ：1拍に1枚
   10–16 遊ぶ・読む・眺める・ヒノガタリへ：奥から飛んでくる。最後の半拍は無音
   16–18 ようこそお越しくださいました
   18–22 ブラウザゲームの作品：半拍ごとに切り替え
   22–24 作品の一覧
   24–28 ヒノガタリ：1拍に1文字
   28–30 締め。終わると締めの1枚で止まる

   作品の画像はページ内のブラウザゲームのカードから拾う（先頭8件）。
   ========================================================== */
(() => {
  const root = document.getElementById('welcome');
  if (!root) return;
  const cv = root.querySelector('.wb-cv');
  const ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) return;
  const btnPlay = root.querySelector('.wb-play');
  const btnLabel = root.querySelector('.wb-play-label');
  const btnMute = root.querySelector('.wb-mute');
  const btnSkip = root.querySelector('.wb-skip');

  const DUR = 30;
  const BEAT = 0.5;
  const C = { bg: '#07090c', red: '#e03919', orange: '#f0803f', sky: '#4a8cff', blue: '#1667d6', dim: '#99a1af' };
  const SERIF = '"Hiragino Mincho ProN","Yu Mincho","YuMincho","MS PMincho",serif';
  const SANS = '"Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo",system-ui,sans-serif';
  const DISPLAY = '"Arial Black","Helvetica Neue",Arial,sans-serif';
  const MONO = 'ui-monospace,"SFMono-Regular",Consolas,Menlo,monospace';
  const SENT = 'ようこそお越しくださいました';
  const SENT_END = 'ようこそお越しくださいました。';
  const LOGO = 'ヒノガタリ';
  const HUD1 = 'HINOGATARI';
  const HUD2 = 'WELCOME SEQUENCE 01';
  const TILES = [
    { c: 'よ', r: 'YO', bg: C.red, fg: '#fff' },
    { c: 'う', r: 'U', bg: '#fff', fg: '#101418' },
    { c: 'こ', r: 'KO', bg: C.blue, fg: '#fff' },
    { c: 'そ', r: 'SO', bg: C.orange, fg: '#fff' },
  ];
  const WORDS = [
    { t: 10, j: '遊ぶ', e: 'PLAY', x: -.55, col: C.red },
    { t: 11, j: '読む', e: 'READ', x: .55, col: C.sky },
    { t: 12, j: '眺める', e: 'WATCH', x: -.4, col: C.orange },
    { t: 13, j: 'ヒノガタリへ', e: 'WELCOME TO', x: 0, col: '#fff' },
  ];
  const LOGO_T = [24, 24.5, 25, 25.5, 26];

  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 小道具 ---------- */
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const eOut = k => 1 - Math.pow(1 - k, 3);
  const eIn = k => k * k * k;
  const eIO = k => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const eBack = k => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
  const dk = (t, t0, a, r) => (t >= t0 ? a * Math.exp(-(t - t0) * r) : 0);
  const rnd = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  /* ---------- 譜面 ----------
     音も映像の拍もここから取る。t は秒、k は鳴らす部品、a はその引数 */
  const CH = {
    Dm: { root: 38, tones: [57, 62, 65] },
    Bb: { root: 34, tones: [58, 62, 65] },
    F:  { root: 41, tones: [57, 60, 65] },
    C:  { root: 36, tones: [55, 60, 64] },
    A:  { root: 33, tones: [57, 61, 64] },
    D:  { root: 38, tones: [57, 62, 66] },
  };
  const BARS = ['Dm', 'Dm', 'Dm', 'Bb', 'F', 'C', 'Bb', 'A', 'Dm', 'Bb', 'F', 'C', 'Bb', 'C', 'D'];
  const HOOK = [
    [74, 0, 74, 76, 77, 0, 76, 74],
    [70, 0, 70, 74, 77, 0, 79, 77],
    [72, 0, 72, 77, 81, 0, 79, 77],
    [76, 0, 76, 79, 84, 0, 81, 79],
  ];
  const ARP = [0, 1, 2, 3, 2, 1, 3, 2];

  function compose() {
    const ev = [];
    const add = (t, k, ...a) => ev.push({ t, k, a });
    const ch = b => CH[BARS[b]];
    const arpNote = (b, s) => { const tn = ch(b).tones; return [tn[0], tn[1], tn[2], tn[0] + 12][ARP[s % 8]] + 12; };

    /* 点火 */
    add(0, 'pad', 4, CH.Dm.tones, .016, 250, 1500);
    add(0, 'bass', 4, 38, .07, 220);
    add(1, 'ping', 86, .12);
    add(1.75, 'ping', 81, .08);
    for (let i = 0; i < HUD1.length + HUD2.length; i++) add(2 + i * .05, 'tick');
    add(2.5, 'swell', 1.5, .22);
    for (let b = 1; b <= 6; b++) for (let q = 0; q < 4; q++) add(b * 2 + q * BEAT + .25, 'hat', .05 + .012 * b, false);

    /* WELCOME〜よ・う・こ・そ〜奥から */
    for (let t = 4; t < 14; t += BEAT) add(t, 'kick', .7);
    for (let b = 2; b <= 6; b++) add(b * 2, 'pad', 2, ch(b).tones, .022, 700 + b * 160, 1200 + b * 260);
    for (let b = 2; b <= 3; b++) add(b * 2, 'bass', 2, ch(b).root + 12, .13, 380);
    for (let b = 4; b <= 6; b++) for (let q = 0; q < 4; q++) add(b * 2 + q * BEAT + .25, 'bass', .2, ch(b).root + 12, .17, 520 + (b - 4) * 140);
    for (let b = 3; b <= 7; b++) for (let s = 0; s < 16; s++) {
      const t = b * 2 + s * .125;
      if (t >= 15.75) break;
      add(t, 'pluck', arpNote(b, s), .025 + .007 * (b - 3), 1400 + (b - 3) * 700);
    }
    for (let b = 4; b <= 6; b++) { add(b * 2 + .5, 'clap', .3); add(b * 2 + 1.5, 'clap', .3); }

    /* 溜め。最後の半拍は空ける */
    add(14, 'kick', .85);
    add(14, 'pad', 1.75, CH.A.tones, .04, 1500, 5200);
    for (let t = 14; t < 15.5; t += .25) add(t, 'bass', .2, 45, .24, lerp(500, 1800, (t - 14) / 1.5));
    for (let t = 14; t < 15.75; ) {
      add(t, 'snare', lerp(.1, .45, (t - 14) / 1.75));
      t += t < 15 ? .25 : t < 15.5 ? .125 : .0625;
    }
    add(14, 'riser', 1.75, .3);

    /* ようこそお越しくださいました〜作品 */
    add(16, 'impact', .9);
    for (let b = 8; b <= 11; b++) {
      const c = ch(b), t0 = b * 2;
      add(t0, 'pad', 2, c.tones, .03, 2200, 2600);
      for (let q = 0; q < 4; q++) {
        const t = t0 + q * BEAT;
        if (t < 23.5) add(t, 'kick', .9);
        if (t < 23) {
          [.125, .25, .375].forEach((d, i) => add(t + d, 'bass', .1, c.root + (i === 1 ? 24 : 12), .24, 900));
        }
        if (q % 2 === 1 && t < 23) add(t, 'clap', .34);
        for (let s = 0; s < 4; s++) if (t + s * .125 < 23) add(t + s * .125, 'hat', [.05, .025, .09, .025][s], s === 2);
      }
      for (let s = 0; s < 16; s++) {
        const t = t0 + s * .125;
        if (t < 23.5) add(t, 'pluck', arpNote(b, s), .045, 3200);
      }
      HOOK[b - 8].forEach((m, i) => {
        if (!m) return;
        const next = HOOK[b - 8][i + 1];
        add(t0 + i * .25, 'lead', next === 0 ? .42 : .2, m, .075);
      });
    }
    add(22, 'crash', .2);
    for (let t = 23; t < 23.75; t += .125) add(t, 'snare', lerp(.15, .4, (t - 23) / .75));
    add(22.75, 'swell', 1.25, .25);

    /* ヒノガタリ */
    const PING = [74, 77, 79, 81, 86];
    LOGO_T.forEach((t, i) => {
      add(t, 'kick', .9);
      add(t, 'stab', (t < 26 ? CH.Bb : CH.C).tones, .035);
      add(t, 'ping', PING[i], .07);
    });
    add(24, 'crash', .3);
    add(24, 'pad', 2, CH.Bb.tones, .03, 1100, 2200);
    add(24, 'bass', 2, 34 + 12, .22, 420);
    add(26, 'pad', 2, CH.C.tones, .036, 1400, 4200);
    add(26, 'bass', 2, 36 + 12, .22, 520);
    add(27, 'kick', .85);
    add(27, 'clap', .3);
    for (let t = 26; t < 28; t += BEAT) add(t + .25, 'hat', .06, false);
    add(26, 'lead', .45, 76, .07);
    add(26.5, 'lead', .45, 79, .07);
    add(27, 'lead', .9, 81, .075);
    for (let t = 27; t < 27.95; t += .125) add(t, 'snare', lerp(.08, .32, t - 27));
    add(26.5, 'riser', 1.5, .2);

    /* 締め */
    add(28, 'impact', .6);
    add(28, 'kick', .9);
    add(28, 'stab', CH.D.tones, .045);
    add(28, 'pad', 2.6, CH.D.tones, .045, 3200, 900);
    add(28, 'bass', 2.4, 38 + 12, .24, 420);
    add(28, 'lead', 2.2, 86, .06);
    add(28, 'lead', 2.2, 78, .045);
    add(28.5, 'ping', 90, .06);
    add(29, 'ping', 93, .05);

    return ev.sort((a, b) => a.t - b.t);
  }
  const SCORE = compose();
  const KICKS = SCORE.filter(e => e.k === 'kick').map(e => e.t);
  const CLAPS = SCORE.filter(e => e.k === 'clap').map(e => e.t);

  function since(list, t) {
    let last = -1e9;
    for (const x of list) { if (x > t) break; last = x; }
    return t - last;
  }
  const kp = t => Math.exp(-since(KICKS, t) * 9);

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
      const il = Math.floor(ac.sampleRate * 2.8);
      irBuf = ac.createBuffer(2, il, ac.sampleRate);
      for (let c = 0; c < 2; c++) {
        const b = irBuf.getChannelData(c);
        for (let i = 0; i < il; i++) b[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / il, 2.8);
      }
      /* 裏に回ったら止める。映像の時計も AudioContext なので一緒に止まる */
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
    comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 4;
    comp.attack.value = .003; comp.release.value = .25;
    const master = gain(.72);
    master.gain.setValueAtTime(.72, at + 29.3);
    master.gain.linearRampToValueAtTime(.0001, at + 31.5);
    master.connect(comp); comp.connect(out); out.connect(ac.destination);

    const dry = gain(1); dry.connect(master);
    const pump = gain(1); pump.gain.setValueAtTime(1, at); pump.connect(master);

    const rv = ac.createConvolver(); rv.buffer = irBuf;
    const rev = gain(1), rvOut = gain(.32);
    rev.connect(rv); rv.connect(rvOut); rvOut.connect(master);

    const dl = ac.createDelay(1); dl.delayTime.value = BEAT * .75;
    const dly = gain(1), fb = gain(.33), dlOut = gain(.28);
    const dlp = filt('lowpass', 3000);
    dly.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(dlOut); dlOut.connect(master);
    return { out, dry, pump, rev, dly };
  }

  function gain(v) { const g = ac.createGain(); g.gain.value = v; return g; }
  function filt(type, f, q) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; }
  function osc(type, f, t, end) { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.start(t); o.stop(end); return o; }
  function noiseSrc(t, end) { const s = ac.createBufferSource(); s.buffer = noise; s.loop = true; s.start(t, Math.random() * 2); s.stop(end); return s; }
  function send(node, dest, v) { const g = gain(v); node.connect(g); g.connect(dest); }
  function decay(g, t, v, d, a = .003) {
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(.0001, t + a + d);
  }
  function hit(t, d, type, f, v, rev, q) {
    const s = noiseSrc(t, t + d + .05), b = filt(type, f, q || .7), g = gain(0);
    decay(g, t, v, d, .001);
    s.connect(b); b.connect(g); g.connect(mix.dry);
    if (rev) send(g, mix.rev, rev);
  }

  const PLAY = {
    kick(t, v) {
      const o = osc('sine', 150, t, t + .5);
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + .12);
      const g = gain(0); decay(g, t, v, .42);
      o.connect(g); g.connect(mix.dry);
      hit(t, .015, 'highpass', 3000, v * .25, 0);
      /* キックの瞬間だけ和音とベースを引っ込める */
      mix.pump.gain.setValueAtTime(.28, t);
      mix.pump.gain.linearRampToValueAtTime(1, t + .32);
    },
    clap(t, v) {
      [0, .011, .022].forEach(d => hit(t + d, .03, 'bandpass', 1300, v, 0, 1.2));
      hit(t + .03, .2, 'bandpass', 1300, v * .7, .35, 1.2);
    },
    snare(t, v) {
      hit(t, .16, 'highpass', 1400, v, .25);
      const o = osc('triangle', 190, t, t + .12), g = gain(0);
      decay(g, t, v * .6, .09);
      o.connect(g); g.connect(mix.dry);
    },
    hat(t, v, open) { hit(t, open ? .22 : .04, 'highpass', 7500, v, 0); },
    crash(t, v) { hit(t, 2.4, 'highpass', 3800, v, .45); },
    tick(t) { hit(t, .012, 'highpass', 5000, .08, 0); },
    pad(t, dur, tones, v, c0, c1) {
      const b = filt('lowpass', c0, .7);
      b.frequency.setValueAtTime(c0, t);
      b.frequency.linearRampToValueAtTime(c1, t + dur);
      const g = gain(0), a = Math.min(.5, dur * .3);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + a);
      g.gain.setValueAtTime(v, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + .4);
      b.connect(g); g.connect(mix.pump); send(g, mix.rev, .5);
      tones.forEach(m => [-9, 9].forEach(d => {
        const o = osc('sawtooth', mtof(m), t, t + dur + .45);
        o.detune.value = d; o.connect(b);
      }));
    },
    bass(t, dur, m, v, cut) {
      const f = mtof(m), end = t + dur + .06;
      const b = filt('lowpass', cut, 2);
      b.frequency.setValueAtTime(cut * 2.5, t);
      b.frequency.exponentialRampToValueAtTime(cut, t + Math.min(.12, dur));
      const g = gain(0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + .006);
      g.gain.setValueAtTime(v, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + .04);
      const s = osc('sawtooth', f, t, end), sub = osc('sine', f / 2, t, end), sg = gain(1.1);
      s.connect(b); b.connect(g); sub.connect(sg); sg.connect(g); g.connect(mix.pump);
    },
    pluck(t, m, v, cut) {
      const o = osc('square', mtof(m), t, t + .25), b = filt('lowpass', cut, 4), g = gain(0);
      b.frequency.setValueAtTime(cut, t);
      b.frequency.exponentialRampToValueAtTime(Math.max(200, cut * .25), t + .16);
      decay(g, t, v, .18);
      o.connect(b); b.connect(g); g.connect(mix.pump); send(g, mix.dly, .55);
    },
    lead(t, dur, m, v) {
      const f = mtof(m), end = t + dur + .2;
      const b = filt('lowpass', 3400, 1.2), g = gain(0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + .012);
      g.gain.linearRampToValueAtTime(v * .75, t + .15);
      g.gain.setValueAtTime(v * .75, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + .15);
      let lg = null;
      if (dur > .5) {
        const lfo = osc('sine', 5.5, t, end);
        lg = gain(0);
        lg.gain.setValueAtTime(0, t);
        lg.gain.linearRampToValueAtTime(14, t + .5);
        lfo.connect(lg);
      }
      [['sawtooth', -10, 1], ['sawtooth', 10, 1], ['square', -1200, .35]].forEach(([ty, d, lv]) => {
        const o = osc(ty, f, t, end), og = gain(lv);
        o.detune.value = d;
        if (lg) lg.connect(o.detune);
        o.connect(og); og.connect(b);
      });
      b.connect(g); g.connect(mix.dry); send(g, mix.rev, .35); send(g, mix.dly, .3);
    },
    stab(t, tones, v) {
      const b = filt('lowpass', 5000, 1), g = gain(0);
      b.frequency.setValueAtTime(5000, t);
      b.frequency.exponentialRampToValueAtTime(700, t + .35);
      decay(g, t, v, .5);
      b.connect(g); g.connect(mix.dry); send(g, mix.rev, .5);
      tones.concat(tones.map(m => m - 12)).forEach(m => [-12, 12].forEach(d => {
        const o = osc('sawtooth', mtof(m), t, t + .6);
        o.detune.value = d; o.connect(b);
      }));
    },
    ping(t, m, v) {
      const g = gain(0);
      decay(g, t, v, 1.4, .002);
      [[1, 1], [2, .25]].forEach(([mul, lv]) => {
        const o = osc('sine', mtof(m) * mul, t, t + 1.5), og = gain(lv);
        o.connect(og); og.connect(g);
      });
      g.connect(mix.dry); send(g, mix.dly, .6); send(g, mix.rev, .6);
    },
    riser(t, dur, v) {
      const end = t + dur;
      const s = noiseSrc(t, end + .02), b = filt('bandpass', 300, 2.5), g = gain(0);
      b.frequency.setValueAtTime(300, t);
      b.frequency.exponentialRampToValueAtTime(8000, end);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, end);
      g.gain.setValueAtTime(0, end + .01);
      s.connect(b); b.connect(g); g.connect(mix.dry); send(g, mix.rev, .4);
      const o = osc('sawtooth', mtof(45), t, end + .02), ob = filt('lowpass', 2500), og = gain(0);
      o.frequency.setValueAtTime(mtof(45), t);
      o.frequency.exponentialRampToValueAtTime(mtof(81), end);
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(v * .22, end);
      og.gain.setValueAtTime(0, end + .01);
      o.connect(ob); ob.connect(og); og.connect(mix.dry);
    },
    swell(t, dur, v) {
      const end = t + dur;
      const s = noiseSrc(t, end + .02), b = filt('highpass', 800), g = gain(0);
      b.frequency.setValueAtTime(800, t);
      b.frequency.exponentialRampToValueAtTime(6000, end);
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(v, end);
      g.gain.setValueAtTime(0, end + .005);
      s.connect(b); b.connect(g); g.connect(mix.dry); send(g, mix.rev, .3);
    },
    impact(t, v) {
      const o = osc('sine', 110, t, t + 2.4), g = gain(0);
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(28, t + 1.8);
      decay(g, t, v, 2.2, .004);
      o.connect(g); g.connect(mix.dry);
      hit(t, 1.4, 'lowpass', 900, v * .55, .7);
      PLAY.crash(t, v * .3);
    },
  };

  function schedule() {
    const horizon = ac.currentTime - t0 + .35;
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
    if (cut) m.out.gain.setTargetAtTime(0, ac.currentTime, .05);
    setTimeout(() => m.out.disconnect(), cut ? 600 : 3000);
  }

  const clock = () => (mix ? ac.currentTime - t0 : (performance.now() - p0) / 1000);

  /* ---------- 画面 ---------- */
  let W = 0, H = 0, DPR = 1;
  let vignette = null, grainPat = null;
  const fits = new Map(), lays = new Map();

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

  const STARS = Array.from({ length: 150 }, (_, i) => ({
    a: rnd(i) * Math.PI * 2, d: rnd(i + 500), c: [C.red, C.orange, C.sky, '#fff'][i % 4],
  }));
  const STREAKS = Array.from({ length: 16 }, (_, i) => ({ y: rnd(i + 900), sp: .6 + rnd(i + 950) * 1.4, o: rnd(i + 990) }));

  function resize() {
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    fits.clear(); lays.clear();
    vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .75);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,.6)');
    grainPat = ctx.createPattern(grainCv, 'repeat');
    if (state !== 'playing') still();
  }

  function fit(txt, fam, wt, maxW, maxH) {
    const key = txt + fam + wt + '|' + Math.round(maxW) + '|' + Math.round(maxH);
    let v = fits.get(key);
    if (v === undefined) {
      ctx.font = `${wt} 100px ${fam}`;
      v = Math.min(maxH, 100 * maxW / ctx.measureText(txt).width);
      fits.set(key, v);
    }
    return v;
  }

  /* 今の ctx.font での1文字ずつの中心位置。w は全体の幅 */
  function chars(txt) {
    const key = ctx.font + '|' + txt;
    let v = lays.get(key);
    if (!v) {
      let x = 0;
      const cs = [...txt].map(c => {
        const w = ctx.measureText(c).width;
        const o = { c, x: x + w / 2, w };
        x += w;
        return o;
      });
      v = { cs, w: x };
      lays.set(key, v);
    }
    return v;
  }

  function spaced(txt, x, y, sp, align) {
    const L = chars(txt);
    const total = L.w + sp * (L.cs.length - 1);
    const x0 = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    ctx.textAlign = 'center';
    L.cs.forEach((o, i) => ctx.fillText(o.c, x0 + o.x + sp * i, y));
    return total;
  }

  function brand(x0, x1) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, C.red); g.addColorStop(.45, C.orange); g.addColorStop(1, C.sky);
    return g;
  }

  function glow(x, y, r, col) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }

  /* ---------- 火の粉と輪 ---------- */
  const parts = [];
  const rings = [];

  function spark(x, y, n, spd, cols) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = spd * (.25 + Math.random() * .75);
      parts.push({ k: 0, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: .5 + Math.random() * .8, r: .8 + Math.random() * 1.6, c: cols[i % cols.length], ph: 0 });
    }
  }
  function ember(x, y) {
    parts.push({ k: 1, x, y, vx: (Math.random() - .5) * H * .06, vy: -H * (.06 + Math.random() * .16), life: 0, max: 2 + Math.random() * 2.5, r: .7 + Math.random() * 2, c: Math.random() < .75 ? C.orange : C.red, ph: Math.random() * 6 });
  }
  function ring(at, x, y, r0, r1, dur, c, w) { rings.push({ at, x, y, r0, r1, dur, c, w }); }

  function stepParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life > p.max) { parts.splice(i, 1); continue; }
      if (p.k === 0) {
        const d = Math.pow(.05, dt);
        p.vx *= d; p.vy = p.vy * d + H * .5 * dt;
      } else {
        p.vx += Math.sin(p.life * 2.2 + p.ph) * H * .03 * dt;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    if (parts.length > 900) parts.splice(0, parts.length - 900);
  }

  function drawParts() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const p of parts) {
      let a = 1 - p.life / p.max;
      if (p.k === 0) {
        ctx.globalAlpha = a;
        ctx.strokeStyle = p.c; ctx.lineWidth = p.r;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * .035, p.y - p.vy * .035); ctx.stroke();
      } else {
        a *= .55 + .45 * Math.sin(p.life * 11 + p.ph);
        a *= Math.min(1, p.life * 3);
        ctx.fillStyle = p.c;
        ctx.globalAlpha = a * .22;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = a;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawRings(t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i], k = (t - r.at) / r.dur;
      if (k >= 1) { rings.splice(i, 1); continue; }
      if (k < 0) continue;
      ctx.globalAlpha = (1 - k) * (1 - k);
      ctx.strokeStyle = r.c; ctx.lineWidth = r.w * (1 - k * .6);
      ctx.beginPath(); ctx.arc(r.x, r.y, lerp(r.r0, r.r1, eOut(k)), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function emberRate(t) {
    if (t < 1.2) return 0;
    if (t < 3.2) return 14;
    if (t < 8) return 10;
    if (t < 16) return 0;
    if (t < 18) return 26;
    if (t < 24) return 0;
    if (t < 28) return 55;
    return 22;
  }
  let emberAcc = 0;
  function emit(rate, dt, fromCenter) {
    emberAcc += rate * dt;
    while (emberAcc >= 1) {
      emberAcc -= 1;
      if (fromCenter) ember(W / 2 + (Math.random() - .5) * H * .1, H / 2 + (Math.random() - .5) * H * .05);
      else ember(Math.random() * W, H + 6);
    }
  }

  /* ---------- 合図 ---------- */
  function logoLay() {
    const fs = fit(LOGO, SERIF, 600, W * .56, H * .3);
    ctx.font = `600 ${fs}px ${SERIF}`;
    return { fs, L: chars(LOGO), y: H * .43 };
  }

  function makeCues() {
    const cs = [
      { t: 1, f: () => { ring(1, W / 2, H / 2, 2, H * .25, .9, '#fff', 1.5); spark(W / 2, H / 2, 18, H * .6, [C.orange, '#fff']); } },
      { t: 4, f: () => {
        ring(4, W / 2, H / 2, H * .02, Math.max(W, H) * .6, 1, '#fff', 3);
        ring(4.06, W / 2, H / 2, H * .02, Math.max(W, H) * .45, 1, C.orange, 2);
        spark(W / 2, H / 2, 150, H * 2.4, [C.red, C.orange, '#fff', C.sky]);
      } },
      { t: 16, f: () => {
        ring(16, W / 2, H / 2, H * .05, Math.max(W, H) * .8, 1.2, '#fff', 4);
        ring(16.08, W / 2, H / 2, H * .05, Math.max(W, H) * .6, 1.2, C.sky, 3);
        ring(16.16, W / 2, H / 2, H * .05, Math.max(W, H) * .45, 1.2, C.red, 2);
        spark(W / 2, H / 2, 360, H * 3.2, [C.red, C.orange, '#fff', C.sky]);
      } },
      { t: 28, f: () => {
        ring(28, W / 2, H * .42, H * .05, Math.max(W, H) * .55, 1.4, C.orange, 2);
        spark(W / 2, H * .42, 90, H * 1.6, [C.orange, '#fff', C.red]);
      } },
    ];
    KICKS.filter(k => (k > 4 && k < 8) || (k > 16 && k < 23.5)).forEach(k => cs.push({ t: k, f: () => ring(k, W / 2, H / 2, H * .04, H * .5, .45, 'rgba(255,255,255,.5)', 1.5) }));
    TILES.forEach((_, i) => cs.push({ t: 8 + i * BEAT, f: () => {
      const s = Math.min(H * .46, W * .19), gap = s * .14, x0 = (W - (4 * s + 3 * gap)) / 2;
      spark(x0 + i * (s + gap) + s / 2, H / 2 - H * .03, 26, H * 1.2, [TILES[i].bg === '#fff' ? '#fff' : TILES[i].bg, '#fff']);
    } }));
    LOGO_T.forEach((t, i) => cs.push({ t, f: () => {
      const { fs, L, y } = logoLay();
      const x = W / 2 - L.w / 2 + L.cs[i].x;
      spark(x, y + fs * .35, 40, H * 1.4, [C.orange, C.red, '#fff']);
      ring(t, x, y, fs * .2, fs * 1.1, .6, C.orange, 2);
    } }));
    return cs.sort((a, b) => a.t - b.t);
  }
  let cues = [], cueI = 0;

  /* ---------- 作品 ---------- */
  let works = null;
  function loadWorks() {
    if (works) return;
    const els = [...document.querySelectorAll('.wg-more-grid .card-thumb')].slice(0, 8);
    works = els.map(el => {
      const w = { img: new Image(), title: el.alt, ok: false, small: null };
      w.img.onload = () => {
        w.ok = true;
        const s = document.createElement('canvas');
        s.width = 32; s.height = 18;
        cover(s.getContext('2d'), w.img, 0, 0, 32, 18, 1, .5, .5);
        w.small = s;
      };
      w.img.src = el.currentSrc || el.src;
      return w;
    });
  }
  const work = i => works[i % works.length];
  const hasWorks = () => works && works.length > 0;

  function cover(c, img, x, y, w, h, zoom, ax, ay) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const s = Math.max(w / iw, h / ih) * zoom;
    const sw = w / s, sh = h / s;
    c.drawImage(img, (iw - sw) * ax, (ih - sh) * ay, sw, sh, x, y, w, h);
  }

  function cardRect() {
    const wide = W / H > 2.1;
    let ch = H * .74, cw = ch * 16 / 9;
    if (!wide && cw > W * .9) { cw = W * .9; ch = cw * 9 / 16; }
    const x = wide ? W - W * .06 - cw : (W - cw) / 2;
    return { x, y: (H - ch) / 2, w: cw, h: ch, wide };
  }

  function gridLay(n) {
    let best = null;
    [2, 3, 4, 8].forEach(cols => {
      if (cols > n) return;
      const rows = Math.ceil(n / cols);
      const tw = Math.min(W * .88 / (cols + .06 * (cols - 1)), H * .74 / (rows * .5625 + .06 * (rows - 1)));
      if (!best || tw > best.tw) best = { cols, rows, tw };
    });
    const { cols, rows, tw } = best, th = tw * .5625, g = tw * .06;
    const x0 = (W - (cols * tw + (cols - 1) * g)) / 2, y0 = (H - (rows * th + (rows - 1) * g)) / 2;
    return Array.from({ length: n }, (_, i) => ({ x: x0 + (i % cols) * (tw + g), y: y0 + Math.floor(i / cols) * (th + g), w: tw, h: th }));
  }

  /* ---------- 場面 ---------- */
  function ignite(t) {
    const cx = W / 2, cy = H / 2;
    const grow = eOut(seg(t, .15, 1.2)), pull = eIn(seg(t, 3.1, 4));
    const hw = W * .44 * grow * (1 - pull);
    if (hw > .5) {
      const g = ctx.createLinearGradient(cx - hw, 0, cx + hw, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - hw, cy - .75, hw * 2, 1.5);
      const c = seg(t, 1, 1.8);
      if (c > 0) {
        ctx.globalAlpha = c;
        ctx.fillStyle = brand(cx - hw, cx + hw);
        ctx.fillRect(cx - hw, cy - 1, hw * 2, 2);
        ctx.globalAlpha = 1;
      }
      const tk = seg(t, 1.4, 2.4);
      if (tk > 0) {
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        const step = Math.max(8, W * .02);
        for (let x = step, i = 1; x < hw * tk; x += step, i++) {
          const h = i % 5 === 0 ? H * .03 : H * .012;
          ctx.fillRect(cx + x, cy + 4, 1, h);
          ctx.fillRect(cx - x, cy + 4, 1, h);
        }
      }
    }
    const on = eBack(seg(t, .9, 1.3));
    if (on > 0) {
      const r = H * .06 * on * (1 + .15 * Math.sin(t * 14)) * (1 - pull * .5) * (1 + pull * pull * 1.5);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3);
      g.addColorStop(0, '#fff'); g.addColorStop(.18, 'rgba(255,200,140,.9)');
      g.addColorStop(.5, 'rgba(240,128,63,.3)'); g.addColorStop(1, 'rgba(224,57,25,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r * 3, cy - r * 3, r * 6, r * 6);
      ctx.restore();
    }
  }

  function welcome(t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#fff';
    for (const s of STREAKS) {
      const x = ((t * s.sp * .5 + s.o) % 1.4 - .2) * W;
      ctx.globalAlpha = .1 * seg(t, 4, 4.4);
      ctx.fillRect(x, s.y * H, W * .14, 1);
    }
    ctx.restore();

    const word = 'WELCOME';
    const fs = fit(word, DISPLAY, 900, W * .98, H * .62);
    ctx.font = `900 ${fs}px ${DISPLAY}`;
    const L = chars(word);
    const out = eIn(seg(t, 7.8, 8.15));
    const zoom = (1 + .07 * seg(t, 4, 8) + .015 * kp(t)) * (1 + out * .5);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(zoom, zoom);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(1, fs * .012);
    const x0 = -L.w / 2;
    L.cs.forEach((o, i) => {
      const ti = 4 + i * BEAT;
      if (t < ti) return;
      const k = seg(t, ti, ti + .22), s = lerp(1.8, 1, eOut(k));
      ctx.save();
      ctx.translate(x0 + o.x, fs * .04);
      ctx.scale(s, s);
      ctx.globalAlpha = k * (1 - out);
      const fill = 1 - seg(t, ti, ti + .4);
      if (fill > 0) { ctx.fillStyle = `rgba(255,255,255,${fill})`; ctx.fillText(o.c, 0, 0); }
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.strokeText(o.c, 0, 0);
      ctx.restore();
    });
    const sweep = eIO(seg(t, 7.5, 7.85));
    if (sweep > 0) {
      ctx.save();
      ctx.globalAlpha = 1 - out;
      ctx.beginPath(); ctx.rect(x0, -fs, L.w * sweep, fs * 2); ctx.clip();
      ctx.fillStyle = brand(x0, -x0);
      ctx.textAlign = 'left';
      ctx.fillText(word, x0, fs * .04);
      ctx.restore();
    }
    ctx.restore();
  }

  function wipe(t, at, dur, col) {
    const k = seg(t, at, at + dur);
    if (k <= 0 || k >= 1) return;
    const bw = W * .55, sk = H * .45;
    const x = lerp(-bw - sk, W + sk, eIO(k));
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x + sk, 0); ctx.lineTo(x + sk + bw, 0); ctx.lineTo(x + bw, H); ctx.lineTo(x, H);
    ctx.fill();
  }

  function tiles(t) {
    const s = Math.min(H * .46, W * .19), gap = s * .14, x0 = (W - (4 * s + 3 * gap)) / 2, y = H / 2 - H * .03;
    const pulse = 1 + .05 * kp(t);
    TILES.forEach((d, i) => {
      const ti = 8 + i * BEAT, k = seg(t, ti, ti + .32);
      if (k <= 0) return;
      const fly = eIn(seg(t, 9.8 + i * .05, 10.2 + i * .05));
      if (fly >= 1) return;
      const cx = x0 + i * (s + gap) + s / 2;
      const sc = (1 + fly * 2.4) * pulse;
      ctx.save();
      ctx.translate(cx + (cx - W / 2) * fly * 1.8, y + (y - H / 2) * fly);
      ctx.rotate((1 - eOut(k)) * (i % 2 ? .35 : -.35) + fly * (i % 2 ? .4 : -.4));
      ctx.scale(sc, sc * eBack(k));
      ctx.globalAlpha = Math.min(1, k * 3) * (1 - fly);
      ctx.fillStyle = d.bg;
      rr(-s / 2, -s / 2, s, s, s * .07); ctx.fill();
      ctx.fillStyle = d.fg;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${s * .6}px ${SERIF}`;
      ctx.fillText(d.c, 0, -s * .04);
      ctx.globalAlpha *= .7;
      ctx.font = `700 ${Math.max(9, s * .085)}px ${MONO}`;
      ctx.fillText(d.r, 0, s * .37);
      ctx.restore();
    });
  }

  function tunnel(t) {
    const u = Math.max(0, t - 10);
    const travel = u * 1.1 + u * u * .42, speed = 1.1 + u * .84;
    const fin = seg(t, 9.85, 10.3);
    const vx = W / 2 + Math.sin(u * .8) * W * .05, vy = H / 2 + Math.cos(u * .6) * H * .05;
    const N = 14;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < N; i++) {
      const z = ((i - travel) % N + N) % N + .25;
      if (z < .3) continue;
      const sc = 1 / z, k = 1 - Math.min(1, sc);
      const px = lerp(W / 2, vx, k), py = lerp(H / 2, vy, k);
      const w = W * .9 * sc, h = H * .84 * sc;
      ctx.globalAlpha = fin * Math.pow(1 - z / (N + .25), 1.4);
      ctx.strokeStyle = [C.red, C.orange, C.sky, '#fff'][i % 4];
      ctx.lineWidth = Math.max(1, 2.5 * sc);
      ctx.strokeRect(px - w / 2, py - h / 2, w, h);
    }

    const sa = seg(t, 12.3, 13);
    if (sa > 0) {
      ctx.lineWidth = 1.2;
      const base = Math.min(W, H) * .05;
      for (const s of STARS) {
        const z = ((s.d - travel * .08) % 1 + 1) % 1 + .02;
        const r = base / z;
        if (r > Math.max(W, H)) continue;
        const r2 = r * (1 + speed * .06);
        const ca = Math.cos(s.a), sn = Math.sin(s.a);
        ctx.globalAlpha = sa * Math.min(1, (1 - z) * 1.4);
        ctx.strokeStyle = s.c;
        ctx.beginPath(); ctx.moveTo(vx + ca * r, vy + sn * r); ctx.lineTo(vx + ca * r2, vy + sn * r2); ctx.stroke();
      }
    }

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const w of WORDS) {
      const age = t - w.t;
      if (age < 0 || age > 1.6) continue;
      const z = 5 - age * 3.6;
      if (z < .35) continue;
      const sc = 1 / z, fs = H * .2 * sc;
      const px = vx + w.x * W * .35 * sc, py = vy;
      ctx.globalAlpha = Math.min(1, age * 3) * Math.min(1, (z - .35) * 2.5);
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${fs}px ${SERIF}`;
      ctx.fillText(w.j, px, py);
      ctx.fillStyle = w.col;
      ctx.fillRect(px - fs * .5, py + fs * .56, fs, Math.max(1, fs * .035));
      ctx.font = `700 ${fs * .17}px ${MONO}`;
      ctx.fillText(w.e, px, py + fs * .78);
    }

    const wh = seg(t, 14, 15.7);
    if (wh > 0) {
      ctx.globalAlpha = 1;
      glow(vx, vy, Math.max(W, H) * .7 * wh, `rgba(255,255,255,${.55 * wh})`);
    }
    ctx.restore();
  }

  function rays(t, a) {
    if (a <= 0) return;
    const R = Math.hypot(W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(t * .25);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI * 2 / 12);
      ctx.fillStyle = i % 2 ? 'rgba(224,57,25,.08)' : 'rgba(74,140,255,.07)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R, -R * .09); ctx.lineTo(R, R * .09); ctx.fill();
    }
    ctx.restore();
  }

  function glitchAmt(t) { return Math.exp(-(t - 16) * 4.5) + .35 * Math.exp(-since(CLAPS, t) * 12); }

  function drop(t) {
    const cx = W / 2, cy = H / 2;
    const end = hasWorks() ? 18 : 24;
    const out = eIn(seg(t, end - .2, end + .05));
    rays(t, seg(t, 16, 16.3) * (1 - out));
    const fs = fit(SENT, SERIF, 600, W * .84, H * .16);
    const bw = eOut(seg(t, 16, 16.35));

    ctx.save();
    ctx.translate(-out * W * 1.1, 0);
    ctx.globalAlpha = .16;
    ctx.fillStyle = brand(cx - W * .5, cx + W * .5);
    ctx.fillRect(cx - W * .5 * bw, cy - fs * .85, W * bw, fs * 1.7);
    ctx.globalAlpha = 1;
    ctx.fillRect(cx - W * .45 * bw, cy - fs * .95, W * .9 * bw, 2);
    ctx.fillRect(cx - W * .45 * bw, cy + fs * .95 - 2, W * .9 * bw, 2);

    const lf = Math.max(9, Math.min(13, fs * .22));
    ctx.font = `700 ${lf}px ${MONO}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.globalAlpha = seg(t, 16.35, 16.7);
    spaced('WELCOME TO HINOGATARI', cx, cy - fs * 1.35, lf * .5, 'center');
    ctx.globalAlpha = seg(t, 16.6, 17);
    spaced('BROWSER GAMES · GAMES · NOVELS', cx, cy + fs * 1.35, lf * .5, 'center');

    ctx.font = `600 ${fs}px ${SERIF}`;
    const L = chars(SENT);
    const g = glitchAmt(t);
    const sc = 1 + .025 * kp(t);
    ctx.translate(cx, cy);
    ctx.scale(sc, sc);
    ctx.textAlign = 'center';
    ctx.globalCompositeOperation = 'lighter';
    const passes = g > .03 ? [[C.red, -g * fs * .09, .9], [C.sky, g * fs * .09, .9], ['#fff', 0, 1]] : [['#fff', 0, 1]];
    for (const [col, dx, al] of passes) {
      ctx.fillStyle = col;
      L.cs.forEach((o, i) => {
        const ti = 16 + i * .028, k = seg(t, ti, ti + .32);
        if (k <= 0) return;
        const e = eOut(k), s = lerp(1.5, 1, e);
        ctx.save();
        ctx.globalAlpha = al * k;
        ctx.translate(-L.w / 2 + o.x + dx, (1 - e) * fs * .5);
        ctx.scale(s, s);
        ctx.fillText(o.c, 0, 0);
        ctx.restore();
      });
    }
    ctx.restore();
  }

  function slices(t, g) {
    const f = Math.floor(t * 30);
    for (let i = 0; i < 5; i++) {
      const y = rnd(f * 7 + i) * H, h = H * (.02 + rnd(f * 13 + i) * .07);
      const dx = (rnd(f * 3 + i * 11) - .5) * W * .09 * g;
      ctx.drawImage(cv, 0, y * DPR, cv.width, h * DPR, dx, y, W, h);
    }
  }

  function drawCard(w, r, lt, i) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(r.x + r.w * .02, r.y + r.h * .04, r.w, r.h);
    rr(r.x, r.y, r.w, r.h, Math.max(4, r.h * .02));
    ctx.save();
    ctx.clip();
    if (w.ok) {
      cover(ctx, w.img, r.x, r.y, r.w, r.h, 1.14 - .12 * seg(lt, 0, .7), .5 + (i % 2 ? .04 : -.04) * seg(lt, 0, .7), .5);
    } else {
      ctx.fillStyle = brand(r.x, r.x + r.w);
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    if (!r.wide) {
      const g = ctx.createLinearGradient(0, r.y + r.h * .45, 0, r.y + r.h);
      g.addColorStop(0, 'rgba(7,9,12,0)'); g.addColorStop(1, 'rgba(7,9,12,.85)');
      ctx.fillStyle = g;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    const f = 1 - seg(lt, 0, .15);
    if (f > 0) { ctx.fillStyle = `rgba(255,255,255,${f * .7})`; ctx.fillRect(r.x, r.y, r.w, r.h); }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawLabel(w, r, i, a, n) {
    if (a <= 0) return;
    const col = i % 2 ? C.sky : C.red;
    const num = String(i % n + 1).padStart(2, '0');
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textBaseline = 'alphabetic';
    if (r.wide) {
      const x = W * .06, mw = r.x - W * .09;
      const nf = H * .2;
      ctx.font = `900 ${nf}px ${DISPLAY}`;
      ctx.textAlign = 'left';
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,.6)';
      ctx.strokeText(num, x + (1 - a) * -20, r.y + nf * .85);
      const tf = fit(w.title, SERIF, 600, mw, H * .085);
      ctx.font = `600 ${tf}px ${SERIF}`;
      ctx.fillStyle = '#fff';
      ctx.fillText(w.title, x, r.y + r.h * .7);
      ctx.fillStyle = col;
      ctx.fillRect(x, r.y + r.h * .7 + tf * .45, mw * .35 * a, 3);
      const mf = Math.max(9, Math.min(12, H * .026));
      ctx.font = `700 ${mf}px ${MONO}`;
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.textAlign = 'left';
      spaced(`BROWSER GAME ${num} / ${String(n).padStart(2, '0')}`, x, r.y + r.h * .7 + tf * .45 + mf * 2.4, mf * .4, 'left');
    } else {
      const x = r.x + r.w * .05, mw = r.w * .8;
      const tf = fit(w.title, SANS, 700, mw, r.h * .11);
      const mf = Math.max(9, tf * .55);
      ctx.font = `700 ${mf}px ${MONO}`;
      ctx.fillStyle = col;
      ctx.fillRect(x, r.y + r.h - tf * 2.6, mf * 2.4, mf * 1.5);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(num, x + mf * 1.2, r.y + r.h - tf * 2.6 + mf * 1.12);
      ctx.font = `700 ${tf}px ${SANS}`;
      ctx.textAlign = 'left';
      ctx.fillText(w.title, x, r.y + r.h - tf * .7);
    }
    ctx.restore();
  }

  function bgImage(w, a) {
    if (a <= 0 || !w.small) return;
    ctx.save();
    ctx.globalAlpha = a * .55;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(w.small, -W * .05, -H * .05, W * 1.1, H * 1.1);
    ctx.globalAlpha = a * .5;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function montage(t) {
    const n = works.length, r = cardRect();
    const idx = clamp(Math.floor((t - 18) / BEAT), 0, 7);
    bgImage(work(idx), 1);
    for (const i of [idx - 1, idx]) {
      if (i < 0) continue;
      const ti = 18 + i * BEAT;
      const kIn = eOut(seg(t, ti, ti + .18));
      const kOut = i < idx ? eIn(seg(t, ti + BEAT, ti + BEAT + .16)) : 0;
      if (kOut >= 1) continue;
      const dx = (1 - kIn) * W * .9 - kOut * W * .9;
      ctx.save();
      ctx.translate(dx, 0);
      if (Math.abs(dx) > 4) {
        ctx.globalAlpha = .25;
        ctx.translate(dx * .15, 0);
        drawCard(work(i), r, t - ti, i);
        ctx.translate(-dx * .15, 0);
        ctx.globalAlpha = 1;
      }
      drawCard(work(i), r, t - ti, i);
      ctx.restore();
      if (!r.wide) {
        ctx.save(); ctx.translate(dx, 0);
        drawLabel(work(i), r, i, 1, n);
        ctx.restore();
      } else {
        drawLabel(work(i), r, i, kIn * (1 - kOut * 3), n);
      }
    }
  }

  function grid(t) {
    const n = Math.min(works.length, 8), G = gridLay(n), r = cardRect();
    const j = 7 % n, tl = G[j];
    const e = eIO(seg(t, 22, 22.55));
    bgImage(work(7), 1 - e);

    ctx.save();
    const z = 1 + .05 * seg(t, 22.5, 24);
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-.04 * e);
    ctx.scale(z, z);
    ctx.translate(-W / 2, -H / 2);
    const S = lerp(r.w / tl.w, 1, e);
    ctx.translate(lerp(r.x + r.w / 2, tl.x + tl.w / 2, e), lerp(r.y + r.h / 2, tl.y + tl.h / 2, e));
    ctx.scale(S, S);
    ctx.translate(-(tl.x + tl.w / 2), -(tl.y + tl.h / 2));

    const hi = Math.floor((t - 22) / .25) % n;
    G.forEach((g, i) => {
      const ex = eIn(seg(t, 23.4 + i * .03, 23.85 + i * .03));
      if (ex >= 1) return;
      const w = works[i];
      const ox = (g.x + g.w / 2 - W / 2), oy = (g.y + g.h / 2 - H / 2);
      ctx.save();
      ctx.translate(g.x + g.w / 2 + ox * ex * 1.5, g.y + g.h / 2 + oy * ex * 1.5);
      ctx.rotate(ex * (i % 2 ? .7 : -.7));
      const s = 1 + .03 * kp(t) * (i === hi ? 2 : 1);
      ctx.scale(s, s);
      ctx.globalAlpha = 1 - ex;
      const rr0 = { x: -g.w / 2, y: -g.h / 2, w: g.w, h: g.h, wide: true };
      rr(rr0.x, rr0.y, rr0.w, rr0.h, Math.max(3, g.h * .03));
      ctx.save(); ctx.clip();
      if (w.ok) cover(ctx, w.img, rr0.x, rr0.y, rr0.w, rr0.h, 1, .5, .5);
      else { ctx.fillStyle = brand(rr0.x, -rr0.x); ctx.fillRect(rr0.x, rr0.y, rr0.w, rr0.h); }
      if (t > 22.5 && i !== hi) { ctx.fillStyle = 'rgba(7,9,12,.35)'; ctx.fillRect(rr0.x, rr0.y, rr0.w, rr0.h); }
      ctx.restore();
      ctx.lineWidth = i === hi && t > 22.5 ? 2.5 : 1;
      ctx.strokeStyle = i === hi && t > 22.5 ? (i % 2 ? C.sky : C.red) : 'rgba(255,255,255,.25)';
      ctx.stroke();
      ctx.restore();
    });
    ctx.restore();

    const ta = seg(t, 22.55, 22.85) * (1 - seg(t, 23.4, 23.7));
    if (ta > 0) {
      const msg = 'ぜんぶ、ブラウザでそのまま。';
      const fs = fit(msg, SERIF, 600, W * .7, H * .11);
      ctx.save();
      ctx.globalAlpha = ta;
      ctx.fillStyle = 'rgba(7,9,12,.78)';
      const bh = fs * 2.2;
      ctx.fillRect(0, H / 2 - bh / 2, W, bh);
      ctx.fillStyle = brand(0, W);
      ctx.fillRect(0, H / 2 - bh / 2, W * eOut(ta), 2);
      ctx.fillRect(W * (1 - eOut(ta)), H / 2 + bh / 2 - 2, W, 2);
      ctx.font = `600 ${fs}px ${SERIF}`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(msg, W / 2 + (1 - eOut(ta)) * W * .05, H / 2);
      ctx.restore();
    }
  }

  function logo(t) {
    const out = seg(t, 28, 28.5);
    const a = seg(t, 24, 24.6) * (1 - out);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(W / 2, H * 1.15, Math.max(W, H) * .75, `rgba(240,128,63,${.32 * a * (.85 + .15 * Math.sin(t * 9) * Math.sin(t * 5.3))})`);
    ctx.restore();

    const { fs, L, y } = logoLay();
    ctx.save();
    const s0 = 1 + out * .12 + .04 * seg(t, 26, 28);
    ctx.translate(W / 2, y);
    ctx.scale(s0, s0);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `600 ${fs}px ${SERIF}`;
    L.cs.forEach((o, i) => {
      const ti = LOGO_T[i], k = seg(t, ti, ti + .24);
      if (k <= 0) return;
      const e = eOut(k), s = lerp(1.35, 1, e);
      ctx.save();
      ctx.translate(-L.w / 2 + o.x, -(1 - e) * fs * .9);
      ctx.scale(s, s);
      ctx.globalAlpha = Math.min(1, k * 2) * (1 - out);
      ctx.shadowColor = 'rgba(240,128,63,.9)';
      ctx.shadowBlur = fs * .25 * (.35 + .65 * Math.exp(-(t - ti) * 3));
      ctx.fillStyle = '#fff';
      ctx.fillText(o.c, 0, 0);
      ctx.restore();
    });
    const u = eOut(seg(t, 26, 26.45));
    if (u > 0) {
      ctx.globalAlpha = 1 - out;
      ctx.fillStyle = brand(-L.w / 2, L.w / 2);
      ctx.fillRect(-L.w / 2 * u, fs * .62, L.w * u, Math.max(2, fs * .03));
    }
    const na = seg(t, 26.5, 27);
    if (na > 0) {
      const nf = Math.max(11, fs * .17);
      ctx.globalAlpha = na * (1 - out);
      ctx.font = `600 ${nf}px ${SANS}`;
      ctx.fillStyle = '#fff';
      spaced('山賀秀明', 0, fs * .95, lerp(nf * 1.4, nf * .45, eOut(na)), 'center');
    }
    const ga = seg(t, 27, 27.5);
    if (ga > 0) {
      const gf = Math.max(10, fs * .13);
      ctx.globalAlpha = ga * (1 - out);
      ctx.font = `600 ${gf}px ${SANS}`;
      ctx.fillStyle = C.dim;
      ctx.textAlign = 'center';
      ctx.fillText('フリーゲームと無料WEB小説', 0, fs * 1.28);
    }
    ctx.restore();
  }

  const FULL = { glow: 1, brand: 1, text: 1, line: 1, sub: 1 };

  function endCard(p) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = p.glow;
    glow(W * .1, H * 1.05, Math.max(W, H) * .6, 'rgba(224,57,25,.3)');
    glow(W * .92, -H * .1, Math.max(W, H) * .55, 'rgba(22,103,214,.36)');
    ctx.restore();

    const fs = fit(SENT_END, SERIF, 600, W * .8, H * .13);
    const y = H * .42;
    ctx.save();
    ctx.textBaseline = 'middle';
    if (p.brand > 0) {
      const bf = Math.max(10, Math.min(13, H * .03));
      ctx.globalAlpha = p.brand;
      ctx.font = `700 ${bf}px ${MONO}`;
      ctx.fillStyle = 'rgba(255,255,255,.72)';
      const bw = spaced('HINOGATARI', W / 2, H * .17, bf * .6, 'center');
      ctx.fillStyle = brand(W / 2 - bw, W / 2 + bw);
      const lw = bf * 3 * p.brand;
      ctx.fillRect(W / 2 - bw / 2 - bf - lw, H * .17, lw, 1);
      ctx.fillRect(W / 2 + bw / 2 + bf, H * .17, lw, 1);
      ctx.globalAlpha = 1;
    }
    ctx.font = `600 ${fs}px ${SERIF}`;
    const tw = ctx.measureText(SENT_END).width, x0 = W / 2 - tw / 2;
    if (p.text > 0) {
      const rw = (tw + fs * .4) * p.text;
      ctx.save();
      ctx.beginPath(); ctx.rect(x0 - fs * .2, y - fs, rw, fs * 2); ctx.clip();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(SENT_END, x0, y);
      ctx.restore();
      if (p.text < 1) {
        ctx.fillStyle = C.orange;
        ctx.fillRect(x0 - fs * .2 + rw - 1.5, y - fs * .7, 3, fs * 1.4);
      }
    }
    if (p.line > 0) {
      const lw = Math.min(tw * .55, W * .5) * p.line;
      ctx.fillStyle = brand(W / 2 - lw / 2, W / 2 + lw / 2);
      ctx.fillRect(W / 2 - lw / 2, y + fs * .85, lw, 2);
    }
    if (p.sub > 0) {
      const sf = Math.max(11, Math.min(15, fs * .34));
      ctx.globalAlpha = p.sub;
      ctx.font = `600 ${sf}px ${SANS}`;
      ctx.fillStyle = C.dim;
      ctx.textAlign = 'center';
      ctx.fillText('ヒノガタリ ／ 山賀秀明', W / 2, y + fs * .85 + sf * 1.9);
    }
    ctx.restore();
  }

  function finale(t) {
    endCard({
      glow: seg(t, 28, 29.5),
      brand: seg(t, 28.5, 29.1),
      text: eIO(seg(t, 28.15, 29)),
      line: eOut(seg(t, 28.8, 29.5)),
      sub: seg(t, 29.2, 29.8),
    });
  }

  function hud(t) {
    let a = seg(t, 1.4, 2) * (1 - seg(t, 15.6, 15.75));
    if (t >= 16) a = .5 * seg(t, 16.4, 17) * (1 - seg(t, 23.6, 24));
    if (a <= 0) return;
    const m = Math.min(W, H) * .06, L = Math.min(W, H) * .07 * eOut(seg(t, 1.4, 2));
    const fs = Math.max(9, Math.min(12, H * .028));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 1.5;
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1]]) {
      ctx.beginPath(); ctx.moveTo(x, y + sy * L); ctx.lineTo(x, y); ctx.lineTo(x + sx * L, y); ctx.stroke();
    }
    ctx.font = `600 ${fs}px ${MONO}`;
    ctx.textBaseline = 'top';
    const n = Math.max(0, Math.floor((t - 2) / .05) + 1);
    const l1 = HUD1.slice(0, n), l2 = HUD2.slice(0, Math.max(0, n - HUD1.length));
    const tx = m + fs * .9, ty = m + fs * .8;
    if (t < 16) {
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      spaced(l1, tx, ty, fs * .35, 'left');
      ctx.fillStyle = C.dim;
      const w2 = spaced(l2, tx, ty + fs * 1.6, fs * .2, 'left');
      if (n > 0 && Math.floor(t * 4) % 2 === 0) ctx.fillRect(tx + w2 + fs * .3, ty + fs * 1.6, fs * .55, fs);
    }

    const ss = Math.floor(t), ff = Math.floor((t % 1) * 30);
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    spaced(`00:${String(ss).padStart(2, '0')}:${String(ff).padStart(2, '0')}`, W - m - fs * .9, ty, fs * .2, 'right');

    const bar = Math.floor(t / 2) + 1, beat = Math.floor((t % 2) / BEAT) + 1;
    ctx.fillStyle = C.red;
    ctx.globalAlpha = a * (.35 + .65 * kp(t));
    ctx.beginPath(); ctx.arc(m + fs * 1.3, H - m - fs * 1.3, fs * .38, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    spaced(`120BPM  ${String(bar).padStart(2, '0')}.${beat}`, m + fs * 2.2, H - m - fs * 1.8, fs * .2, 'left');

    const pw = Math.min(W * .14, 160);
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(W - m - fs * .9 - pw, ty + fs * 1.9, pw, 2);
    ctx.fillStyle = brand(W - m - pw, W - m);
    ctx.fillRect(W - m - fs * .9 - pw, ty + fs * 1.9, pw * clamp(t / DUR), 2);
    ctx.restore();
  }

  function shake(t) {
    if (reduce) return 0;
    let a = dk(t, 4, .5, 7) + dk(t, 16, 1, 4) + dk(t, 24, .4, 7) + dk(t, 28, .35, 5) + .3 * Math.pow(seg(t, 14, 15.75), 2);
    if (t >= 4 && t < 24) a += .1 * kp(t);
    return a * Math.min(W, H) * .03;
  }

  function flash(t) {
    let f = dk(t, 4, .5, 6) + dk(t, 8, .25, 7) + dk(t, 16, 1, 3.5) + dk(t, 24, .55, 5) + dk(t, 28, .4, 4);
    if (t >= 15.2 && t < 15.75) f += .85 * eIn(seg(t, 15.2, 15.75));
    return Math.min(1, f);
  }

  function post(t, still) {
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
    if (grainPat) {
      ctx.save();
      ctx.globalAlpha = .035;
      const f = still ? 0 : Math.floor(t * 24);
      ctx.translate(-rnd(f) * 128, -rnd(f + 99) * 128);
      ctx.fillStyle = grainPat;
      ctx.fillRect(0, 0, W + 128, H + 128);
      ctx.restore();
    }
  }

  function render(t) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    const sh = shake(t);
    ctx.save();
    ctx.translate(Math.sin(t * 97.1) * sh, Math.cos(t * 83.7) * sh);
    const works8 = hasWorks();
    if (t < 4.1) ignite(t);
    if (t >= 4 && t < 8.2) welcome(t);
    if (t >= 8 && t < 10.3) tiles(t);
    if (t >= 9.85 && t < 15.75) tunnel(t);
    if (t >= 15.75 && t < 16) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 1.5 + 2 * seg(t, 15.75, 16), 0, Math.PI * 2); ctx.fill();
    }
    if (t >= 16 && t < (works8 ? 18.1 : 24.1)) drop(t);
    if (works8 && t >= 18 && t < 22) montage(t);
    if (works8 && t >= 22 && t < 24.1) grid(t);
    if (t >= 24 && t < 28.6) logo(t);
    if (t >= 28) finale(t);
    drawRings(t);
    drawParts();
    wipe(t, 7.7, .6, C.red);
    wipe(t, 7.78, .6, C.blue);
    ctx.restore();

    if (t >= 16 && t < 18.1) {
      const g = glitchAmt(t);
      if (g > .25) slices(t, g);
    }
    hud(t);
    const f = flash(t);
    if (f > 0) {
      ctx.fillStyle = `rgba(255,255,255,${f})`;
      ctx.fillRect(0, 0, W, H);
    }
    post(t, false);
  }

  function still(t) {
    if (!W) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    endCard(FULL);
    drawParts();
    post(t || 0, true);
  }

  /* ---------- 進行 ---------- */
  let state = 'poster';
  let raf = 0, lastT = 0, onScreen = true;

  function frame() {
    raf = 0;
    if (state !== 'playing') return;
    const t = Math.max(0, clock());
    if (t >= DUR) { finish(false); return; }
    const dt = clamp(t - lastT, 0, .05);
    lastT = t;
    while (cueI < cues.length && cues[cueI].t <= t) cues[cueI++].f();
    if (onScreen) {
      emit(emberRate(t), dt, t < 3.2);
      stepParts(dt);
      render(t);
    }
    raf = requestAnimationFrame(frame);
  }

  /* 待機中は火の粉だけ動かす。画面外と「動きを減らす」設定では止める */
  let idleLast = 0;
  function idle(now) {
    raf = 0;
    if (state === 'playing') return;
    const dt = clamp((now - idleLast) / 1000, 0, .05);
    idleLast = now;
    emit(7, dt, false);
    stepParts(dt);
    still(now / 1000);
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
    parts.length = 0; rings.length = 0;
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
    rings.length = 0;
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].k === 0) parts.splice(i, 1);
    root.classList.remove('is-playing');
    btnLabel.textContent = 'もう一度見る';
    still();
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
