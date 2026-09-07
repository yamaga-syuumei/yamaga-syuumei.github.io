/* ==========================================================
   効果音

   音声ファイルは持たない。Web Audio でその場で合成する。
   tank/sfx.js と同じ方針・同じ作り。

   BGMは持たない。合成で作ってみたが、鳴らした本人（Claude）は
   音を聴いて確認できず、「エラーが出ない」を「良い音」と
   取り違えていた。tank/ にもBGMは無い（効果音のみ）ので、それに揃える。

   ブラウザは利用者の操作より前に音を鳴らすことを禁じているので、
   最初のクリックかキー入力まで AudioContext を作らない。
   ========================================================== */
window.SFX = (function () {
  'use strict';

  var ctx = null, sfxGain = null, noiseBuf = null;
  var usable = true;                       // この環境で鳴らせるか
  var vol = { sfx: 0.7 };

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

    /* ---- 音量。0〜1 ---- */
    setVolume: function (which, v) {
      v = Math.max(0, Math.min(1, v));
      vol[which] = v;
      if (which === 'sfx' && sfxGain) sfxGain.gain.value = v * 0.42;
    },
    getVolume: function (which) { return vol[which]; },
    isUsable: function () { return usable; },

    /* 最初の操作で鳴らせる状態にしておく */
    unlock: function () { ensure(); }
  };
})();
