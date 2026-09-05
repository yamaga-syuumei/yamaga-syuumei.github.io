/* ==========================================================
   効果音

   音声ファイルは持たず、Web Audio でその場で合成する。
   絵と同じ理由で、外部アセットを増やさずに済ませたい。

   ブラウザは利用者の操作より前に音を鳴らすことを禁じているので、
   最初のクリックかキー入力まで AudioContext を作らない。
   ========================================================== */
window.SFX = (function () {
  'use strict';

  var ctx = null, master = null, noiseBuf = null;
  var on = true;

  function ensure() {
    if (!on) return null;
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { on = false; return null; }       // 鳴らせない環境でも遊べるようにする
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.32;
        master.connect(ctx.destination);
        // ホワイトノイズは使い回す。毎回作ると重い
        var len = Math.floor(ctx.sampleRate * 0.7);
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { on = false; return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* ノイズを帯域で削って撃発音や爆発にする */
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

    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + o.dur + 0.02);
  }

  /* 音程のある音。砲の重さや金属音に使う */
  function tone(o) {
    var c = ensure(); if (!c) return;
    var t = c.currentTime + (o.delay || 0);
    var osc = c.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);

    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);

    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + o.dur + 0.02);
  }

  var api = {
    /* 主砲。低い衝撃と、鋭い発射音を重ねる */
    fire: function () {
      tone({ f0: 190, f1: 42, dur: 0.30, gain: 0.55, type: 'triangle' });
      noise({ f0: 1600, f1: 220, dur: 0.24, gain: 0.42, q: 0.8 });
    },
    /* 副砲。軽く短い */
    subFire: function () {
      noise({ f0: 2600, f1: 900, dur: 0.09, gain: 0.24, q: 1.4 });
      tone({ f0: 520, f1: 260, dur: 0.07, gain: 0.16, type: 'square' });
    },
    /* 着弾 */
    hit: function () {
      noise({ f0: 900, f1: 160, dur: 0.18, gain: 0.34, q: 0.7 });
      tone({ f0: 120, f1: 50, dur: 0.16, gain: 0.22, type: 'sine' });
    },
    /* 部位の破壊 */
    destroy: function () {
      noise({ f0: 700, f1: 90, dur: 0.45, gain: 0.5, q: 0.5 });
      tone({ f0: 150, f1: 32, dur: 0.5, gain: 0.4, type: 'triangle' });
      noise({ f0: 3000, f1: 600, dur: 0.12, gain: 0.2, q: 2, delay: 0.02 });
    },
    /* 撃破。長めに尾を引かせる */
    defeat: function () {
      noise({ f0: 600, f1: 60, dur: 0.9, gain: 0.55, q: 0.4 });
      tone({ f0: 120, f1: 26, dur: 0.95, gain: 0.45, type: 'triangle' });
      noise({ f0: 2200, f1: 300, dur: 0.3, gain: 0.25, q: 1.5, delay: 0.05 });
    },
    /* 被弾。自車が殴られた側 */
    damage: function () {
      tone({ f0: 90, f1: 38, dur: 0.22, gain: 0.5, type: 'square' });
      noise({ f0: 500, f1: 120, dur: 0.2, gain: 0.3, q: 0.6 });
    },
    /* 遭遇 */
    encounter: function () {
      tone({ f0: 660, dur: 0.09, gain: 0.3, type: 'square' });
      tone({ f0: 880, dur: 0.12, gain: 0.3, type: 'square', delay: 0.10 });
    },
    /* 買い物 */
    coin: function () {
      tone({ f0: 880, dur: 0.07, gain: 0.26, type: 'square' });
      tone({ f0: 1320, dur: 0.12, gain: 0.24, type: 'square', delay: 0.07 });
    },
    /* 応急修理 */
    repair: function () {
      tone({ f0: 330, f1: 660, dur: 0.22, gain: 0.26, type: 'sine' });
    },
    /* 撤退・離脱 */
    escape: function () {
      tone({ f0: 440, f1: 160, dur: 0.24, gain: 0.26, type: 'triangle' });
    },
    /* クリア */
    clear: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone({ f0: f, dur: 0.28, gain: 0.26, type: 'square', delay: i * 0.13 });
      });
    },

    /* 最初の操作で鳴らせる状態にしておく */
    unlock: function () { ensure(); },
    setEnabled: function (v) {
      on = v;
      if (master) master.gain.value = v ? 0.32 : 0;
      return on;
    },
    isEnabled: function () { return on; }
  };

  return api;
})();
