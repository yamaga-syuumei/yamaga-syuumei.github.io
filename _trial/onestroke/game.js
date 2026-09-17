// ワンストローク・ファクトリー
//
// 動かし方: index.html を file:// で直接開くだけ。ビルド工程はない。
//
// 設計のメモ（次に触る人向け）
//  * シミュレーションは固定tick（TPS）。描画は tick 間を alpha で補間する。
//  * ベルトは「マスの配列」＋「マスと同じ長さの slots 配列」。1tickに1マスだけ進む。
//    後ろから前へ詰めるので、受け手が詰まると自然に上流が止まる（＝バックプレッシャー）。
//  * ベルトを1本でも足し引きしたら、盤面の物をすべて捨ててカウンタと時計を戻す（resetSim）。
//    そうしないと「溜めてから引き直す」で★3のタイムをいくらでも縮められる。
(function () {
  'use strict';

  const TPS = 12;
  const DT = 1000 / TPS;
  const PAD = 14;
  const DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
  const SAVE_KEY = 'onestroke.progress';

  const { drawItem, roundRect } = window.ART;
  const STAGES = window.STAGES;

  const NODE_SKIN = {
    src: { fill: '#17293a', edge: '#3d6b8e' },
    fac: { fill: '#241f33', edge: '#584d80' },
    dup: { fill: '#15302a', edge: '#357a63' },
    snk: { fill: '#332618', edge: '#8a6a37' },
  };

  // ------------------------------------------------------------------ 状態
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');

  let st = null;          // 進行中のステージ
  let stageIdx = 0;
  let cs = 48, ox = PAD, oy = PAD;
  let drag = null;        // { port, cells[], snap }
  let hoverBelt = null;
  let progress = loadProgress();

  // ------------------------------------------------------------------ 保存
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveProgress() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); } catch (e) { /* file:// で弾かれても遊べる */ }
  }

  // ------------------------------------------------------------------ 組み立て
  function buildStage(def) {
    const s = {
      def, w: def.w, h: def.h,
      cell: [], nodes: [], ports: [], belts: [],
      ticks: 0, cleared: false, result: null,
    };
    for (let i = 0; i < def.w * def.h; i++) s.cell.push({ wall: false, node: null, belt: null });
    (def.walls || []).forEach(([x, y]) => { s.cell[y * def.w + x].wall = true; });

    def.nodes.forEach((nd) => {
      const n = Object.assign({}, nd, { ins: [], outs: [], craftT: -1, pending: false, t: 0, count: 0 });
      s.cell[n.y * def.w + n.x].node = n;
      const outItem = n.k === 'src' ? n.item : n.k === 'fac' ? n.make : (nd.in && nd.in[0].item);
      (nd.in || []).forEach((pd) => {
        const p = mkPort(s, n, pd.d, 'in', n.k === 'snk' ? n.item : pd.item, pd.n || 1);
        n.ins.push(p);
      });
      (nd.out || []).forEach((pd) => {
        const p = mkPort(s, n, pd.d, 'out', outItem, 1);
        n.outs.push(p);
      });
      s.nodes.push(n);
    });
    return s;
  }

  function mkPort(s, node, d, io, item, need) {
    const dir = DIRS[d];
    const p = {
      node, d, io, item,
      need: io === 'in' ? need : 1,
      cap: io === 'in' ? (node.k === 'snk' ? 3 : need) : 2,
      buf: 0, belt: null,
      ax: node.x + dir[0], ay: node.y + dir[1],
    };
    s.ports.push(p);
    return p;
  }

  function resetSim() {
    st.ticks = 0;
    st.cleared = false;
    st.result = null;
    st.ports.forEach((p) => { p.buf = 0; });
    st.nodes.forEach((n) => { n.craftT = -1; n.pending = false; n.t = 0; n.count = 0; });
    st.belts.forEach((b) => { b.slots.fill(null); b.ghosts.length = 0; b.moved = false; b.jam = false; });
  }

  // ------------------------------------------------------------------ ベルト
  function addBelt(from, to, cells) {
    const b = {
      from, to, cells,
      slots: new Array(cells.length).fill(null),
      ghosts: [], flow: 0, moved: false, jam: false,
    };
    from.belt = b; to.belt = b;
    cells.forEach((c) => { st.cell[c.y * st.w + c.x].belt = b; });
    st.belts.push(b);
    resetSim();
  }

  function removeBelt(b) {
    b.from.belt = null; b.to.belt = null;
    b.cells.forEach((c) => { st.cell[c.y * st.w + c.x].belt = null; });
    st.belts.splice(st.belts.indexOf(b), 1);
    if (hoverBelt === b) hoverBelt = null;
    resetSim();
  }

  function usedCells() { return st.belts.reduce((a, b) => a + b.cells.length, 0); }

  // ------------------------------------------------------------------ シミュレーション
  function step() {
    if (!st.cleared) st.ticks++;
    for (const b of st.belts) stepBelt(b);
    for (const n of st.nodes) stepNode(n);
    if (!st.cleared && st.nodes.every((n) => n.k !== 'snk' || n.count >= n.goal)) finishStage();
  }

  function stepBelt(b) {
    const s = b.slots, n = s.length;
    for (let i = 0; i < n; i++) if (s[i]) s[i].prev = i;
    b.ghosts.length = 0;
    b.moved = false;

    const head = s[n - 1];
    b.jam = !!(head && b.to.buf >= b.to.cap);
    if (head && b.to.buf < b.to.cap) {
      b.to.buf += 1;
      s[n - 1] = null;
      b.ghosts.push(head);
      b.moved = true;
    }
    for (let i = n - 2; i >= 0; i--) {
      if (s[i] && !s[i + 1]) { s[i + 1] = s[i]; s[i] = null; b.moved = true; }
    }
    if (!s[0] && b.from.buf > 0) {
      b.from.buf -= 1;
      s[0] = { item: b.from.item, prev: -1 };
      b.moved = true;
    }
  }

  function stepNode(n) {
    if (n.k === 'src') {
      const o = n.outs[0];
      if (o.buf < o.cap) { n.t++; if (n.t >= n.rate) { n.t = 0; o.buf++; } }
      return;
    }
    if (n.k === 'fac') {
      if (n.craftT < 0 && !n.pending && n.ins.every((p) => p.buf >= p.need)) {
        n.ins.forEach((p) => { p.buf -= p.need; });
        n.craftT = n.ticks;
      }
      if (n.craftT > 0) { n.craftT--; if (n.craftT === 0) { n.pending = true; n.craftT = -1; } }
      if (n.pending) { const o = n.outs[0]; if (o.buf < o.cap) { o.buf++; n.pending = false; } }
      return;
    }
    if (n.k === 'dup') {
      const live = n.outs.filter((p) => p.belt);
      if (n.ins[0].buf > 0 && live.length && live.every((p) => p.buf < p.cap)) {
        n.ins[0].buf--;
        live.forEach((p) => { p.buf++; });
      }
      return;
    }
    if (n.k === 'snk') {
      const p = n.ins[0];
      if (p.buf > 0) { n.count = Math.min(n.goal, n.count + p.buf); p.buf = 0; }
    }
  }

  function finishStage() {
    st.cleared = true;
    const cells = usedCells();
    const time = st.ticks / TPS;
    const par = st.def.par;
    const stars = 1 + (cells <= par.cells ? 1 : 0) + (time <= par.time ? 1 : 0);
    st.result = { cells, time, stars };
    const key = String(st.def.no);
    if (!progress[key] || progress[key] < stars) { progress[key] = stars; saveProgress(); }
    showClear();
  }

  // ------------------------------------------------------------------ 座標
  function layout() {
    const box = document.querySelector('.of-board');
    const availW = box.clientWidth - 20;
    const availH = box.clientHeight - 20;
    cs = Math.max(26, Math.min(64, Math.floor(Math.min(
      (availW - PAD * 2) / st.w, (availH - PAD * 2) / st.h))));
    const w = st.w * cs + PAD * 2, h = st.h * cs + PAD * 2;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ox = PAD; oy = PAD;
  }

  const cellX = (x) => ox + x * cs;
  const cellY = (y) => oy + y * cs;
  const midX = (x) => ox + (x + 0.5) * cs;
  const midY = (y) => oy + (y + 0.5) * cs;

  function jointOf(p) {
    const d = DIRS[p.d];
    return { x: midX(p.node.x) + d[0] * cs * 0.5, y: midY(p.node.y) + d[1] * cs * 0.5 };
  }

  function beltPts(b) {
    const pts = [jointOf(b.from)];
    b.cells.forEach((c) => pts.push({ x: midX(c.x), y: midY(c.y) }));
    pts.push(jointOf(b.to));
    return pts;
  }

  function pointerCell(e) {
    const r = cv.getBoundingClientRect();
    const px = (e.clientX - r.left) * (cv.style.width ? parseFloat(cv.style.width) / r.width : 1);
    const py = (e.clientY - r.top) * (cv.style.height ? parseFloat(cv.style.height) / r.height : 1);
    return {
      x: Math.floor((px - ox) / cs), y: Math.floor((py - oy) / cs),
      px, py,
    };
  }

  const inBoard = (x, y) => x >= 0 && y >= 0 && x < st.w && y < st.h;
  const at = (x, y) => st.cell[y * st.w + x];
  const canDraw = (x, y) => inBoard(x, y) && !at(x, y).wall && !at(x, y).node && !at(x, y).belt;

  // ------------------------------------------------------------------ 入力
  function compatible(a, b) {
    return a.io !== b.io && a.item === b.item && a.node !== b.node && !b.belt;
  }

  function portAtPointer(pc) {
    if (!inBoard(pc.x, pc.y)) return null;
    let best = null, bestD = cs * 0.42;
    for (const p of st.ports) {
      const j = jointOf(p);
      const d = Math.hypot(j.x - pc.px, j.y - pc.py);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  function onDown(e) {
    if (!st || st.cleared) return;
    const pc = pointerCell(e);
    if (!inBoard(pc.x, pc.y)) return;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 合成イベントでは失敗する */ }

    const c = at(pc.x, pc.y);
    if (e.button === 2) { if (c.belt) removeBelt(c.belt); return; }

    const p = portAtPointer(pc);
    if (p) {
      if (p.belt) removeBelt(p.belt);
      if (!canDraw(p.ax, p.ay)) return;   // 出口がふさがっている
      drag = { port: p, cells: [{ x: p.ax, y: p.ay }], snap: null };
      updateSnap();
      return;
    }
    if (c.belt) removeBelt(c.belt);
  }

  function onMove(e) {
    if (!st) return;
    const pc = pointerCell(e);
    if (!drag) {
      const c = inBoard(pc.x, pc.y) ? at(pc.x, pc.y) : null;
      hoverBelt = c ? c.belt : null;
      cv.style.cursor = hoverBelt ? 'pointer' : 'crosshair';
      return;
    }
    if (!inBoard(pc.x, pc.y)) return;
    for (let guard = 0; guard < 80; guard++) {
      if (!stepTowards(pc.x, pc.y)) break;
    }
    updateSnap();
  }

  function stepTowards(tx, ty) {
    const head = drag.cells[drag.cells.length - 1];
    const dx = tx - head.x, dy = ty - head.y;
    if (!dx && !dy) return false;
    const order = Math.abs(dx) >= Math.abs(dy)
      ? [[Math.sign(dx), 0], [0, Math.sign(dy)]]
      : [[0, Math.sign(dy)], [Math.sign(dx), 0]];
    for (const [sx, sy] of order) {
      if (!sx && !sy) continue;
      const nx = head.x + sx, ny = head.y + sy;
      const idx = drag.cells.findIndex((c) => c.x === nx && c.y === ny);
      if (idx >= 0) { drag.cells.length = idx + 1; return true; }  // 戻る＝消える
      if (canDraw(nx, ny)) { drag.cells.push({ x: nx, y: ny }); return true; }
    }
    return false;
  }

  function updateSnap() {
    const head = drag.cells[drag.cells.length - 1];
    drag.snap = st.ports.find((p) =>
      compatible(drag.port, p) && p.ax === head.x && p.ay === head.y) || null;
  }

  function onUp() {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.snap) return;
    const cells = d.cells.slice();
    if (d.port.io === 'out') addBelt(d.port, d.snap, cells);
    else addBelt(d.snap, d.port, cells.reverse());
  }

  // ------------------------------------------------------------------ 描画
  let acc = 0, last = 0, flowT = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    if (!st) return;
    if (!last) last = now;
    let dt = Math.min(250, now - last);
    last = now;
    acc += dt;
    while (acc >= DT) { acc -= DT; step(); }
    flowT += dt;
    st.belts.forEach((b) => { b.flow += dt / 1000 * TPS * cs; });
    draw(acc / DT);
    updateHud();
  }

  function draw(alpha) {
    const W = st.w * cs + PAD * 2, H = st.h * cs + PAD * 2;
    ctx.clearRect(0, 0, W, H);

    // 床
    ctx.fillStyle = '#131922';
    roundRect(ctx, 0, 0, W, H, 10); ctx.fill();
    ctx.strokeStyle = '#1d2631';
    ctx.lineWidth = 1;
    for (let x = 0; x <= st.w; x++) {
      ctx.beginPath(); ctx.moveTo(cellX(x) + .5, oy); ctx.lineTo(cellX(x) + .5, oy + st.h * cs); ctx.stroke();
    }
    for (let y = 0; y <= st.h; y++) {
      ctx.beginPath(); ctx.moveTo(ox, cellY(y) + .5); ctx.lineTo(ox + st.w * cs, cellY(y) + .5); ctx.stroke();
    }

    // 壁
    ctx.fillStyle = '#232d3a';
    for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
      if (!at(x, y).wall) continue;
      roundRect(ctx, cellX(x) + 2, cellY(y) + 2, cs - 4, cs - 4, 5); ctx.fill();
    }

    st.belts.forEach((b) => drawBelt(b, alpha));
    if (drag) drawDrag();
    st.nodes.forEach(drawNode);
    st.belts.forEach((b) => drawItems(b, alpha));
    if (drag) drawPortHints();
  }

  function strokePts(pts, width, color, dash, off) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = width; ctx.strokeStyle = color;
    if (dash) { ctx.setLineDash(dash); ctx.lineDashOffset = off || 0; }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.restore();
  }

  function drawBelt(b, alpha) {
    const pts = b.pts = beltPts(b);
    const hot = hoverBelt === b;
    strokePts(pts, cs * 0.54, hot ? '#5b2f31' : '#2b3543');
    strokePts(pts, cs * 0.40, hot ? '#7a3e40' : '#3a4657');
    strokePts(pts, cs * 0.30, 'rgba(176,203,229,0.22)', [cs * 0.20, cs * 0.30], -b.flow);
  }

  function itemPad(x, y, r) {
    ctx.save();
    ctx.fillStyle = 'rgba(12,17,24,.72)';
    ctx.beginPath(); ctx.arc(x, y, r * 1.18, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawItems(b, alpha) {
    const pts = b.pts || beltPts(b);
    const n = b.slots.length;
    const r = cs * 0.26;
    const posAt = (t) => {
      const i = Math.floor(t), f = t - i;
      const a = pts[Math.max(0, Math.min(pts.length - 1, i + 1))];
      const c = pts[Math.max(0, Math.min(pts.length - 1, i + 2))];
      return { x: a.x + (c.x - a.x) * f, y: a.y + (c.y - a.y) * f };
    };
    for (let i = 0; i < n; i++) {
      const o = b.slots[i];
      if (!o) continue;
      const prev = o.prev === undefined ? i : o.prev;
      const p = posAt(prev + (i - prev) * alpha);
      itemPad(p.x, p.y, r);
      drawItem(ctx, o.item, p.x, p.y, r);
    }
    b.ghosts.forEach((o) => {
      const p = posAt((n - 1) + alpha);
      ctx.save(); ctx.globalAlpha = 1 - alpha * 0.6;
      itemPad(p.x, p.y, r);
      drawItem(ctx, o.item, p.x, p.y, r);
      ctx.restore();
    });
  }

  function drawDrag() {
    const pts = [jointOf(drag.port)];
    drag.cells.forEach((c) => pts.push({ x: midX(c.x), y: midY(c.y) }));
    if (drag.snap) pts.push(jointOf(drag.snap));
    strokePts(pts, cs * 0.44, drag.snap ? 'rgba(84,200,232,.55)' : 'rgba(140,160,185,.30)');
    strokePts(pts, cs * 0.24, drag.snap ? '#8fe0f6' : 'rgba(190,210,232,.45)');
  }

  function drawPortHints() {
    const t = (Math.sin(flowT / 220) + 1) / 2;
    st.ports.forEach((p) => {
      if (!compatible(drag.port, p)) return;
      const j = jointOf(p);
      ctx.save();
      ctx.strokeStyle = p === drag.snap ? '#f2c94c' : 'rgba(84,200,232,' + (0.35 + t * 0.4) + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(j.x, j.y, cs * (p === drag.snap ? 0.34 : 0.28 + t * 0.05), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawNode(n) {
    const skin = NODE_SKIN[n.k];
    const x = cellX(n.x), y = cellY(n.y);

    // ポートの出っ張りは本体より先に
    n.ins.concat(n.outs).forEach((p) => drawPort(p, skin));

    ctx.save();
    roundRect(ctx, x + 3, y + 3, cs - 6, cs - 6, cs * 0.16);
    ctx.fillStyle = skin.fill; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = skin.edge; ctx.stroke();
    ctx.restore();

    const mx = midX(n.x), my = midY(n.y);

    if (n.k === 'src') {
      drawItem(ctx, n.item, mx, my - cs * 0.04, cs * 0.24);
      ctx.fillStyle = 'rgba(190,215,240,.45)';
      ctx.font = Math.round(cs * 0.17) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('∞', mx, my + cs * 0.22);
    } else if (n.k === 'fac') {
      drawItem(ctx, n.make, mx, my, cs * 0.24);
      if (n.craftT > 0 || n.pending) {
        const prog = n.pending ? 1 : 1 - n.craftT / n.ticks;
        ctx.save();
        ctx.strokeStyle = '#a99bf0'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(mx, my, cs * 0.37, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
        ctx.stroke();
        ctx.restore();
      }
    } else if (n.k === 'dup') {
      ctx.save();
      ctx.strokeStyle = '#6fd6ae'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const r = cs * 0.22;
      ctx.beginPath();
      ctx.moveTo(mx - r, my); ctx.lineTo(mx, my);
      ctx.moveTo(mx, my - r); ctx.lineTo(mx, my + r);
      ctx.moveTo(mx - r * 0.45, my - r * 0.45); ctx.lineTo(mx, my - r); ctx.lineTo(mx + r * 0.45, my - r * 0.45);
      ctx.moveTo(mx - r * 0.45, my + r * 0.45); ctx.lineTo(mx, my + r); ctx.lineTo(mx + r * 0.45, my + r * 0.45);
      ctx.stroke();
      ctx.restore();
    } else if (n.k === 'snk') {
      drawItem(ctx, n.item, mx, my - cs * 0.08, cs * 0.22);
      const done = n.count >= n.goal;
      ctx.fillStyle = done ? '#f2c94c' : 'rgba(215,228,242,.8)';
      ctx.font = '600 ' + Math.round(cs * 0.2) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(n.count + '/' + n.goal, mx, my + cs * 0.16);
    }
  }

  function drawPort(p, skin) {
    const j = jointOf(p);
    const s = cs * 0.38;
    ctx.save();
    roundRect(ctx, j.x - s / 2, j.y - s / 2, s, s, s * 0.3);
    ctx.fillStyle = p.belt ? skin.edge : skin.fill;
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = skin.edge;
    ctx.stroke();
    ctx.restore();
    if (p.io === 'in') {
      drawItem(ctx, p.item, j.x, j.y, cs * 0.12);
      if (p.need > 1) {
        ctx.fillStyle = '#f2c94c';
        ctx.font = '700 ' + Math.round(cs * 0.15) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('x' + p.need, j.x, j.y + s * 0.62);
      }
    } else {
      ctx.save();
      ctx.fillStyle = p.belt ? 'rgba(225,238,252,.9)' : 'rgba(225,238,252,.4)';
      ctx.beginPath(); ctx.arc(j.x, j.y, cs * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------ HUD
  const el = (id) => document.getElementById(id);
  let goalEls = [];

  function buildHud() {
    el('stgNo').textContent = st.def.no;
    el('stgName').textContent = st.def.name;
    el('hint').textContent = st.def.hint || '';
    el('parCells').textContent = '/ ' + st.def.par.cells;
    el('parTime').textContent = '/ ' + st.def.par.time.toFixed(1);

    const box = el('goals');
    box.innerHTML = '';
    goalEls = [];
    st.nodes.filter((n) => n.k === 'snk').forEach((n) => {
      const d = document.createElement('div');
      d.className = 'of-goal';
      const c = document.createElement('canvas');
      c.width = 40; c.height = 40; c.style.width = '20px'; c.style.height = '20px';
      const cc = c.getContext('2d');
      cc.scale(2, 2);
      drawItem(cc, n.item, 10, 10, 8);
      const num = document.createElement('span');
      d.appendChild(c); d.appendChild(num);
      box.appendChild(d);
      goalEls.push({ n, d, num });
    });
  }

  function updateHud() {
    const cells = usedCells();
    const time = st.ticks / TPS;
    el('statCells').textContent = cells;
    el('statTime').textContent = time.toFixed(1);
    el('statCells').parentNode.className = 'of-stat ' + (cells > st.def.par.cells ? 'over' : 'ok');
    el('statTime').parentNode.className = 'of-stat ' + (time > st.def.par.time ? 'over' : 'ok');
    goalEls.forEach((g) => {
      g.num.textContent = g.n.count + ' / ' + g.n.goal;
      g.d.classList.toggle('done', g.n.count >= g.n.goal);
    });
  }

  function showClear() {
    const r = st.result, par = st.def.par;
    el('clearStars').innerHTML =
      '<span class="on">' + '★'.repeat(r.stars) + '</span>' + '☆'.repeat(3 - r.stars);
    el('clearScore').innerHTML =
      '<li class="hit"><b>納品</b> 完了</li>' +
      '<li class="' + (r.cells <= par.cells ? 'hit' : '') + '">ベルト <b>' + r.cells + '</b> マス（目標 ' + par.cells + '）</li>' +
      '<li class="' + (r.time <= par.time ? 'hit' : '') + '">時間 <b>' + r.time.toFixed(1) + '</b> 秒（目標 ' + par.time.toFixed(1) + '）</li>';
    el('btnNext').style.display = stageIdx + 1 < STAGES.length ? '' : 'none';
    el('ovClear').hidden = false;
  }

  function buildStageList() {
    const box = el('stageList');
    box.innerHTML = '';
    STAGES.forEach((d, i) => {
      const b = document.createElement('button');
      b.className = 'of-cell' + (i === stageIdx ? ' cur' : '');
      const got = progress[String(d.no)] || 0;
      b.innerHTML = '<u>STAGE ' + d.no + '</u><span>' + d.name + '</span>' +
        '<em><span class="on">' + '★'.repeat(got) + '</span>' + '☆'.repeat(3 - got) + '</em>';
      b.onclick = () => { el('ovStages').hidden = true; load(i); };
      box.appendChild(b);
    });
  }

  // ------------------------------------------------------------------ 進行
  function load(i) {
    stageIdx = Math.max(0, Math.min(STAGES.length - 1, i));
    st = buildStage(STAGES[stageIdx]);
    drag = null; hoverBelt = null;
    el('ovClear').hidden = true;
    layout();
    buildHud();
    updateHud();
  }

  el('btnReset').onclick = () => load(stageIdx);
  el('btnRetry').onclick = () => load(stageIdx);
  el('btnNext').onclick = () => load(stageIdx + 1);
  el('btnStages').onclick = () => { buildStageList(); el('ovStages').hidden = false; };
  el('btnCloseStages').onclick = () => { el('ovStages').hidden = true; };

  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('pointercancel', onUp);
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('resize', () => { if (st) layout(); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') load(stageIdx);
    if (e.key === 'Escape') { el('ovStages').hidden = true; }
  });

  // 自動確認用。盤面の座標を外から引けるようにしておく（ブラウザから叩いて動作を見る）。
  window.__osf = {
    state: () => st,
    load: (i) => load(i),
    ff: (n) => { for (let i = 0; i < n; i++) step(); },
    cell: (x, y) => toClient(midX(x), midY(y)),
    joint: (p) => { const j = jointOf(p); return toClient(j.x, j.y); },
  };
  function toClient(x, y) {
    const r = cv.getBoundingClientRect();
    const k = r.width / parseFloat(cv.style.width);
    return { x: r.left + x * k, y: r.top + y * k };
  }

  // 最後に遊んでいた続きから
  let startAt = 0;
  for (let i = 0; i < STAGES.length; i++) { if (progress[String(STAGES[i].no)]) startAt = i + 1; }
  load(Math.min(startAt, STAGES.length - 1));
  requestAnimationFrame(frame);
})();
