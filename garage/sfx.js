/* ==========================================================
   音（効果音とBGM）

   音声ファイルは持たない。Web Audio でその場で合成する。
   tank/sfx.js と同じ方針だが、こちらは

   - 効果音とBGMで音量を別々に持つ（設定画面から変えられる）
   - BGMも合成する。荒野なので、埋まるより空いている方を選ぶ

   ブラウザは利用者の操作より前に音を鳴らすことを禁じているので、
   最初のクリックかキー入力まで AudioContext を作らない。
   ========================================================== */
window.SFX = (function () {
  'use strict';

  var ctx = null, sfxGain = null, bgmGain = null, noiseBuf = null;
  var usable = true;                       // この環境で鳴らせるか
  var vol = { sfx: 0.7, bgm: 0.3 };

  function ensure() {
    if (!usable) return null;
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { usable = false; return null; }
      try {
        ctx = new AC();
        sfxGain = ctx.createGain();
        sfxGain.gain.value = vol.sfx * 0.42;
        sfxGain.connect(ctx.destination);

        bgmGain = ctx.createGain();
        bgmGain.gain.value = vol.bgm * 0.30;
        bgmGain.connect(ctx.destination);

        var len = Math.floor(ctx.sampleRate * 0.7);
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { usable = false; return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* ==========================================================
     素材
     ========================================================== */
  function noise(o) {
    var c = ensure(); if (!c) return;
    var t = c.currentTime + (o.delay || 0);
    var src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = o.rate || 1;

    var f = c.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
    f.Q.value = o.q == null ? 1 : o.q;

    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);

    src.connect(f); f.connect(g); g.connect(o.bus || sfxGain);
    src.start(t); src.stop(t + o.dur + 0.02);
  }

  function tone(o) {
    var c = ensure(); if (!c) return;
    var t = (o.at != null ? o.at : c.currentTime) + (o.delay || 0);
    var osc = c.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);

    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);

    osc.connect(g); g.connect(o.bus || sfxGain);
    osc.start(t); osc.stop(t + o.dur + 0.02);
  }

  /* 連射のときに音が団子になるので、同じ音は間隔を空ける */
  var last = {};
  function throttle(key, ms) {
    var now = Date.now();
    if (last[key] && now - last[key] < ms) return false;
    last[key] = now;
    return true;
  }

  /* ==========================================================
     BGM

     ルックアヘッド方式。少し先の音を予約し続ける。
     setInterval だけで鳴らすとタイミングが揺れて聞けたものにならない。

     音階はAマイナーペンタトニック。空きの多い譜面にして、
     ずっと流していても邪魔にならないようにする。
     ========================================================== */
  var SCALE = [55.00, 65.41, 73.42, 82.41, 98.00];      // A1 C2 D2 E2 G2
  var BGM = {
    on: false, timer: null, step: 0, nextAt: 0, mood: 'calm'
  };
  var MOOD = {
    calm:  { spb: 0.72, bass: 0.30, hat: 0.05, lead: 0.10, drive: 0 },
    fight: { spb: 0.48, bass: 0.34, hat: 0.09, lead: 0.13, drive: 1 },
    boss:  { spb: 0.42, bass: 0.40, hat: 0.11, lead: 0.16, drive: 2 }
  };

  function schedule() {
    var c = ensure(); if (!c || !BGM.on) return;
    var m = MOOD[BGM.mood] || MOOD.calm;

    while (BGM.nextAt < c.currentTime + 0.35) {
      var s = BGM.step;
      var t = BGM.nextAt;
      var bar = Math.floor(s / 8) % 4;

      /* 低音。1拍目と、小節によって5拍目 */
      if (s % 8 === 0 || (s % 8 === 4 && bar % 2 === 1)) {
        var root = SCALE[[0, 0, 2, 1][bar]];
        tone({ at: t, f0: root, f1: root * 0.98, dur: m.spb * 1.8, gain: m.bass, type: 'triangle', bus: bgmGain });
        tone({ at: t, f0: root * 2, dur: m.spb * 0.9, gain: m.bass * 0.35, type: 'sine', bus: bgmGain });
      }

      /* 砂を踏むような刻み */
      if (s % 2 === (m.drive ? 0 : 1)) {
        noise({ f0: 5200, f1: 3000, dur: 0.05, gain: m.hat, q: 1.2, filter: 'highpass', bus: bgmGain, delay: t - c.currentTime });
      }
      /* 打点。戦闘中だけ増やす */
      if (m.drive && s % 8 === 4) {
        noise({ f0: 240, f1: 90, dur: 0.16, gain: m.hat * 2.2, q: 0.7, bus: bgmGain, delay: t - c.currentTime });
      }

      /* まばらに乗る旋律。同じ並びを繰り返さないよう小節で拾う音を変える */
      var leadAt = [3, 6, 11, 14, 19, 22, 27, 30];
      if (leadAt.indexOf(s % 32) >= 0 && Math.random() < 0.55) {
        var n = SCALE[(s + bar) % SCALE.length] * 4;
        tone({ at: t, f0: n, dur: m.spb * 1.1, gain: m.lead, type: 'square', bus: bgmGain });
      }

      BGM.step = (s + 1) % 64;
      BGM.nextAt += m.spb / 2;
    }
  }

  function bgmStart() {
    var c = ensure(); if (!c) return;
    if (BGM.on) return;
    BGM.on = true;
    BGM.step = 0;
    BGM.nextAt = c.currentTime + 0.1;
    if (BGM.timer) clearInterval(BGM.timer);
    BGM.timer = setInterval(schedule, 120);
    schedule();
  }

  function bgmStop() {
    BGM.on = false;
    if (BGM.timer) { clearInterval(BGM.timer); BGM.timer = null; }
  }

  /* ==========================================================
     外に出すもの
     ========================================================== */
  return {
    /* ---- 効果音 ---- */
    fire: function () {
      if (!throttle('fire', 60)) return;
      tone({ f0: 190, f1: 42, dur: 0.28, gain: 0.5, type: 'triangle' });
      noise({ f0: 1600, f1: 220, dur: 0.22, gain: 0.38, q: 0.8 });
    },
    subFire: function () {
      if (!throttle('sub', 45)) return;
      noise({ f0: 2600, f1: 900, dur: 0.08, gain: 0.18, q: 1.4 });
      tone({ f0: 520, f1: 260, dur: 0.06, gain: 0.12, type: 'square' });
    },
    special: function () {
      noise({ f0: 400, f1: 3000, dur: 0.28, gain: 0.3, q: 0.6 });
      tone({ f0: 120, f1: 700, dur: 0.3, gain: 0.3, type: 'sawtooth' });
      noise({ f0: 900, f1: 120, dur: 0.3, gain: 0.36, q: 0.5, delay: 0.26 });
    },
    damage: function () {
      if (!throttle('dmg', 60)) return;
      tone({ f0: 90, f1: 38, dur: 0.2, gain: 0.44, type: 'square' });
      noise({ f0: 500, f1: 120, dur: 0.18, gain: 0.26, q: 0.6 });
    },
    defeat: function () {
      noise({ f0: 600, f1: 60, dur: 0.9, gain: 0.5, q: 0.4 });
      tone({ f0: 120, f1: 26, dur: 0.95, gain: 0.4, type: 'triangle' });
      noise({ f0: 2200, f1: 300, dur: 0.3, gain: 0.22, q: 1.5, delay: 0.05 });
    },
    lose: function () {
      [330, 262, 208, 156].forEach(function (f, i) {
        tone({ f0: f, dur: 0.42, gain: 0.26, type: 'triangle', delay: i * 0.2 });
      });
    },
    clear: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone({ f0: f, dur: 0.3, gain: 0.26, type: 'square', delay: i * 0.13 });
      });
    },
    pick: function () { tone({ f0: 660, dur: 0.05, gain: 0.16, type: 'square' }); },
    place: function () {
      tone({ f0: 300, f1: 520, dur: 0.07, gain: 0.22, type: 'square' });
      noise({ f0: 1800, dur: 0.04, gain: 0.14, q: 2 });
    },
    deny: function () { tone({ f0: 150, f1: 90, dur: 0.12, gain: 0.24, type: 'square' }); },
    rotate: function () { tone({ f0: 880, f1: 1180, dur: 0.05, gain: 0.13, type: 'square' }); },
    coin: function () {
      tone({ f0: 880, dur: 0.07, gain: 0.24, type: 'square' });
      tone({ f0: 1320, dur: 0.12, gain: 0.22, type: 'square', delay: 0.07 });
    },
    repair: function () { tone({ f0: 330, f1: 660, dur: 0.22, gain: 0.24, type: 'sine' }); },
    upgrade: function () {
      [523, 784, 1047].forEach(function (f, i) {
        tone({ f0: f, dur: 0.16, gain: 0.2, type: 'square', delay: i * 0.07 });
      });
    },
    select: function () {
      tone({ f0: 520, dur: 0.06, gain: 0.16, type: 'square' });
      tone({ f0: 780, dur: 0.09, gain: 0.14, type: 'square', delay: 0.05 });
    },
    encounter: function () {
      tone({ f0: 660, dur: 0.09, gain: 0.28, type: 'square' });
      tone({ f0: 880, dur: 0.14, gain: 0.28, type: 'square', delay: 0.1 });
    },

    /* ---- BGM ---- */
    bgmStart: bgmStart,
    bgmStop: bgmStop,
    /* 場面で曲調を切り替える。calm / fight / boss */
    bgmMood: function (m) {
      if (MOOD[m]) BGM.mood = m;
    },

    /* ---- 音量。0〜1 ---- */
    setVolume: function (which, v) {
      v = Math.max(0, Math.min(1, v));
      vol[which] = v;
      if (which === 'sfx' && sfxGain) sfxGain.gain.value = v * 0.42;
      if (which === 'bgm' && bgmGain) bgmGain.gain.value = v * 0.30;
      /* 0 にしたらBGMは止める。無音のまま回し続ける意味がない */
      if (which === 'bgm') {
        if (v <= 0) bgmStop();
        else if (!BGM.on && ctx) bgmStart();
      }
    },
    getVolume: function (which) { return vol[which]; },
    isUsable: function () { return usable; },

    /* 最初の操作で鳴らせる状態にしておく */
    unlock: function () {
      ensure();
      if (vol.bgm > 0) bgmStart();
    }
  };
})();
