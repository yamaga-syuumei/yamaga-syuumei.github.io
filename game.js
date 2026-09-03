/* ==========================================================
   埋め込み用のミニパズル「いろわけ」
   バラバラに入った色を、試験管ごとに1色ずつまとめる。

   - 画像なし。色のついた矩形だけで成立する
   - タップ（クリック）のみ。ドラッグしないのでスマホとPCで挙動が同じ
   - 必ず解ける問題しか出さない（配ったあと解けるか確かめている）
   ========================================================== */
(function () {
  var board  = document.getElementById('wg-board');
  if (!board) return;

  var status = document.getElementById('wg-status');
  var btnUndo = document.getElementById('wg-undo');
  var btnNew  = document.getElementById('wg-new');

  var COLORS = ['#e03919', '#1667d6', '#12996b', '#b26a00', '#7c3aed'];
  var NCOL  = 4;   // 色数
  var CAP   = 4;   // 試験管1本の容量
  var SPARE = 2;   // 空の試験管の本数

  var tubes = [];      // [[colorIndex, ...], ...] 添字0が底
  var history = [];    // ひとつ戻す用
  var picked = null;   // 選択中の試験管
  var cleared = false;

  /* ---------- ルール ---------- */

  function topRun(t) {            // 上から続く同色の数
    if (!t.length) return 0;
    var c = t[t.length - 1], n = 1;
    for (var i = t.length - 2; i >= 0; i--) { if (t[i] !== c) break; n++; }
    return n;
  }

  function canPour(st, a, b) {
    if (a === b) return 0;
    var from = st[a], to = st[b];
    if (!from.length || to.length >= CAP) return 0;
    if (to.length && to[to.length - 1] !== from[from.length - 1]) return 0;
    // 単色だけの試験管から空の試験管へ移すのは意味がないので禁じる
    var run = topRun(from);
    if (run === from.length && !to.length) return 0;
    return Math.min(run, CAP - to.length);
  }

  function pour(st, a, b, n) {
    for (var i = 0; i < n; i++) st[b].push(st[a].pop());
  }

  function isSolved(st) {
    for (var i = 0; i < st.length; i++) {
      var t = st[i];
      if (!t.length) continue;
      if (t.length !== CAP) return false;
      for (var j = 1; j < t.length; j++) if (t[j] !== t[0]) return false;
    }
    return true;
  }

  /* ---------- 問題を作る ---------- */

  function clone(st) { return st.map(function (t) { return t.slice(); }); }
  function key(st) {
    return st.map(function (t) { return t.join(','); }).sort().join('|');
  }

  // 解けるかどうかを深さ優先で確かめる。探索量に上限を置いて必ず止める。
  function solvable(start) {
    var seen = {}, budget = 120000;
    var stack = [clone(start)];
    while (stack.length) {
      if (--budget < 0) return false;
      var st = stack.pop();
      if (isSolved(st)) return true;
      var k = key(st);
      if (seen[k]) continue;
      seen[k] = 1;
      for (var a = 0; a < st.length; a++) {
        for (var b = 0; b < st.length; b++) {
          var n = canPour(st, a, b);
          if (!n) continue;
          var nx = clone(st);
          pour(nx, a, b, n);
          if (!seen[key(nx)]) stack.push(nx);
        }
      }
    }
    return false;
  }

  function deal() {
    for (var attempt = 0; attempt < 60; attempt++) {
      var pool = [];
      for (var c = 0; c < NCOL; c++) for (var i = 0; i < CAP; i++) pool.push(c);
      for (var i2 = pool.length - 1; i2 > 0; i2--) {          // シャッフル
        var j = Math.floor(Math.random() * (i2 + 1));
        var t = pool[i2]; pool[i2] = pool[j]; pool[j] = t;
      }
      var st = [];
      for (var k2 = 0; k2 < NCOL; k2++) st.push(pool.slice(k2 * CAP, k2 * CAP + CAP));
      for (var e = 0; e < SPARE; e++) st.push([]);
      if (isSolved(st)) continue;                              // 最初から揃っている配りは捨てる
      if (solvable(st)) return st;
    }
    return null;
  }

  /* ---------- 描画 ---------- */

  function render() {
    board.innerHTML = '';
    tubes.forEach(function (t, i) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'wg-tube' + (picked === i ? ' is-picked' : '');
      el.setAttribute('aria-label', (i + 1) + '本目の試験管');
      for (var s = CAP - 1; s >= 0; s--) {
        var seg = document.createElement('span');
        seg.className = 'wg-seg';
        if (t[s] !== undefined) seg.style.background = COLORS[t[s]];
        else seg.className += ' is-empty';
        el.appendChild(seg);
      }
      el.addEventListener('click', function () { tap(i); });
      board.appendChild(el);
    });
  }

  function say(msg) { if (status) status.textContent = msg; }

  /* ---------- 操作 ---------- */

  function tap(i) {
    if (cleared) return;
    if (picked === null) {
      if (!tubes[i].length) return;
      picked = i;
      render();
      return;
    }
    if (picked === i) { picked = null; render(); return; }

    var n = canPour(tubes, picked, i);
    if (n) {
      history.push(clone(tubes));
      if (history.length > 60) history.shift();
      pour(tubes, picked, i, n);
      picked = null;
      render();
      if (isSolved(tubes)) {
        cleared = true;
        say('そろいました。');
        board.classList.add('is-cleared');
      }
      return;
    }
    // 注げないときは、掴み直しとして扱う
    picked = tubes[i].length ? i : null;
    render();
  }

  function start() {
    var st = deal();
    if (!st) { say('問題を作れませんでした。'); return; }
    tubes = st;
    history = [];
    picked = null;
    cleared = false;
    board.classList.remove('is-cleared');
    say('同じ色をひとつにまとめてください。');
    render();
  }

  if (btnUndo) btnUndo.addEventListener('click', function () {
    if (cleared || !history.length) return;
    tubes = history.pop();
    picked = null;
    render();
  });
  if (btnNew) btnNew.addEventListener('click', start);

  start();
})();
