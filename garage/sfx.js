/* ==========================================================
   音（効果音とBGM）

   ここから先は合成ではなく、素材を同梱している。
   クリア／全滅の短いチャイムだけは合成のまま残した
   （ファンファーレ用の素材が無く、上昇アルペジオ程度の単純な
   ものは大きく外しにくいため）。

   出どころと利用規約：README.md の「音について」を参照。

   効果音は Audio() を複数プールして使い回す（連射で音が重なっても
   途切れないように）。BGMは場面ごとに専用の Audio() を持ち、
   切り替え時はクロスフェードする。

   file:// でも動くように、fetch は使わない
   （Audio 要素に直接ファイルを渡して鳴らすだけなので、
   ローカルファイルでも問題なく再生できる）。

   ブラウザは利用者の操作より前に音を鳴らすことを禁じているので、
   最初のクリックかキー入力まで再生を試みない。
   ========================================================== */
window.SFX = (function () {
  'use strict';

  var usable = true;
  var vol = { sfx: 0.7, bgm: 0.3 };
  var unlocked = false;

  /* ==========================================================
     効果音プール
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
        if (p && p.catch) p.catch(function () { });
      } catch (e) { /* 鳴らせなくても遊べる */ }
    };
  }

  /* 連射のときに音が団子になるので、同じ音は間隔を空ける */
  var last = {};
  function throttle(key, ms) {
    var now = Date.now();
    if (last[key] && now - last[key] < ms) return false;
    last[key] = now;
    return true;
  }

  var se = {
    click: pool('sfx/se_click_1.mp3', 4),
    pyuun: pool('sfx/se_pyuun.mp3', 4),
    zugan: pool('sfx/se_zugan.mp3', 3),
    zugyan: pool('sfx/se_zugyan.mp3', 3),
    crash: pool('sfx/se_crash_1.mp3', 2),
    discovery: pool('sfx/se_discovery_1.mp3', 2),
    recovery: pool('sfx/se_recovery.mp3', 2)
  };

  /* ==========================================================
     クリア／全滅だけは合成のチャイム
     単純な上昇・下降アルペジオなので、これは大きくは外れない
     ========================================================== */
  var actx = null, achainGain = null;
  function actxEnsure() {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        actx = new AC();
        achainGain = actx.createGain();
        achainGain.gain.value = vol.sfx * 0.42;
        achainGain.connect(actx.destination);
      } catch (e) { return null; }
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function chime(f0, dur, gain, type, delay) {
    var c = actxEnsure(); if (!c) return;
    var t = c.currentTime + (delay || 0);
    var osc = c.createOscillator();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(f0, t);
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(achainGain);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  /* ==========================================================
     BGM
     場面ごとに専用の Audio() を持ち、一時停止した位置から
     再開する（毎回頭出しし直さない）。切り替えはクロスフェード
     ========================================================== */
  var BGM_FILES = {
    calm: 'bgm/Lost_world.ogg', fight: 'bgm/Lets_go_everyone.ogg',
    elite: 'bgm/Bad_robot_machine.ogg', boss: 'bgm/High_mobility_machine.ogg'
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
    if (p && p.catch) p.catch(function () { });
    fade(next, vol.bgm, 500, false);
    if (prevMood && bgmEls[prevMood]) fade(bgmEls[prevMood], 0, 500, true);
  }

  function bgmApplyVolume() {
    if (curMood && bgmEls[curMood]) bgmEls[curMood].volume = vol.bgm;
  }

  /* ==========================================================
     外に出すもの
     ========================================================== */
  return {
    /* ---- 効果音 ---- */
    fire: function () { if (!throttle('fire', 60)) return; se.zugan(); },
    subFire: function () { if (!throttle('sub', 45)) return; se.pyuun({ rate: 1.15 }); },
    special: function () { se.zugan({ rate: 0.82, gain: 1.1 }); },
    damage: function () { if (!throttle('dmg', 60)) return; se.zugyan(); },
    defeat: function () { se.crash(); },
    lose: function () {
      [330, 262, 208, 156].forEach(function (f, i) { chime(f, 0.42, 0.26, 'triangle', i * 0.2); });
    },
    clear: function () {
      [523, 659, 784, 1047].forEach(function (f, i) { chime(f, 0.3, 0.26, 'square', i * 0.13); });
    },
    pick: function () { se.click({ rate: 1.15, gain: 0.7 }); },
    place: function () { se.click({ rate: 1.0, gain: 0.85 }); },
    deny: function () { se.crash({ rate: 0.7, gain: 0.5 }); },
    rotate: function () { se.click({ rate: 1.4, gain: 0.55 }); },
    coin: function () { se.discovery({ gain: 0.8 }); },
    repair: function () { se.recovery({ gain: 0.8 }); },
    upgrade: function () { se.recovery({ rate: 1.3, gain: 0.9 }); },
    select: function () { se.click({ rate: 0.9, gain: 0.8 }); },
    encounter: function () { se.discovery(); },

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
      if (which === 'sfx' && achainGain) achainGain.gain.value = v * 0.42;
      if (which === 'bgm') bgmApplyVolume();
    },
    getVolume: function (which) { return vol[which]; },
    isUsable: function () { return usable; },

    /* 最初の操作で鳴らせる状態にしておく */
    unlock: function () {
      if (unlocked) return;
      unlocked = true;
      actxEnsure();
      if (curMood) { var m = curMood; curMood = null; bgmMood(m); }
    }
  };
})();
