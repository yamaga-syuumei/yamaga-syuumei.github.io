/* ==========================================================
   音（効果音とBGM）

   ここから先は合成ではなく、素材を同梱している。
   4つの効果音（主砲・副砲・着弾/被弾・クリック）だけを実素材にして、
   それ以外（部位破壊・撃破・遭遇・応急修理・撤退・クリア）は
   合う素材が無いため、これまでどおり Web Audio の合成のままにした。

   出どころと利用規約：index.html の「音について」を参照。

   効果音は Audio() を複数プールして使い回す（連射で音が重なっても
   途切れないように）。BGMは場面ごとに専用の Audio() を持ち、
   切り替え時はクロスフェードする。

   ブラウザは利用者の操作より前に音を鳴らすことを禁じているので、
   最初のクリックかキー入力まで再生を試みない。
   ========================================================== */
window.SFX = (function () {
  'use strict';

  var usable = true;
  var vol = { sfx: 0.7, bgm: 0.3 };
  var unlocked = false;

  /* ==========================================================
     効果音プール（実素材）
     ========================================================== */
  function pool(url, size) {
    var items = [];
    for (var i = 0; i < size; i++) {
      var a = new Audio(url);
      a.preload = 'auto';
      items.push(a);
    }
    var i2 = 0;
    return function (opts) {
      if (!usable) return;
      opts = opts || {};
      var el = items[i2]; i2 = (i2 + 1) % items.length;
      try {
        el.pause();
        el.currentTime = 0;
        el.volume = Math.max(0, Math.min(1, vol.sfx * (opts.gain != null ? opts.gain : 1)));
        el.playbackRate = opts.rate || 1;
        var p = el.play();
        if (p && p.catch) p.catch(function () {});
      } catch (e) { /* 鳴らせなくても遊べる */ }
    };
  }

  var se = {
    zugan:  pool('sfx/se_zugan.mp3', 3),    // 主砲
    pyuun:  pool('sfx/se_pyuun.mp3', 4),    // 副砲
    zugyan: pool('sfx/se_zugyan.mp3', 3),   // 着弾・被弾
    click:  pool('sfx/se_click_1.mp3', 3)   // 買い物などのUI操作
  };

  /* ==========================================================
     合う素材が無いものだけ、これまでどおり合成する
     ========================================================== */
  var ctx = null, master = null, noiseBuf = null;

  function ensure() {
    if (!usable) return null;
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { usable = false; return null; }
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = vol.sfx;
        master.connect(ctx.destination);
        var len = Math.floor(ctx.sampleRate * 0.7);
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { usable = false; return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

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

  /* ==========================================================
     BGM
     場面ごとに専用の Audio() を持ち、一時停止した位置から
     再開する（毎回頭出しし直さない）。切り替えはクロスフェード。
     賞金首は難度差が大きいので、最初の2体（中ボス）と
     最後の1体（ボス）で曲を分けている。
     ========================================================== */
  var BGM_FILES = {
    field:     'bgm/Barren_land.ogg',
    town:      'bgm/Lost_world.ogg',
    mob:       'bgm/Lets_go_everyone.ogg',
    midboss:   'bgm/Bad_robot_machine.ogg',
    finalboss: 'bgm/High_mobility_machine.ogg'
  };
  var bgmEls = {}, curMood = null, fadeTimer = null;

  function bgmEl(mood) {
    if (!bgmEls[mood]) {
      var a = new Audio(BGM_FILES[mood]);
      a.loop = true;
      a.volume = 0;
      bgmEls[mood] = a;
    }
    return bgmEls[mood];
  }

  function fade(el, to, ms, thenPause) {
    var from = el.volume, t0 = Date.now();
    if (fadeTimer && fadeTimer.el === el) clearInterval(fadeTimer.id);
    var id = setInterval(function () {
      var t = Math.min(1, (Date.now() - t0) / ms);
      el.volume = from + (to - from) * t;
      if (t >= 1) {
        clearInterval(id);
        if (thenPause) el.pause();
      }
    }, 40);
    fadeTimer = { el: el, id: id };
  }

  function bgmMood(mood) {
    if (!usable || !BGM_FILES[mood] || curMood === mood) return;
    var prevMood = curMood;
    curMood = mood;
    if (!unlocked) return;   // 最初の操作が来るまでは何もしない。unlock() 時に反映する
    var next = bgmEl(mood);
    next.volume = 0;
    var p = next.play();
    if (p && p.catch) p.catch(function () {});
    fade(next, vol.bgm, 500, false);
    if (prevMood && bgmEls[prevMood]) fade(bgmEls[prevMood], 0, 500, true);
  }

  function bgmApplyVolume() {
    if (curMood && bgmEls[curMood]) bgmEls[curMood].volume = vol.bgm;
  }

  var api = {
    /* ---- 効果音 ---- */
    fire:      function () { se.zugan(); },                                  // 主砲
    subFire:   function () { se.pyuun({ rate: 1.1 }); },                     // 副砲
    hit:       function () { se.zugyan(); },                                  // 着弾
    damage:    function () { se.zugyan({ rate: 0.85, gain: 1.1 }); },        // 被弾
    coin:      function () { se.click(); },                                  // 買い物

    /* ---- 効果音（合う素材が無いので合成のまま） ---- */
    destroy: function () {
      se.zugyan({ rate: 0.7, gain: 1.15 });
      noise({ f0: 700, f1: 90, dur: 0.4, gain: 0.32, q: 0.5, delay: 0.03 });
      tone({ f0: 140, f1: 30, dur: 0.45, gain: 0.28, type: 'triangle', delay: 0.03 });
    },
    defeat: function () {
      noise({ f0: 600, f1: 60, dur: 0.9, gain: 0.55, q: 0.4 });
      tone({ f0: 120, f1: 26, dur: 0.95, gain: 0.45, type: 'triangle' });
      noise({ f0: 2200, f1: 300, dur: 0.3, gain: 0.25, q: 1.5, delay: 0.05 });
    },
    encounter: function () {
      tone({ f0: 660, dur: 0.09, gain: 0.3, type: 'square' });
      tone({ f0: 880, dur: 0.12, gain: 0.3, type: 'square', delay: 0.10 });
    },
    repair: function () {
      tone({ f0: 330, f1: 660, dur: 0.22, gain: 0.26, type: 'sine' });
    },
    escape: function () {
      tone({ f0: 440, f1: 160, dur: 0.24, gain: 0.26, type: 'triangle' });
    },
    clear: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone({ f0: f, dur: 0.28, gain: 0.26, type: 'square', delay: i * 0.13 });
      });
    },

    /* ---- BGM ---- */
    bgmMood: bgmMood,
    bgmStop: function () {
      if (curMood && bgmEls[curMood]) fade(bgmEls[curMood], 0, 400, true);
      curMood = null;
    },

    /* ---- 音量。0〜1 ---- */
    setVolume: function (which, v) {
      v = Math.max(0, Math.min(1, v));
      vol[which] = v;
      if (which === 'sfx' && master) master.gain.value = v;
      if (which === 'bgm') bgmApplyVolume();
    },
    getVolume: function (which) { return vol[which]; },
    isUsable: function () { return usable; },

    /* 最初の操作で鳴らせる状態にしておく */
    unlock: function () {
      if (unlocked) return;
      unlocked = true;
      ensure();
      if (curMood) { var m = curMood; curMood = null; bgmMood(m); }
    }
  };

  return api;
})();
