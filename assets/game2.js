/* ==========================================================
   埋め込み用のミニパズル「みちつなぎ」
   左の入口から右の出口まで、管をつないで道を通す。

   - 画像なし。管はSVGの線で描いている
   - タップすると管が90度回る。それだけ
   - 入口からつながっている管は色が変わるので、説明を読まなくても
     何をすればいいか分かる
   - 正解の道を先に作ってから盤面を回しているので、必ず解ける
   ========================================================== */
(function () {
  var board = document.getElementById('pp-board');
  if (!board) return;

  var status = document.getElementById('pp-status');
  var btnNew = document.getElementById('pp-new');

  var W = 5, H = 3;                 // 横5 × 縦3
  var N = 1, E = 2, S = 4, WD = 8;  // 開いている向きのビット
  var DX = {}, DY = {}, OPP = {};
  DX[N] = 0;  DY[N] = -1; OPP[N] = S;
  DX[E] = 1;  DY[E] = 0;  OPP[E] = WD;
  DX[S] = 0;  DY[S] = 1;  OPP[S] = N;
  DX[WD] = -1; DY[WD] = 0; OPP[WD] = E;

  var cells = [];   // { base: mask, rot: 0..3 }
  var startY = 0, goalY = 0;
  var solved = false;

  function idx(x, y) { return y * W + x; }
  function rot1(m) { return ((m << 1) | (m >> 3)) & 15; }
  function maskOf(c) { var m = c.base; for (var i = 0; i < c.rot; i++) m = rot1(m); return m; }

  /* ---------- 正解の道を作る ---------- */

  function carve() {
    var visited = {}, path = [];
    startY = Math.floor(Math.random() * H);

    function walk(x, y) {
      visited[idx(x, y)] = true;
      path.push([x, y]);
      if (x === W - 1) return true;

      var dirs = [E, N, S, WD];
      // 右へ進みやすく、たまに寄り道する
      dirs.sort(function () { return Math.random() - 0.55; });
      for (var i = 0; i < dirs.length; i++) {
        var d = dirs[i], nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        if (visited[idx(nx, ny)]) continue;
        if (walk(nx, ny)) return true;
      }
      path.pop();
      visited[idx(x, y)] = false;
      return false;
    }

    for (var tries = 0; tries < 200; tries++) {
      visited = {}; path = [];
      startY = Math.floor(Math.random() * H);
      if (walk(0, startY)) return path;
    }
    return null;
  }

  function build() {
    var path = carve();
    if (!path) return false;

    cells = [];
    for (var i = 0; i < W * H; i++) cells.push({ base: 0, rot: 0 });

    // 道になっているマスは、前後のマスへ開いた形にする
    for (var p = 0; p < path.length; p++) {
      var x = path[p][0], y = path[p][1], m = 0;
      if (p === 0) m |= WD;                       // 入口は左に開く
      else m |= dirBetween(path[p], path[p - 1]);
      if (p === path.length - 1) m |= E;          // 出口は右に開く
      else m |= dirBetween(path[p], path[p + 1]);
      cells[idx(x, y)].base = m;
    }
    goalY = path[path.length - 1][1];

    // 道以外は飾りの管を置く（直線か曲がり）
    for (var j = 0; j < cells.length; j++) {
      if (cells[j].base) continue;
      cells[j].base = Math.random() < 0.5 ? (N | S) : (N | E);
    }

    // 全部の向きをばらばらにする。最初から解けている盤面はやり直す
    for (var t = 0; t < 12; t++) {
      for (var k = 0; k < cells.length; k++) cells[k].rot = Math.floor(Math.random() * 4);
      if (!isSolved()) return true;
    }
    return true;
  }

  function dirBetween(a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    if (dx === 1) return E;
    if (dx === -1) return WD;
    if (dy === 1) return S;
    return N;
  }

  /* ---------- 入口からたどれる範囲を調べる ---------- */

  function flow() {
    var on = {};
    var s = idx(0, startY);
    if (!(maskOf(cells[s]) & WD)) return on;   // 入口が左に開いていない
    var stack = [[0, startY]];
    on[s] = true;
    while (stack.length) {
      var c = stack.pop(), x = c[0], y = c[1];
      var m = maskOf(cells[idx(x, y)]);
      [N, E, S, WD].forEach(function (d) {
        if (!(m & d)) return;
        var nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) return;
        var ni = idx(nx, ny);
        if (on[ni]) return;
        if (!(maskOf(cells[ni]) & OPP[d])) return;
        on[ni] = true;
        stack.push([nx, ny]);
      });
    }
    return on;
  }

  function isSolved() {
    var on = flow();
    var g = idx(W - 1, goalY);
    return !!on[g] && !!(maskOf(cells[g]) & E);
  }

  /* ---------- 描画 ---------- */

  function svgFor(mask) {
    var d = '';
    if (mask & N)  d += 'M20 20 L20 0 ';
    if (mask & E)  d += 'M20 20 L40 20 ';
    if (mask & S)  d += 'M20 20 L20 40 ';
    if (mask & WD) d += 'M20 20 L0 20 ';
    return '<svg viewBox="0 0 40 40" aria-hidden="true">'
         + '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round"/>'
         + '<circle cx="20" cy="20" r="5" fill="currentColor"/></svg>';
  }

  function render() {
    var on = flow();
    board.innerHTML = '';
    board.style.gridTemplateColumns = '14px repeat(' + W + ', 1fr) 14px';

    for (var y = 0; y < H; y++) {
      var mark = document.createElement('span');
      mark.className = 'pp-mark' + (y === startY ? ' is-on' : '');
      mark.textContent = y === startY ? '▶' : '';
      board.appendChild(mark);

      for (var x = 0; x < W; x++) {
        (function (x, y) {
          var i = idx(x, y), c = cells[i];
          var el = document.createElement('button');
          el.type = 'button';
          el.className = 'pp-cell' + (on[i] ? ' is-on' : '');
          el.setAttribute('aria-label', (x + 1) + '列' + (y + 1) + '行の管を回す');
          el.innerHTML = svgFor(c.base);
          el.firstChild.style.transform = 'rotate(' + (c.rot * 90) + 'deg)';
          el.addEventListener('click', function () { turn(i); });
          board.appendChild(el);
        })(x, y);
      }

      var out = document.createElement('span');
      out.className = 'pp-mark' + (y === goalY && solved ? ' is-on' : '');
      out.textContent = y === goalY ? '▶' : '';
      board.appendChild(out);
    }
  }

  function say(m) { if (status) status.textContent = m; }

  function turn(i) {
    if (solved) return;
    cells[i].rot = (cells[i].rot + 1) % 4;
    if (isSolved()) {
      solved = true;
      say('つながりました。');
      board.classList.add('is-cleared');
    }
    render();
  }

  function start() {
    if (!build()) { say('問題を作れませんでした。'); return; }
    solved = false;
    board.classList.remove('is-cleared');
    say('入口から出口まで道をつないでください。');
    render();
  }

  if (btnNew) btnNew.addEventListener('click', start);
  start();
})();
