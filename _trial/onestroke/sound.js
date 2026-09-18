/* ==========================================================
   音（効果音・BGM・環境音）

   素材はまだ入っていない。ファイルを sfx/ と bgm/ に置いて、
   下の SFX_FILES / BGM_FILES / AMB_FILES に名前を書けば鳴りはじめる。
   空のままでもエラーにはならず、無音でそのまま遊べる。

   効果音は Audio() を複数プールして使い回す。
   ベルトを引いている間は 1マスごとに鳴るので、前の音が切れると気持ち悪い。

   ブラウザは利用者が触るより前に音を鳴らすことを禁じているので、
   最初のクリックかタップまで再生を試みない。

   出どころ（素材提供者）は CREDITS に書く。ステージ選択の下に出る。
   ========================================================== */
window.OSSND = (function () {
  'use strict';

  /* ---------- 効果音 ----------
     '' のままの音は鳴らない（無音で正常に動く）。
     例： link: 'sfx/se_link.mp3'                                  */
  var SFX_FILES = {
    grab:    '',   // ポートを掴んでベルトを引き始めた
    draw:    '',   // ドラッグ中に1マス伸びた（伸びるほど高くなる）
    undo:    '',   // 引いてきた道を戻って1マス消えた
    deny:    '',   // 壁・他のベルト・自分の跡に阻まれて伸びなかった
    link:    '',   // つながって確定した
    cancel:  '',   // つながらないまま離した
    erase:   '',   // 引いてあるベルトを消した
    craft:   '',   // 工場が完成品を1つ出した
    dup:     '',   // 複製機が1つを2つに分けた
    deliver: '',   // 納品口が1つ受け取った（納品が進むほど高くなる）
    goal:    '',   // 納品口が必要数を満たした
    clear:   '',   // ステージクリア
    ui:      ''    // ボタン・ステージ選択
  };

  /* ---------- BGM ----------
     空のキーを指定されたときは、いま鳴っている曲をそのまま流し続ける。
     だから play だけ入れて残りを空のままにしても成立する。 */
  var BGM_FILES = {
    title:  '',    // タイトル画面。裏でデモが遊んでいる
    play:   '',    // プレイ中。基本はずっとこれ
    run:    '',    // 全納品口に物が流れ始めてから。空なら play のまま
    clear:  '',    // クリア画面。空なら play のまま
    select: ''     // ステージ選択。空なら play のまま
  };

  /* ---------- 環境音（ループ） ----------
     ワンショットと違って鳴りっぱなしにし、音量だけを動かす。 */
  var AMB_FILES = {
    belt:   ''     // ベルトの走行音。動いているマス数で音量が上がる
  };

  /* ---------- 素材の出どころ ----------
     もらったらここに足す。ステージ選択の下にそのまま出る。
     例： { what: '効果音', who: '〇〇工房', url: 'https://example.com' } */
  var CREDITS = [
  ];

  /* ---------- ここから下は素材が決まっても触らなくていい ---------- */

  var POOL = 4;                       // 同じ音を何個まで重ねられるか
  var vol = { se: 0.7, bgm: 0.4 };
  var unlocked = false;
  var wantBgm = null;                 // 解錠前に指定されたBGM
  var curBgm = null;
  var bgmEls = {};
  var ambEls = {};
  var pools = {};

  try {
    var saved = JSON.parse(localStorage.getItem('osf_vol') || 'null');
    if (saved) {
      if (typeof saved.se === 'number') vol.se = saved.se;
      if (typeof saved.bgm === 'number') vol.bgm = saved.bgm;
    }
  } catch (e) { /* 読めなくても既定値で動く */ }

  function save() {
    try { localStorage.setItem('osf_vol', JSON.stringify(vol)); } catch (e) {}
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

  /* 効果音。opts.gain で音量、opts.rate で高さを変えられる */
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
    (function stepFade() {
      var t = Math.min(1, (Date.now() - t0) / ms);
      el.volume = clamp(from + (to - from) * t);
      if (t < 1) requestAnimationFrame(stepFade);
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
    if (!bgmEls[name]) {
      var a = new Audio(BGM_FILES[name]);
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

  /* 環境音。level は 0〜1。毎フレーム呼ばれる前提で、ここで滑らかに寄せる。 */
  function amb(name, level) {
    if (!unlocked) return;
    var url = AMB_FILES[name];
    if (!url) return;
    if (!ambEls[name]) {
      var a = new Audio(url);
      a.loop = true;
      a.preload = 'auto';
      a.volume = 0;
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

  function muted() { return vol.se <= 0 && vol.bgm <= 0; }

  function toggleMute() {
    if (muted()) { setVol('se', 0.7); setVol('bgm', 0.4); }
    else {
      for (var k in ambEls) { try { ambEls[k].el.pause(); ambEls[k].playing = false; ambEls[k].cur = 0; } catch (e) {} }
      setVol('se', 0); setVol('bgm', 0);
    }
    return muted();
  }

  /* 素材が1つでも設定されているか（音量ボタンを出すかの判断に使う） */
  function ready() {
    var k;
    for (k in SFX_FILES) if (SFX_FILES[k]) return true;
    for (k in BGM_FILES) if (BGM_FILES[k]) return true;
    for (k in AMB_FILES) if (AMB_FILES[k]) return true;
    return false;
  }

  return {
    se: se, bgm: bgm, amb: amb, unlock: unlock,
    setVol: setVol, toggleMute: toggleMute, muted: muted,
    vol: function () { return { se: vol.se, bgm: vol.bgm }; },
    credits: function () { return CREDITS.slice(); },
    ready: ready,
    files: { sfx: SFX_FILES, bgm: BGM_FILES, amb: AMB_FILES }
  };
})();
