/* ==========================================================
   音（効果音・BGM）

   素材は sfx/ と bgm/ に置き、下の SFX_FILES / BGM_FILES に名前を書く。
   '' のままのキーはエラーにならず、そこだけ無音で遊べる。
   ブラウザは利用者の操作より前に音を鳴らすことを禁じているので、
   タイトルの最初のクリック（unlock）まで鳴らさない。
   ========================================================== */
window.SND = (function () {
  'use strict';

  /* ---------- 効果音 ---------- */
  var SFX_FILES = {
    ui:        'sfx/確認2.mp3',        // ボタン
    open:      'sfx/扉が開く1.mp3',    // 部屋の窓を開いた
    close:     'sfx/選択5.mp3',        // 部屋の窓を閉じた
    craft:     'sfx/決定1.mp3',        // 工房で1つ作った
    shelf:     'sfx/選択4.mp3',        // 棚に出した・下げた
    buy:       'sfx/スイッチ5.mp3',    // 商人・買取で買った
    sell:      'sfx/スイッチ5.mp3',    // 営業の場面で品が売れた（単価が高いほど高くなる）
    deny:      'sfx/決定5.mp3',        // 金・素材が足りない、棚がいっぱい
    dismantle: 'sfx/ページめくり1.mp3', // 分解した
    upgrade:   'sfx/正解9.mp3',        // 設備を広げた
    discover:  'sfx/決定16.mp3',       // 図鑑に載った・賞金首を仕留めた
    sleep:     'sfx/決定4.mp3',        // 寝て次の日へ
    wake:      'sfx/電源オン.mp3'      // タイトルの最初のクリック
  };

  /* ---------- BGM ----------
     空のキーを指定されたときは、いま鳴っている曲をそのまま流し続ける */
  var BGM_FILES = {
    title: 'bgm/Barren_land.ogg',   // タイトル。荒野
    play:  'bgm/Lost_world.ogg'     // 店の中。基本はずっとこれ
  };

  /* ---------- 素材の出どころ ---------- */
  var CREDITS = [
    { what: '効果音', who: 'Springin’ Sound Stock', url: 'https://www.springin.org/sound-stock/' },
    { what: 'BGM', who: 'しーでんでん', url: 'https://seadenden-8bit.com' }
  ];

  /* ---------- ここから下は素材が決まっても触らなくていい ---------- */

  var POOL = 4;
  var VOL_KEY = 'shop-vol';
  var vol = { se: 0.7, bgm: 0.4 };
  var unlocked = false;
  var wantBgm = null;
  var curBgm = null;
  var bgmEls = {};
  var pools = {};

  try {
    var saved = JSON.parse(localStorage.getItem(VOL_KEY) || 'null');
    if (saved) {
      if (typeof saved.se === 'number') vol.se = saved.se;
      if (typeof saved.bgm === 'number') vol.bgm = saved.bgm;
    }
  } catch (e) { /* 読めなくても既定値で動く */ }

  function save() {
    try { localStorage.setItem(VOL_KEY, JSON.stringify(vol)); } catch (e) {}
  }

  function clamp(v) { return Math.max(0, Math.min(1, v)); }

  function makePool(url) {
    var items = [];
    for (var i = 0; i < POOL; i++) {
      var a = new Audio(url);
      a.preload = 'auto';
      items.push(a);
    }
    return { items: items, at: 0 };
  }

  function se(name, opts) {
    if (!unlocked || vol.se <= 0) return;
    var url = SFX_FILES[name];
    if (!url) return;
    if (!pools[name]) pools[name] = makePool(url);
    var p = pools[name];
    var el = p.items[p.at];
    p.at = (p.at + 1) % p.items.length;
    opts = opts || {};
    try {
      el.pause();
      el.currentTime = 0;
      el.volume = clamp(vol.se * (opts.gain != null ? opts.gain : 1));
      el.playbackRate = opts.rate || 1;
      var pr = el.play();
      if (pr && pr.catch) pr.catch(function () {});
    } catch (e) {}
  }

  function fade(el, to, ms, stopAtEnd) {
    var from = el.volume, t0 = Date.now();
    (function stepFade() {
      var t = Math.min(1, (Date.now() - t0) / ms);
      el.volume = clamp(from + (to - from) * t);
      if (t < 1) requestAnimationFrame(stepFade);
      else if (stopAtEnd) { try { el.pause(); } catch (e) {} }
    })();
  }

  function bgm(name) {
    if (!unlocked) { wantBgm = name; return; }
    if (name === curBgm) return;
    if (name && !BGM_FILES[name]) return;
    var prev = curBgm ? bgmEls[curBgm] : null;
    if (prev) fade(prev, 0, 500, true);
    curBgm = name;
    if (!name) return;
    if (!bgmEls[name]) {
      var a = new Audio(BGM_FILES[name]);
      a.loop = true; a.preload = 'auto'; a.volume = 0;
      bgmEls[name] = a;
    }
    var el = bgmEls[name];
    try {
      var pr = el.play();
      if (pr && pr.catch) pr.catch(function () {});
      fade(el, vol.bgm, 700, false);
    } catch (e) {}
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    if (wantBgm === null) return;
    var w = wantBgm;
    wantBgm = null;
    curBgm = null;
    setTimeout(function () { if (!curBgm) bgm(w); }, 0);
  }

  function setVol(kind, v) {
    vol[kind] = clamp(v);
    if (kind === 'bgm' && curBgm && bgmEls[curBgm]) bgmEls[curBgm].volume = vol.bgm;
    save();
  }

  function muted() { return vol.se <= 0 && vol.bgm <= 0; }

  var last = { se: vol.se || 0.7, bgm: vol.bgm || 0.4 };

  function setMute(m) {
    if (m) {
      last.se = vol.se; last.bgm = vol.bgm;
      setVol('se', 0); setVol('bgm', 0);
    } else {
      setVol('se', last.se || 0.7); setVol('bgm', last.bgm || 0.4);
    }
    return muted();
  }

  function ready() {
    var k;
    for (k in SFX_FILES) if (SFX_FILES[k]) return true;
    for (k in BGM_FILES) if (BGM_FILES[k]) return true;
    return false;
  }

  return {
    se: se, bgm: bgm, unlock: unlock,
    setVol: setVol, setMute: setMute, muted: muted,
    vol: function () { return { se: vol.se, bgm: vol.bgm }; },
    credits: function () { return CREDITS.slice(); },
    ready: ready
  };
})();
