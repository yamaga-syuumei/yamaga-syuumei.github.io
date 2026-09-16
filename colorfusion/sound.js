/* ==========================================================
   音（効果音とBGM）

   素材はまだ入っていない。ファイルを sfx/ と bgm/ に置いて、
   下の SFX_FILES / BGM_FILES に名前を書けば、それだけで鳴りはじめる。
   空のままでもエラーにはならず、無音でそのまま遊べる。

   出どころ（素材提供者）は下の CREDITS に書く。
   設定パネルの「音の素材」にそのまま並ぶ。

   効果音は Audio() を複数プールして使い回す。
   連続で鳴っても前の音が切れないようにするため。

   ブラウザは利用者が触るより前に音を鳴らすことを禁じているので、
   最初のクリックかタップまで再生を試みない。
   ========================================================== */
window.CFSFX = (function () {
  'use strict';

  /* ---------- 素材の置き場所 ----------
     '' のままの音は鳴らない（無音で正常に動く）。
     例： fuse: 'sfx/se_fuse.mp3'                                  */
  var SFX_FILES = {
    fuse:   '',        // 融合した
    chain:  '',        // 連鎖が終わった（x3以上）
    absorb: '',        // コアが吸い込んだ
    stage:  '',        // 段が変わった
    lap:    '',        // 次の周に入った
    start:  '',        // ランの開始
    over:   ''         // 光が尽きた
  };

  /* 空のキーを指定されたときは、いま鳴っている曲をそのまま流し続ける。
     だから title と play だけ入れて、残りを空のままにしても成立する。 */
  var BGM_FILES = {
    title:  '',        // タイトルとデモ
    play:   '',        // プレイ中
    play2:  '',        // 2周目以降。空なら play のまま
    danger: '',        // 光が残りわずか。空ならプレイ中の曲のまま
    over:   ''         // 結果画面。空ならプレイ中の曲のまま
  };

  /* ---------- 素材の出どころ ----------
     もらったらここに足す。設定パネルにそのまま出る。
     例： { what: '効果音', who: '〇〇工房', url: 'https://example.com' } */
  var CREDITS = [
  ];

  /* ---------- ここから下は素材が決まっても触らなくていい ---------- */

  var POOL = 3;                       // 同じ音を何個まで重ねられるか
  var vol = { se: 0.7, bgm: 0.4 };
  var unlocked = false;
  var wantBgm = null;                 // 解錠前に指定されたBGM
  var curBgm = null;
  var bgmEls = {};
  var pools = {};

  try {
    var saved = JSON.parse(localStorage.getItem('cf_vol') || 'null');
    if (saved) {
      if (typeof saved.se === 'number') vol.se = saved.se;
      if (typeof saved.bgm === 'number') vol.bgm = saved.bgm;
    }
  } catch (e) { /* 読めなくても既定値で動く */ }

  function save() {
    try { localStorage.setItem('cf_vol', JSON.stringify(vol)); } catch (e) {}
  }

  function clamp(v) { return Math.max(0, Math.min(1, v)); }

  function makePool(url) {
    var items = [], i;
    for (i = 0; i < POOL; i++) {
      var a = new Audio(url);
      a.preload = 'auto';
      items.push(a);
    }
    return { items: items, at: 0 };
  }

  /* 効果音。opts.gain で音量、opts.rate で高さを変えられる
     （連鎖が伸びるほど高くする、といった使い方を想定） */
  function se(name, opts) {
    if (!unlocked || vol.se <= 0) return;
    var url = SFX_FILES[name];
    if (!url) return;                 // 素材が未設定なら黙って何もしない
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
    } catch (e) { /* 鳴らせなくても遊べる */ }
  }

  function fade(el, to, ms, stopAtEnd) {
    var from = el.volume, t0 = Date.now();
    (function step() {
      var t = Math.min(1, (Date.now() - t0) / ms);
      el.volume = clamp(from + (to - from) * t);
      if (t < 1) requestAnimationFrame(step);
      else if (stopAtEnd) { try { el.pause(); } catch (e) {} }
    })();
  }

  /* BGM。name を null にすると止める。

     素材が入っていないキーを指定されたときは、いま鳴っている曲をそのまま流す。
     ここで止めてしまうと、曲を1つ足すまで場面が静まり返る。
     曲は増やしても減らしても成立してほしいので、足りない側に合わせる。 */
  function bgm(name) {
    if (!unlocked) { wantBgm = name; return; }
    if (name === curBgm) return;
    if (name && !BGM_FILES[name]) return;      // 素材が無い → いまの曲を続ける
    var prev = curBgm ? bgmEls[curBgm] : null;
    if (prev) fade(prev, 0, 500, true);
    curBgm = name;
    if (!name) return;
    var url = BGM_FILES[name];
    if (!bgmEls[name]) {
      var a = new Audio(url);
      a.loop = true;
      a.preload = 'auto';
      a.volume = 0;
      bgmEls[name] = a;
    }
    var el = bgmEls[name];
    try {
      var pr = el.play();
      if (pr && pr.catch) pr.catch(function () {});
      fade(el, vol.bgm, 700, false);
    } catch (e) {}
  }

  /* 最初の操作で解錠する。ここまでは一切鳴らさない */
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    if (wantBgm !== null) { var w = wantBgm; wantBgm = null; curBgm = null; bgm(w); }
  }

  function setVol(kind, v) {
    vol[kind] = clamp(v);
    if (kind === 'bgm' && curBgm && bgmEls[curBgm]) bgmEls[curBgm].volume = vol.bgm;
    save();
  }

  /* 素材が1つでも設定されているか（設定パネルの表示に使う） */
  function ready() {
    var k;
    for (k in SFX_FILES) if (SFX_FILES[k]) return true;
    for (k in BGM_FILES) if (BGM_FILES[k]) return true;
    return false;
  }

  return {
    se: se, bgm: bgm, unlock: unlock,
    setVol: setVol,
    vol: function () { return { se: vol.se, bgm: vol.bgm }; },
    credits: function () { return CREDITS.slice(); },
    ready: ready,
    files: { sfx: SFX_FILES, bgm: BGM_FILES }
  };
})();
