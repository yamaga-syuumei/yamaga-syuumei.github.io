/* ==========================================================
   音（効果音・BGM・環境音）

   素材は sfx/ と bgm/ に置き、下の SFX_FILES / BGM_FILES / AMB_FILES に名前を書く。
   '' のままのキーはエラーにならず、そこだけ無音で遊べる。
   ========================================================== */
window.ALSND = (function () {
  'use strict';

  /* ---------- 効果音 ---------- */
  var SFX_FILES = {
    grab:     'sfx/選択3.mp3',        // ポートを掴んで送り道を引き始めた
    draw:     'sfx/スイッチ1.mp3',    // ドラッグ中に1マス伸びた（伸びるほど高くなる）
    undo:     'sfx/選択5.mp3',        // 引いてきた道を戻って1マス消えた
    deny:     'sfx/決定5.mp3',        // 瓦礫・他の送り道・自分の跡に阻まれて伸びなかった
    link:     'sfx/選択4.mp3',        // つながって確定した
    cancel:   'sfx/決定4.mp3',        // つながらないまま離した
    erase:    'sfx/ページめくり1.mp3', // 引いてある送り道を消した
    place:    'sfx/決定1.mp3',        // 設備を置いた
    pickup:   'sfx/選択1.mp3',        // 設備を掴んだ
    sell:     'sfx/スイッチ5.mp3',    // お店が1つ売った（単価が高いほど高くなる）
    craft:    'sfx/マウスクリック.mp3', // 錬成陣が完成品を1つ出した
    levelup:  'sfx/正解9.mp3',        // 設備のレベルアップ
    research: 'sfx/電源オン.mp3',     // 研究を解放した
    expand:   'sfx/扉が開く1.mp3',    // 土地を広げた
    news:     'sfx/決定16.mp3',       // 師匠の手紙・風の便りが届いた
    ui:       'sfx/確認2.mp3'         // ボタン
  };

  /* ---------- BGM ----------
     空のキーを指定されたときは、いま鳴っている曲をそのまま流し続ける。 */
  var BGM_FILES = {
    play: 'bgm/konoha.mp3',       // プレイ中。基本はずっとこれ
    boom: 'bgm/yobikomi.mp3',     // 三次品のラインが動き出してから
    news: '',                     // 師匠の手紙。空なら曲を切り替えず、いまの曲を続ける
    end:  'bgm/acoustic32.mp3'    // エンディング・世界一の看板
  };

  /* ---------- 環境音（ループ） ---------- */
  var AMB_FILES = {
    belt: ''    // ベルトの走行音。動いているマス数で音量が上がる
  };

  /* ---------- 素材の出どころ ---------- */
  var CREDITS = [
    { what: '効果音', who: 'Springin’ Sound Stock', url: 'https://www.springin.org/sound-stock/' },
    { what: 'BGM', who: 'こんとどぅふぇ', url: 'https://conte-de-fees.com/' },
    { what: 'BGM', who: '魔王魂', url: 'https://maou.audio/' }
  ];

  /* ---------- ここから下は素材が決まっても触らなくていい ---------- */

  var POOL = 4;
  var vol = { se: 0.7, bgm: 0.4 };
  var unlocked = false;
  var wantBgm = null;
  var curBgm = null;
  var bgmEls = {};
  var ambEls = {};
  var pools = {};

  try {
    var saved = JSON.parse(localStorage.getItem('alchemy_vol') || 'null');
    if (saved) {
      if (typeof saved.se === 'number') vol.se = saved.se;
      if (typeof saved.bgm === 'number') vol.bgm = saved.bgm;
    }
  } catch (e) { /* 読めなくても既定値で動く */ }

  function save() {
    try { localStorage.setItem('alchemy_vol', JSON.stringify(vol)); } catch (e) {}
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

  function amb(name, level) {
    if (!unlocked) return;
    var url = AMB_FILES[name];
    if (!url) return;
    if (!ambEls[name]) {
      var a = new Audio(url);
      a.loop = true; a.preload = 'auto'; a.volume = 0;
      ambEls[name] = { el: a, cur: 0, playing: false };
    }
    var s = ambEls[name];
    var target = clamp(level) * vol.se;
    s.cur += (target - s.cur) * 0.08;
    try {
      if (s.cur > 0.01 && !s.playing) {
        s.playing = true;
        var pr = s.el.play();
        if (pr && pr.catch) pr.catch(function () {});
      } else if (s.cur <= 0.01 && s.playing) {
        s.playing = false;
        s.el.pause();
      }
      s.el.volume = clamp(s.cur);
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
      for (var k in ambEls) { try { ambEls[k].el.pause(); ambEls[k].playing = false; ambEls[k].cur = 0; } catch (e) {} }
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
    for (k in AMB_FILES) if (AMB_FILES[k]) return true;
    return false;
  }

  return {
    se: se, bgm: bgm, amb: amb, unlock: unlock,
    setVol: setVol, setMute: setMute, muted: muted,
    vol: function () { return { se: vol.se, bgm: vol.bgm }; },
    credits: function () { return CREDITS.slice(); },
    ready: ready,
    files: { sfx: SFX_FILES, bgm: BGM_FILES, amb: AMB_FILES }
  };
})();
