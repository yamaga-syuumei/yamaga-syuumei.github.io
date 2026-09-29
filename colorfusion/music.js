/* ==========================================================
   プレイ中の曲と、曲に合わせて鳴る効果音

   曲は録音を流すのではなく、その場で合成して鳴らす。
   盛り上がり（level 0〜9）が上がるほど楽器が重なり、
   テンポと調は段と周で上がる。うまくいっていることが耳で分かる。

   効果音はいま鳴っている和音から音を選ぶ。連鎖が伸びるほど1音ずつ上がるので、
   立て続けに鳴っても濁らず、上っていくアルペジオに聞こえる。

   16分音符を1ステップ、16ステップで1小節、4小節で和音が1巡する。
   少し先まで予約しておき、時計は AudioContext の時刻を使う（画面の揺らぎに引きずられない）。

   Web Audio が使えないブラウザでは ok() が false を返し、sound.js が mp3 に戻す。
   ========================================================== */
window.CFMUS = (function () {
  'use strict';

  var AC = window.AudioContext || window.webkitAudioContext;

  /* 合成音の大きさを、mp3 の効果音と BGM に揃える係数 */
  var MUSIC_GAIN = 0.55;
  var SE_GAIN = 0.9;

  var LOOKAHEAD = 0.14;              // 何秒先まで予約しておくか
  var FILTER_OPEN = 18000;
  var FILTER_DANGER = 1100;          // 光が残りわずかのとき、曲をここまでこもらせる

  /* 和音の進行。1小節に1つ。bass は低音、tones は和音の3音（MIDI 番号）。
     key を足した高さで鳴らす */
  var PROG = [
    { bass: 45, tones: [57, 60, 64] },   // Am
    { bass: 41, tones: [57, 60, 65] },   // F
    { bass: 48, tones: [55, 60, 64] },   // C
    { bass: 43, tones: [55, 59, 62] }    // G
  ];
  /* 盛り上がりが上がりきったときに乗る旋律。8分音符で1小節8つ、0 は休み */
  var HOOK = [
    [76, 0, 74, 72, 0, 72, 74, 76],
    [77, 0, 76, 72, 0, 69, 72, 0],
    [79, 0, 76, 72, 0, 76, 74, 72],
    [74, 0, 71, 67, 71, 74, 79, 0]
  ];
  /* 低い盛り上がりのときの、柔らかい8分のアルペジオ。和音の何番目を鳴らすか。3 は根音の1オクターブ上 */
  var PLUCK = [0, 1, 2, 1, 3, 2, 1, 2];
  var ARP = [0, 1, 2, 3, 2, 1, 2, 3];

  var ac = null;
  var master = null, musBus = null, lp = null, duckG = null, seBus = null;
  var rev = null, revIn = null, dly = null, dlyIn = null, dlyFb = null;
  var vol = { bgm: 0.4, se: 0.7 };

  var seq = {
    on: false, step: 0, next: 0,
    level: 0, bpm: 120, key: 0,
    danger: false,
    kicks: [], beats: []
  };
  var timer = null;
  var noiseBuf = null;

  /* dev:start */
  var capture = null;                // 確認用。予約した音を並べて残す
  /* dev:end */

  function ok() { return !!AC; }
  function now() { return ac ? ac.currentTime : 0; }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function stepDur() { return 60 / seq.bpm / 4; }

  /* ---------- 組み立て ---------- */

  /* 最初の操作のあとで呼ぶ。それより前に作ると、ブラウザが音を止めたままにする */
  function boot() {
    if (!AC) return false;
    if (ac) { if (ac.state === 'suspended' && !document.hidden) ac.resume(); return true; }
    try { ac = new AC(); } catch (e) { AC = null; return false; }

    master = ac.createGain();
    master.gain.value = 1;
    /* 大きい音が重なっても割れないよう、最後に圧縮をかける */
    var comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ac.destination);

    musBus = ac.createGain();
    lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = FILTER_OPEN; lp.Q.value = 0.8;
    duckG = ac.createGain();
    musBus.connect(lp); lp.connect(duckG); duckG.connect(master);

    seBus = ac.createGain();
    seBus.connect(master);

    /* 残響。合成したインパルス応答を畳み込む */
    rev = ac.createConvolver();
    rev.buffer = impulse(2.4, 2.6);
    revIn = ac.createGain(); revIn.gain.value = 1;
    var revOut = ac.createGain(); revOut.gain.value = 0.32;
    revIn.connect(rev); rev.connect(revOut); revOut.connect(master);

    /* 付点8分のディレイ。テンポが変わったら合わせ直す */
    dly = ac.createDelay(1.5);
    dlyIn = ac.createGain(); dlyIn.gain.value = 1;
    dlyFb = ac.createGain(); dlyFb.gain.value = 0.32;
    var dlyLp = ac.createBiquadFilter(); dlyLp.type = 'lowpass'; dlyLp.frequency.value = 3200;
    var dlyOut = ac.createGain(); dlyOut.gain.value = 0.28;
    dlyIn.connect(dly); dly.connect(dlyLp); dlyLp.connect(dlyFb); dlyFb.connect(dly);
    dlyLp.connect(dlyOut); dlyOut.connect(master);
    dly.delayTime.value = stepDur() * 3;

    noiseBuf = makeNoise(1.5);
    applyVol();

    /* 裏に回ったら止める。タイマーが間引かれて曲が途切れ途切れになるため */
    document.addEventListener('visibilitychange', function () {
      if (!ac) return;
      if (document.hidden) ac.suspend();
      else { ac.resume(); seq.next = Math.max(seq.next, now() + 0.05); }
    });
    return true;
  }

  function impulse(sec, decay) {
    var len = Math.floor(ac.sampleRate * sec);
    var buf = ac.createBuffer(2, len, ac.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = buf.getChannelData(c);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function makeNoise(sec) {
    var len = Math.floor(ac.sampleRate * sec);
    var buf = ac.createBuffer(1, len, ac.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function applyVol() {
    if (!ac) return;
    var t = now();
    musBus.gain.setTargetAtTime(vol.bgm * MUSIC_GAIN, t, 0.05);
    seBus.gain.setTargetAtTime(vol.se * SE_GAIN, t, 0.02);
  }

  /* ---------- 部品 ---------- */

  function env(g, t, a, peak, d, sustain, hold, r) {
    var p = g.gain;
    p.cancelScheduledValues(t);
    p.setValueAtTime(0.0001, t);
    p.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    var s = Math.max(0.0001, peak * sustain);
    p.exponentialRampToValueAtTime(s, t + a + d);
    if (hold > 0) p.setValueAtTime(s, t + a + d + hold);
    p.exponentialRampToValueAtTime(0.0001, t + a + d + hold + r);
    return t + a + d + hold + r;
  }

  function voice(bus) {
    var g = ac.createGain();
    g.gain.value = 0;
    g.connect(bus);
    return g;
  }

  function osc(type, f, t, stop, dest, detune) {
    var o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (detune) o.detune.value = detune;
    o.connect(dest);
    o.start(t); o.stop(stop + 0.02);
    return o;
  }

  function noise(t, stop, dest) {
    var s = ac.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    s.connect(dest);
    s.start(t, Math.random() * 1.2); s.stop(stop + 0.02);
    return s;
  }

  function filter(type, f, q) {
    var b = ac.createBiquadFilter();
    b.type = type; b.frequency.value = f; b.Q.value = q || 0.7;
    return b;
  }

  /* 残響とディレイへの送り */
  function send(node, r, d) {
    if (r) { var a = ac.createGain(); a.gain.value = r; node.connect(a); a.connect(revIn); }
    if (d) { var b = ac.createGain(); b.gain.value = d; node.connect(b); b.connect(dlyIn); }
  }

  /* ---------- 楽器 ---------- */

  var INST = {
    kick: function (t, p, bus) {
      var g = voice(bus);
      var stop = env(g, t, 0.002, p.v || 0.9, 0.12, 0.3, 0, 0.22);
      var o = osc('sine', 160, t, stop, g);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      /* 頭のアタック */
      var c = voice(bus), hp = filter('highpass', 2500);
      hp.connect(c);
      env(c, t, 0.001, (p.v || 0.9) * 0.25, 0.01, 0.01, 0, 0.01);
      noise(t, t + 0.03, hp);
    },
    clap: function (t, p, bus) {
      var bp = filter('bandpass', 1300, 1.2), g = voice(bus);
      bp.connect(g);
      /* 手を3回ずらして叩いたように、短い山を重ねる */
      g.gain.setValueAtTime(0.0001, t);
      [0, 0.011, 0.022].forEach(function (o) {
        g.gain.setValueAtTime((p.v || 0.6) * 0.9, t + o);
        g.gain.exponentialRampToValueAtTime(0.05, t + o + 0.009);
      });
      g.gain.setValueAtTime((p.v || 0.6) * 0.7, t + 0.033);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      noise(t, t + 0.24, bp);
      send(g, 0.25, 0);
    },
    snare: function (t, p, bus) {
      var g = voice(bus), bp = filter('bandpass', 1900, 0.9);
      bp.connect(g);
      var stop = env(g, t, 0.001, p.v || 0.5, 0.05, 0.3, 0, 0.12);
      noise(t, stop, bp);
      var b = voice(bus);
      env(b, t, 0.001, (p.v || 0.5) * 0.5, 0.05, 0.1, 0, 0.05);
      osc('triangle', 200, t, t + 0.12, b);
    },
    hat: function (t, p, bus) {
      var g = voice(bus), hp = filter('highpass', 7500);
      hp.connect(g);
      var stop = env(g, t, 0.001, p.v || 0.2, p.open ? 0.08 : 0.02, 0.2, 0, p.open ? 0.18 : 0.03);
      noise(t, stop, hp);
    },
    shaker: function (t, p, bus) {
      var g = voice(bus), hp = filter('highpass', 5500);
      hp.connect(g);
      var stop = env(g, t, 0.006, p.v || 0.05, 0.02, 0.2, 0, 0.04);
      noise(t, stop, hp);
    },
    crash: function (t, p, bus) {
      var g = voice(bus), hp = filter('highpass', 4200);
      hp.connect(g);
      var stop = env(g, t, 0.002, p.v || 0.3, 0.2, 0.25, 0, 1.3);
      noise(t, stop, hp);
      send(g, 0.4, 0);
    },
    bass: function (t, p, bus) {
      var g = voice(bus), f = filter('lowpass', 260, 6);
      f.connect(g);
      var dur = p.dur || stepDur() * 2;
      var stop = env(g, t, 0.004, p.v || 0.4, dur * 0.4, 0.55, dur * 0.3, 0.06);
      f.frequency.setValueAtTime(900, t);
      f.frequency.exponentialRampToValueAtTime(220, t + dur * 0.8);
      osc('sawtooth', mtof(p.m), t, stop, f);
      osc('square', mtof(p.m - 12), t, stop, f, 4);
    },
    pad: function (t, p, bus) {
      var g = voice(bus), f = filter('lowpass', p.bright || 900, 0.6);
      f.connect(g);
      var dur = p.dur || 2;
      var stop = env(g, t, dur * 0.3, p.v || 0.05, dur * 0.2, 0.8, dur * 0.3, dur * 0.4);
      p.notes.forEach(function (m) {
        osc('sawtooth', mtof(m), t, stop, f, -8);
        osc('sawtooth', mtof(m), t, stop, f, 8);
      });
      send(g, 0.5, 0);
    },
    pluck: function (t, p, bus) {
      var g = voice(bus);
      var stop = env(g, t, 0.002, p.v || 0.12, 0.08, 0.2, 0, 0.3);
      osc('triangle', mtof(p.m), t, stop, g);
      send(g, 0.2, 0.35);
    },
    arp: function (t, p, bus) {
      var g = voice(bus), f = filter('lowpass', 2600, 2);
      f.connect(g);
      var stop = env(g, t, 0.002, p.v || 0.07, 0.05, 0.2, 0, 0.08);
      osc('square', mtof(p.m), t, stop, f);
      send(g, 0.1, 0.4);
    },
    stab: function (t, p, bus) {
      var g = voice(bus), f = filter('lowpass', 2200, 1);
      f.connect(g);
      var stop = env(g, t, 0.003, p.v || 0.08, 0.06, 0.3, 0, 0.12);
      p.notes.forEach(function (m) {
        osc('sawtooth', mtof(m), t, stop, f, -10);
        osc('sawtooth', mtof(m), t, stop, f, 10);
      });
      send(g, 0.25, 0.2);
    },
    lead: function (t, p, bus) {
      var g = voice(bus), f = filter('lowpass', 3400, 1.5);
      f.connect(g);
      var dur = p.dur || stepDur() * 2;
      var stop = env(g, t, 0.01, p.v || 0.08, 0.06, 0.7, dur * 0.6, 0.12);
      var a = osc('sawtooth', mtof(p.m), t, stop, f, -7);
      var b = osc('sawtooth', mtof(p.m), t, stop, f, 7);
      /* 少し遅れてかかるビブラート */
      var lfo = ac.createOscillator(), lg = ac.createGain();
      lfo.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(12, t + 0.25);
      lfo.connect(lg); lg.connect(a.detune); lg.connect(b.detune);
      lfo.start(t); lfo.stop(stop + 0.02);
      send(g, 0.3, 0.35);
    },
    choir: function (t, p, bus) {
      var g = voice(bus), f = filter('lowpass', 1800, 0.5);
      f.connect(g);
      var dur = p.dur || 2;
      var stop = env(g, t, dur * 0.35, p.v || 0.05, dur * 0.2, 0.8, dur * 0.2, dur * 0.4);
      p.notes.forEach(function (m) {
        osc('triangle', mtof(m), t, stop, f, -5);
        osc('sine', mtof(m + 12), t, stop, f, 5);
      });
      send(g, 0.7, 0);
    },
    /* 効果音の鈴。整数倍でない倍音を足して、金属のきらめきにする */
    bell: function (t, p, bus) {
      var g = voice(bus);
      var dur = p.dur || 0.8;
      var stop = env(g, t, 0.002, p.v || 0.14, 0.05, 0.35, 0, dur);
      osc('sine', mtof(p.m), t, stop, g);
      var h = voice(bus);
      env(h, t, 0.002, (p.v || 0.14) * 0.35, 0.03, 0.2, 0, dur * 0.5);
      osc('sine', mtof(p.m) * 2.76, t, stop, h);
      if (p.pan) { /* 左右に散らして、重なっても1つの点にならないようにする */
        var pn = ac.createStereoPanner ? ac.createStereoPanner() : null;
        if (pn) { pn.pan.value = p.pan; g.disconnect(); g.connect(pn); pn.connect(bus); }
      }
      send(g, 0.45, 0.25);
    },
    impact: function (t, p, bus) {
      var g = voice(bus);
      var stop = env(g, t, 0.003, p.v || 0.6, 0.2, 0.3, 0, 0.7);
      var o = osc('sine', 90, t, stop, g);
      o.frequency.exponentialRampToValueAtTime(32, t + 0.6);
      var n = voice(bus), f = filter('lowpass', 600);
      f.connect(n);
      env(n, t, 0.002, (p.v || 0.6) * 0.5, 0.1, 0.2, 0, 0.5);
      noise(t, t + 0.7, f);
      send(g, 0.3, 0);
    },
    riser: function (t, p, bus) {
      var dur = p.dur || 2;
      var g = voice(bus), f = filter('bandpass', 400, 2.5);
      f.connect(g);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(p.v || 0.2, t + dur * 0.95);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
      f.frequency.setValueAtTime(400, t);
      f.frequency.exponentialRampToValueAtTime(7000, t + dur);
      noise(t, t + dur + 0.08, f);
      send(g, 0.3, 0);
    }
  };

  /* 予約の窓口。確認用の記録もここで取る */
  function play(name, t, p, bus) {
    /* dev:start */
    if (capture) { capture.push({ n: name, t: +(t - capture.t0).toFixed(3), s: seq.step }); return; }
    /* dev:end */
    if (!ac) return;
    INST[name](t, p || {}, bus || musBus);
  }

  /* 曲をいったん引っ込めて戻す。大きい一撃の直後に周りを空け、一撃を目立たせる */
  function duck(t, depth, dur) {
    /* dev:start */
    if (capture) return;
    /* dev:end */
    if (!ac) return;
    var g = duckG.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(1 - depth, t + 0.01);
    g.linearRampToValueAtTime(1, t + dur);
  }

  /* ---------- 曲 ---------- */

  function chordAt(step) { return PROG[Math.floor(step / 16) % PROG.length]; }

  function scheduleStep(step, t) {
    var s = step % 16;
    var bar = Math.floor(step / 16) % PROG.length;
    var L = seq.level;
    var k = seq.key;
    var ch = PROG[bar];

    if (s % 4 === 0) { seq.beats.push({ t: t, beat: Math.floor(step / 4) }); if (seq.beats.length > 64) seq.beats.shift(); }

    /* いつも鳴っている層。和音と、盛り上がりが低いうちの柔らかい分散和音 */
    if (s === 0) play('pad', t, { notes: ch.tones.map(function (m) { return m + k; }),
      dur: stepDur() * 15, v: 0.045 + 0.03 * Math.min(L, 8) / 8, bright: 700 + 220 * L });
    if (s % 2 === 0 && L < 6) {
      var pi = PLUCK[(s / 2) % 8];
      var pm = pi === 3 ? ch.tones[0] + 12 : ch.tones[pi];
      play('pluck', t, { m: pm + 12 + k, v: 0.11 * (1 - L / 7) });
    }
    play('shaker', t, { v: (s % 2 ? 0.04 : 0.025) * (0.6 + L / 10) });

    /* キック。はじめは1拍目と3拍目、盛り上がると4つ打ち */
    var kick = (L >= 3 && s % 4 === 0) || (L >= 1 && (s === 0 || s === 8));
    if (kick) {
      play('kick', t, { v: L < 3 ? 0.7 : 0.95 });
      seq.kicks.push(t); if (seq.kicks.length > 64) seq.kicks.shift();
      if (L >= 6) duck(t, 0.32, stepDur() * 3);
    }
    /* 低音。裏拍に置くと、4つ打ちのキックと噛み合って前へ進む */
    if (L >= 2) {
      if (L >= 7 && s % 4 !== 0) play('bass', t, { m: ch.bass + k + (s % 2 ? 12 : 0), dur: stepDur() * 0.9, v: 0.34 });
      else if (L < 7 && s % 4 === 2) play('bass', t, { m: ch.bass + k, dur: stepDur() * 1.6, v: 0.4 });
    }
    if (L >= 3 && (s === 4 || s === 12)) play('clap', t, { v: 0.6 });
    if (L >= 4 && s % 4 === 2) play('hat', t, { v: 0.16, open: L >= 6 });
    if (L >= 4 && s % 2 === 1) play('hat', t, { v: 0.05 });
    if (L >= 5) {
      var ai = ARP[s % 8];
      var am = ai === 3 ? ch.tones[0] + 12 : ch.tones[ai];
      play('arp', t, { m: am + 12 + (s >= 8 && L >= 8 ? 12 : 0) + k, v: 0.05 });
    }
    if (L >= 6 && s % 8 === 6) play('stab', t, { notes: ch.tones.map(function (m) { return m + 12 + k; }), v: 0.06 });
    if (L >= 8 && s % 2 === 0) {
      var hm = HOOK[bar][s / 2];
      if (hm) play('lead', t, { m: hm + k, dur: stepDur() * 1.7, v: 0.07 });
    }
    if (L >= 9 && s === 0) play('choir', t, { notes: ch.tones.map(function (m) { return m + 12 + k; }), dur: stepDur() * 15, v: 0.045 });
    if (L >= 9 && s === 0 && bar === 0) play('crash', t, { v: 0.22 });
    /* 4小節目の後ろでスネアを詰めて、次の頭へ持ち上げる */
    if (L >= 5 && bar === 3 && s >= 12) play('snare', t, { v: 0.14 + (s - 12) * 0.07 });
  }

  function tick() {
    if (!ac || !seq.on) return;
    var horizon = now() + LOOKAHEAD;
    /* 大きく遅れていたら（裏から戻ったなど）追いかけずに今から刻み直す */
    if (seq.next < now() - 0.25) seq.next = now() + 0.03;
    while (seq.next < horizon) {
      scheduleStep(seq.step, seq.next);
      seq.next += stepDur();
      seq.step++;
    }
  }

  function start() {
    if (!boot()) return;
    if (seq.on) return;
    seq.on = true;
    seq.step = 0;
    seq.next = now() + 0.06;
    seq.kicks.length = 0; seq.beats.length = 0;
    seq.danger = false;
    lp.frequency.cancelScheduledValues(now());
    lp.frequency.setValueAtTime(FILTER_OPEN, now());
    duckG.gain.cancelScheduledValues(now());
    duckG.gain.setValueAtTime(1, now());
    musBus.gain.cancelScheduledValues(now());
    musBus.gain.setValueAtTime(0.0001, now());
    musBus.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol.bgm * MUSIC_GAIN), now() + 0.4);
    if (!timer) timer = setInterval(tick, 25);
    tick();
  }

  /* 止める。fade 秒かけて絞ってから刻むのをやめる */
  function stop(fade) {
    if (!ac || !seq.on) return;
    var f = fade === undefined ? 0.6 : fade;
    var t = now();
    musBus.gain.cancelScheduledValues(t);
    musBus.gain.setValueAtTime(Math.max(0.0001, musBus.gain.value), t);
    musBus.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.02, f));
    seq.on = false;
    setTimeout(function () { if (!seq.on) applyVol(); }, (f + 0.1) * 1000);
  }

  /* 盛り上がり 0〜9。小数でよい。しきい値を越えた楽器から次の拍で入る */
  function setLevel(v) { seq.level = Math.max(0, Math.min(9, v)); }

  function setTempo(bpm) {
    bpm = Math.max(80, Math.min(170, bpm));
    if (Math.abs(bpm - seq.bpm) < 0.01) return;
    seq.bpm = bpm;
    if (ac) dly.delayTime.setTargetAtTime(stepDur() * 3, now(), 0.1);
  }

  function setKey(semi) { seq.key = semi; }

  /* 光が残りわずか。曲をこもらせ、せり上がる音で急かす */
  function danger(on) {
    if (!ac || on === seq.danger) return;
    seq.danger = on;
    var t = now();
    lp.frequency.cancelScheduledValues(t);
    lp.frequency.setValueAtTime(lp.frequency.value, t);
    if (on) {
      lp.frequency.exponentialRampToValueAtTime(FILTER_DANGER, t + 0.5);
      play('riser', t, { dur: 2.4, v: 0.14 });
    } else {
      lp.frequency.exponentialRampToValueAtTime(FILTER_OPEN, t + 0.25);
      play('crash', t, { v: 0.2 });
    }
  }

  /* 段が変わった。次の小節の頭へ飛んで、衝撃音とシンバルで区切る */
  function drop(big) {
    if (!ac || !seq.on) return;
    seq.step = Math.ceil(seq.step / 16) * 16;
    seq.next = now() + 0.02;
    var t = seq.next;
    play('crash', t, { v: big ? 0.4 : 0.26 });
    play('impact', t, { v: big ? 0.7 : 0.45 });
    duck(t, 0.4, 0.5);
  }

  /* ---------- 効果音 ---------- */

  /* いまの和音の i 番目の音。3つ目より上はオクターブを重ねて上っていく */
  function tone(i) {
    var ch = chordAt(seq.on ? seq.step : 0);
    return ch.tones[i % 3] + 12 * Math.floor(i / 3) + seq.key;
  }

  var SFX = {
    /* 融合。連鎖が1つ伸びるごとに和音の上を1音ずつ上がる */
    fuse: function (p) {
      var c = Math.max(0, (p.chain || 1) - 1);
      var m = Math.min(100, tone(c) + 12);
      var t = now();
      var big = Math.min(1, (p.size || 1) / 12);
      play('bell', t, { m: m, v: 0.12 + big * 0.06, dur: 0.6 + big * 0.5, pan: (c % 2 ? 0.25 : -0.25) }, seBus);
      if (big > 0.5) play('bell', t + 0.05, { m: m + 7, v: 0.08, dur: 0.7 }, seBus);
    },
    /* コアが吸い込んだ。量が大きいほど和音を厚く */
    absorb: function (p) {
      var g = Math.min(1, (p.amount || 1) / 60);
      var t = now();
      var root = tone(0);
      play('pluck', t, { m: root, v: 0.16 + g * 0.1 }, seBus);
      play('pluck', t + 0.03, { m: root + 7, v: 0.1 + g * 0.08 }, seBus);
      if (g > 0.25) play('stab', t, { notes: [root + 12, tone(1) + 12, tone(2) + 12], v: 0.04 + g * 0.06 }, seBus);
      if (g > 0.6) play('impact', t, { v: 0.25 + g * 0.2 }, seBus);
    },
    /* 連鎖が切れた。伸びた数だけ和音を駆け上がって締める */
    chain: function (p) {
      var n = Math.min(10, 3 + Math.floor((p.chain || 3) / 3));
      var t = now();
      for (var i = 0; i < n; i++) play('bell', t + i * 0.045, { m: Math.min(100, tone(i) + 12), v: 0.08, dur: 0.5, pan: (i % 2 ? 0.3 : -0.3) }, seBus);
    },
    /* 連鎖の節目。駆け上がりに衝撃音とシンバルを重ねる */
    milestone: function (p) {
      var t = now();
      var root = tone(0);
      [0, 4, 7, 12, 16, 19, 24].forEach(function (d, i) {
        play('bell', t + i * 0.05, { m: Math.min(104, root + 12 + d), v: 0.1, dur: 0.9, pan: (i % 2 ? 0.35 : -0.35) }, seBus);
      });
      play('crash', t, { v: 0.3 }, seBus);
      play('impact', t, { v: 0.5 }, seBus);
      duck(t, 0.35, 0.45);
      if ((p.chain || 0) >= 30) play('choir', t, { notes: [root + 12, root + 16, root + 19], dur: 1.4, v: 0.06 }, seBus);
    },
    stage: function () { /* 段の区切りは drop() が曲の側で鳴らす */ },
    lap: function () {
      var t = now();
      play('riser', t, { dur: 0.6, v: 0.18 }, seBus);
    }
  };

  function sfx(name, p) {
    if (!boot() || !SFX[name]) return false;
    SFX[name](p || {});
    return true;
  }

  /* 絵を拍に合わせるための値。kick は直前のキックからの減衰（0〜1） */
  function pulse() {
    if (!ac || !seq.on) return { kick: 0, beat: 0, phase: 0 };
    var t = now(), kp = 0, i;
    for (i = seq.kicks.length - 1; i >= 0; i--) {
      if (seq.kicks[i] <= t) { kp = Math.exp(-(t - seq.kicks[i]) * 8); break; }
    }
    var phase = 0, beat = 0;
    for (i = seq.beats.length - 1; i >= 0; i--) {
      if (seq.beats[i].t <= t) { phase = (t - seq.beats[i].t) / (stepDur() * 4); beat = seq.beats[i].beat; break; }
    }
    return { kick: kp, beat: beat, phase: Math.min(1, phase) };
  }

  function setVol(kind, v) { vol[kind] = v; applyVol(); }

  return {
    ok: ok, boot: boot,
    start: start, stop: stop, playing: function () { return seq.on; },
    setLevel: setLevel, setTempo: setTempo, setKey: setKey,
    danger: danger, drop: drop,
    sfx: sfx, has: function (n) { return !!SFX[n]; },
    pulse: pulse, setVol: setVol, tick: tick,
    /* dev:start */
    state: function () {
      return { on: seq.on, level: seq.level, bpm: seq.bpm, key: seq.key, step: seq.step,
        danger: seq.danger, ctx: ac ? ac.state : 'none',
        lp: lp ? Math.round(lp.frequency.value) : null };
    },
    /* 予約した音を記録する。sec 秒ぶん先まで刻んで、何がいつ鳴るかを返す */
    capture: function (sec) {
      if (!boot()) return null;
      capture = [];
      capture.t0 = seq.next;
      var end = seq.next + sec;
      var keep = { on: seq.on, next: seq.next, step: seq.step, kicks: seq.kicks.length, beats: seq.beats.length };
      seq.on = true;
      while (seq.next < end) { scheduleStep(seq.step, seq.next); seq.next += stepDur(); seq.step++; }
      /* 記録のために進めた分は戻す。戻さないと本物の曲がその秒数だけ黙る */
      seq.on = keep.on; seq.next = keep.next; seq.step = keep.step;
      seq.kicks.length = keep.kicks; seq.beats.length = keep.beats;
      var out = capture; capture = null;
      return out;
    },
    /* dev:end */
    INST: INST
  };
})();
