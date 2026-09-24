// 錬金工場と魔法のお店（試作）
//
// 動かし方: index.html を file:// で直接開くだけ。ビルド工程はない。
//
// 設計
//  * ベルトと一筆書きの判定は onestroke から持ってきて、ステージ制を外したもの。
//  * ノードの処理は固定tick（TPS）。ベルトだけは別の歩調で進む（ベルト強化で速くなる）。
//    描画はベルトの位相 beltPhase で補間する。
//  * ポートの buf は「個数」ではなく品目の待ち行列。複製機と倉庫が品目を選ばないため。
//  * 複製機と倉庫の扱う品目は、繋いだ上流から resolve() で伝える。
//    伝えた結果おかしくなる繋ぎ方は、繋いだ瞬間に取り消す。
(function () {
  'use strict';

  const D = window.ALCHEMY;
  const { ITEMS, RECIPES, SOURCES, LOGI, SHOP, RESEARCH, PILLARS, TIERS, LOG, BOARD, LEVEL } = D;
  const { drawItem, drawBridge, drawSpeed, drawGlyph, roundRect } = window.ART;
  const SND = window.ALSND;

  const TPS = 12;
  const DT = 1000 / TPS;
  const PAD = 26;                       // 盤面の外。拡張ボタンを描く帯
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // E S W N
  const SAVE_KEY = 'alchemy.save1';

  // 明るい盤面の上に置くので、面は淡く・縁だけ濃くする
  const SKIN = {
    src:   { fill: '#e4f0f7', edge: '#4e87a8' },
    fac:   { fill: '#ece4f7', edge: '#7a5fa8' },
    split: { fill: '#dff1ea', edge: '#2e8b6f' },
    store: { fill: '#f5ecd8', edge: '#a3833c' },
    shop:  { fill: '#fbe7d8', edge: '#c07a3c' },
  };

  // ---------------------------------------------------------------- 設備表
  // 購入パレットのカードは全部ここから作る。データを足せばカードが増える。
  const BUILDS = {};
  SOURCES.forEach((s) => {
    BUILDS[s.key] = { key: s.key, k: 'src', tab: 'prod', name: ITEMS[s.item].name,
      kind: '採取地', sub: s.secs.toFixed(1) + '秒に1つ',
      item: s.item, secs: s.secs, cost: s.cost };
  });
  RECIPES.forEach((r) => {
    BUILDS[r.key] = { key: r.key, k: 'fac', tab: 'fac', name: ITEMS[r.make].name,
      kind: '錬成陣', sub: r.in.map((i) => ITEMS[i].name).join('＋'),
      make: r.make, in: r.in, secs: r.secs, cost: r.cost };
  });
  // お店は1種類。流れてきた物をその値段で売る。値段は持っている数で上がる。
  // 1枚しか無いのでタブは分けず、物流に混ぜる。
  BUILDS.shop = { key: 'shop', k: 'shop', tab: 'logi', name: 'お店', kind: 'お店',
    sub: '流れてきた物を売る', secs: SHOP.secs, cost: SHOP.baseCost };
  LOGI.forEach((l) => {
    BUILDS[l.key] = { key: l.key, k: l.key, tab: 'logi', name: l.name, kind: l.name,
      sub: l.key === 'split' ? '交互に振り分ける' : '詰まりを吸収', hold: l.hold, cost: l.cost };
  });
  const shopCount = () => st.nodes.filter((n) => n.k === 'shop').length;
  const shopCost = (n) => Math.round(SHOP.baseCost * Math.pow(SHOP.step, Math.max(0, n)));
  // 買うときも売るときも、その軒数のときの値段で数える
  const defCost = (def) => (def.k === 'shop' ? shopCost(shopCount()) : def.cost);
  const sellBack = (n) => Math.round((n.k === 'shop' ? shopCost(shopCount() - 1) : n.def.cost) / 2);

  // 設備がどの格で解放されるか。購入パレットの並べ替えに使う。
  const RANK_OF = {};
  D.START_UNLOCK.forEach((k) => { RANK_OF[k] = 0; });
  RESEARCH.forEach((r) => (r.unlock || []).forEach((k) => { RANK_OF[k] = r.tier; }));
  const rankOf = (key) => (RANK_OF[key] === undefined ? 0 : RANK_OF[key]);

  // その品目を作れるか（＝お店を並べてよいか）
  function producible(item) {
    if (SOURCES.some((s) => s.item === item && st.unlock[s.key])) return true;
    return RECIPES.some((r) => r.make === item && st.unlock[r.key]);
  }

  // ---------------------------------------------------------------- 状態
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  const el = (id) => document.getElementById(id);

  let st = null;
  let cs = 46, ox = PAD, oy = PAD;
  let drag = null;          // ベルトを引いている
  let moving = null;        // 設備をつまんでいる
  let placing = null;       // 購入パレットから選んだ設備
  let hoverBelt = null, hoverCell = null, hoverExpand = null;
  let sel = null;           // 詳細を開いている設備
  let pops = [];            // 売れた金額の浮き文字

  const idx = (x, y) => y * st.w + x;
  const inBoard = (x, y) => x >= 0 && y >= 0 && x < st.w && y < st.h;
  const at = (x, y) => st.cell[idx(x, y)];
  const canDraw = (x, y) => inBoard(x, y) && !at(x, y).rock && !at(x, y).node && !at(x, y).belts.length;
  const free = (x, y) => inBoard(x, y) && !at(x, y).rock && !at(x, y).node && !at(x, y).belts.length;
  const beltAt = (x, y) => { const l = at(x, y).belts; return l.length ? l[l.length - 1] : null; };

  const priceOf = (item) => Math.round(ITEMS[item].price * (1 + st.bonus.price));
  const sellTicks = (b, lv) => Math.max(2, Math.round(b.secs * TPS * Math.pow(LEVEL.speedMul, lv) / (1 + st.bonus.sellRate)));
  const nodeTicks = (b, lv) => Math.max(2, Math.round(b.secs * TPS * Math.pow(LEVEL.speedMul, lv)));
  const cellsPerSec = () => 6 + st.bonus.belt * 2;
  const landCost = () => Math.round(BOARD.landBase * Math.pow(BOARD.landStep, st.landBuys) * (1 - st.bonus.land));
  const rockCost = () => Math.round(BOARD.rockCost * (1 - st.bonus.rock));
  const lvCost = (n) => Math.round(n.def.cost * Math.pow(LEVEL.costMul, n.lv));

  // ---------------------------------------------------------------- 組み立て
  function blank() {
    return {
      w: BOARD.w, h: BOARD.h, cell: [], nodes: [], belts: [],
      money: BOARD.startMoney, total: 0, tier: 0, landBuys: 0, bridges: 0,
      unlock: {}, done: {}, sold: {}, log: {}, logNew: 0, seen: {}, tut: 0,
      bonus: { belt: 0, sellRate: 0, price: 0, land: 0, rock: 0 },
      beltPhase: 0, acc: 0, flowT: 0, boom: false,
    };
  }

  function makeCells(w, h) {
    const a = [];
    for (let i = 0; i < w * h; i++) a.push({ rock: false, node: null, belts: [] });
    return a;
  }

  // 研究は「解放（一度きり）」と「強化（レベル）」の2種類。
  // st.done[key] にはレベルを入れる（古い保存の true は 1 として読む）。
  const resLv = (r) => {
    const v = st.done[r.key];
    return typeof v === 'number' ? v : (v ? 1 : 0);
  };
  const resMax = (r) => r.max || 1;
  const resCost = (r, lv) => Math.round(r.cost * Math.pow(r.costMul || 1, lv === undefined ? resLv(r) : lv));

  function applyResearch() {
    st.bonus = { belt: 0, sellRate: 0, price: 0, land: 0, rock: 0 };
    st.unlock = {};
    D.START_UNLOCK.forEach((k) => { st.unlock[k] = true; });
    RESEARCH.forEach((r) => {
      const lv = resLv(r);
      if (!lv) return;
      (r.unlock || []).forEach((k) => { st.unlock[k] = true; });
      if (r.stat) st.bonus[r.stat] += r.per * lv;
    });
  }

  // ---------------------------------------------------------------- ノード
  // 出力は rot の辺。入力は「反対 → 横 → 横」の順に必要なぶんだけ。
  function sidesOf(def, n) {
    if (def.k === 'src')   return { out: [0], in: [] };
    if (def.k === 'shop')  return { out: [], in: [0] };
    if (def.k === 'split') return { out: [0, 2], in: [1] };
    if (def.k === 'store') return { out: [0], in: [2] };
    return { out: [0], in: [2, 1, 3].slice(0, def.in.length) };
  }

  function mkNode(def, x, y, rot, lv) {
    const n = { def, k: def.k, x, y, rot: rot || 0, lv: lv || 0,
      ins: [], outs: [], t: 0, craftT: -1, pending: null, hold: [], turn: 0, flow: null, lit: 0 };
    const s = sidesOf(def, n);
    s.in.forEach((side, i) => {
      const item = def.k === 'fac' ? def.in[i] : null;
      n.ins.push(mkPort(n, side, 'in', item));
    });
    s.out.forEach((side) => {
      const item = def.k === 'src' ? def.item : def.k === 'fac' ? def.make : null;
      n.outs.push(mkPort(n, side, 'out', item));
    });
    return n;
  }

  function mkPort(node, side, io, item) {
    return { node, side, io, item, buf: [], belt: null,
      cap: io === 'in' ? (node.k === 'shop' ? 4 : 2) : 2 };
  }

  const portDir = (p) => (p.side + p.node.rot) & 3;
  const portAX = (p) => p.node.x + DIRS[portDir(p)][0];
  const portAY = (p) => p.node.y + DIRS[portDir(p)][1];
  const allPorts = () => { const a = []; st.nodes.forEach((n) => { a.push.apply(a, n.ins); a.push.apply(a, n.outs); }); return a; };

  function addNode(n) {
    st.nodes.push(n);
    at(n.x, n.y).node = n;
  }

  function dropNode(n) {
    n.ins.concat(n.outs).forEach((p) => { if (p.belt) removeBelt(p.belt, true); });
    at(n.x, n.y).node = null;
    st.nodes.splice(st.nodes.indexOf(n), 1);
    if (sel === n) closeMenu();
    resolve();
  }

  // ---------------------------------------------------------------- 品目の伝搬
  // 複製機と倉庫は品目を持たない。繋いだ上流から流れてくる物で決まる。
  function resolve() {
    st.nodes.forEach((n) => {
      if (n.k !== 'split' && n.k !== 'store' && n.k !== 'shop') return;
      n.flow = null;
      n.ins.concat(n.outs).forEach((p) => { p.item = null; });
    });
    for (let pass = 0; pass < st.nodes.length + 2; pass++) {
      let changed = false;
      for (const n of st.nodes) {
        if (n.k !== 'split' && n.k !== 'store' && n.k !== 'shop') continue;
        const up = n.ins[0].belt ? n.ins[0].belt.from.item : null;
        if (up && n.flow !== up) {
          n.flow = up;
          n.ins[0].item = up;
          n.outs.forEach((p) => { p.item = up; });
          changed = true;
        }
      }
      if (!changed) break;
    }
  }

  const conflicted = () => st.belts.some((b) => b.from.item && b.to.item && b.from.item !== b.to.item);

  // ---------------------------------------------------------------- ベルト
  function addBelt(from, to, cells) {
    const b = { from, to, cells, slots: new Array(cells.length).fill(null), ghosts: [], flow: 0, jam: false };
    from.belt = b; to.belt = b;
    cells.forEach((c) => { at(c.x, c.y).belts.push(b); });
    st.belts.push(b);
    resolve();
    if (conflicted()) { removeBelt(b, true); SND.se('deny'); return false; }
    flushCarriers();
    SND.se('link');
    save();
    return true;
  }

  function removeBelt(b, quiet) {
    b.from.belt = null; b.to.belt = null;
    b.cells.forEach((c) => {
      const list = at(c.x, c.y).belts;
      const i = list.indexOf(b);
      if (i >= 0) list.splice(i, 1);
    });
    st.belts.splice(st.belts.indexOf(b), 1);
    if (hoverBelt === b) hoverBelt = null;
    resolve();
    flushCarriers();
    save();
    if (!quiet) SND.se('erase');
  }

  // 品目が変わった複製機・倉庫の中身は捨てる。前の品が混ざったままになるため。
  function flushCarriers() {
    st.nodes.forEach((n) => {
      if (n.k !== 'split' && n.k !== 'store' && n.k !== 'shop') return;
      n.hold.length = 0;
      n.ins.concat(n.outs).forEach((p) => { p.buf.length = 0; });
    });
  }

  // ---------------------------------------------------------------- シミュレーション
  function stepBelts() {
    for (const b of st.belts) {
      const s = b.slots, n = s.length;
      for (let i = 0; i < n; i++) if (s[i]) s[i].prev = i;
      b.ghosts.length = 0;
      b.moved = false;

      const head = s[n - 1];
      b.jam = !!(head && b.to.buf.length >= b.to.cap);
      if (head && b.to.buf.length < b.to.cap) {
        b.to.buf.push(head.item);
        s[n - 1] = null;
        b.ghosts.push(head);
        b.moved = true;
      }
      for (let i = n - 2; i >= 0; i--) {
        if (s[i] && !s[i + 1]) { s[i + 1] = s[i]; s[i] = null; b.moved = true; }
      }
      if (!s[0] && b.from.buf.length) {
        s[0] = { item: b.from.buf.shift(), prev: -1 };
        b.moved = true;
      }
    }
  }

  function stepNode(n) {
    if (n.k === 'src') {
      const o = n.outs[0];
      if (o.buf.length < o.cap) {
        n.t++;
        if (n.t >= nodeTicks(n.def, n.lv)) { n.t = 0; o.buf.push(n.def.item); }
      }
      return;
    }
    if (n.k === 'fac') {
      if (n.craftT < 0 && !n.pending && n.ins.every((p) => p.buf.length > 0)) {
        n.ins.forEach((p) => p.buf.shift());
        n.craftT = nodeTicks(n.def, n.lv);
        n.span = n.craftT;
      }
      if (n.craftT > 0) { n.craftT--; if (n.craftT === 0) { n.pending = n.def.make; n.craftT = -1; } }
      if (n.pending) {
        const o = n.outs[0];
        if (o.buf.length < o.cap) { o.buf.push(n.pending); n.pending = null; n.lit = 1; SND.se('craft'); }
      }
      return;
    }
    // 分配機。物は増えない。繋がっている出口へ順番に1つずつ振り分ける。
    // 片方が詰まっていたら飛ばす。両方止まるのを避けるため。
    if (n.k === 'split') {
      const live = n.outs.filter((p) => p.belt);
      if (!n.ins[0].buf.length || !live.length) return;
      for (let i = 0; i < live.length; i++) {
        const k = (n.turn + i) % live.length;
        if (live[k].buf.length >= live[k].cap) continue;
        live[k].buf.push(n.ins[0].buf.shift());
        n.turn = (k + 1) % live.length;
        break;
      }
      return;
    }
    if (n.k === 'store') {
      const inp = n.ins[0], o = n.outs[0];
      if (inp.buf.length && n.hold.length < n.def.hold) n.hold.push(inp.buf.shift());
      if (n.hold.length && o.buf.length < o.cap) o.buf.push(n.hold.shift());
      return;
    }
    if (n.k === 'shop') {
      const p = n.ins[0];
      n.t++;
      if (p.buf.length && n.t >= sellTicks(n.def, n.lv)) {
        n.t = 0;
        const item = p.buf.shift();
        const g = priceOf(item);
        st.money += g;
        st.total += g;
        st.sold[item] = (st.sold[item] || 0) + g;
        n.lit = 1;
        pops.push({ x: n.x, y: n.y, g, t: 0 });
        SND.se('sell', { rate: 1 + Math.min(1, g / 60) * 0.6 });
        logSell(item, g);
        checkTier();
      }
    }
  }

  function tick() {
    for (const n of st.nodes) { stepNode(n); if (n.lit > 0) n.lit -= 0.08; }
    if (!st.boom && st.nodes.some((n) => n.k === 'fac' && ITEMS[n.def.make].tier >= 3 && n.outs[0].belt)) {
      st.boom = true;
      SND.bgm('boom');
    }
  }

  // ---------------------------------------------------------------- 風の便り
  // 品物が売れるたびに引く。勇者の歩みは高い品が売れるほど1つずつ進み、
  // 噂はその品を初めて売ったときに1度だけ届く。
  function logSell(item, g) {
    const got = [];
    const next = LOG.hero.find((h) => !st.log[h.key]);
    if (next && g >= next.need) got.push(next);
    LOG.rumor.forEach((r) => {
      if (r.item === item && !st.log[r.item]) got.push(r);
    });
    got.forEach((e) => {
      st.log[e.key || e.item] = 1;
      st.logNew++;
      toast(e);
    });
    if (got.length) SND.se('news');
    if (got.length) { markLog(); save(); }
  }

  function markLog() { el('logDot').hidden = !st.logNew; }

  function toast(e) {
    const box = el('toasts');
    const d = document.createElement('div');
    d.className = 'al-toast';
    const u = document.createElement('u'); u.textContent = '風の便り';
    const b = document.createElement('b'); b.textContent = e.text;
    const i = document.createElement('i'); i.textContent = e.note;
    d.appendChild(u); d.appendChild(b); d.appendChild(i);
    box.appendChild(d);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => {
      d.classList.add('out');
      setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 600);
    }, 7000);
  }

  function logRow(box, num, e, open, hint) {
    const d = document.createElement('div');
    d.className = 'al-logrow' + (open ? '' : ' locked');
    const n = document.createElement('div');
    n.className = 'al-lognum';
    n.textContent = open ? num : '?';
    d.appendChild(n);
    const t = document.createElement('span');
    const b = document.createElement('b');
    b.textContent = open ? e.text : '？？？';
    const i = document.createElement('i');
    i.textContent = open ? e.note : hint;
    t.appendChild(b); t.appendChild(i);
    d.appendChild(t);
    box.appendChild(d);
  }

  function buildLog() {
    st.logNew = 0;
    markLog();
    const box = el('logBody');
    box.innerHTML = '';

    const hero = document.createElement('div');
    hero.className = 'al-logsec';
    const h1 = document.createElement('h4');
    const hOpen = LOG.hero.filter((e) => st.log[e.key]).length;
    h1.innerHTML = '<span>勇者の歩み</span><span>' + hOpen + ' / ' + LOG.hero.length + '</span>';
    hero.appendChild(h1);
    LOG.hero.forEach((e, i) => {
      logRow(hero, i + 1, e, !!st.log[e.key], e.need + 'G 以上の品を売ると届く');
    });
    box.appendChild(hero);

    const sec = document.createElement('div');
    sec.className = 'al-logsec';
    const h2 = document.createElement('h4');
    const open = LOG.rumor.filter((e) => st.log[e.item]);
    h2.innerHTML = '<span>街のうわさ</span><span>' + open.length + ' / ' + LOG.rumor.length + '</span>';
    sec.appendChild(h2);
    if (!open.length) {
      const p = document.createElement('p');
      p.className = 'al-empty';
      p.textContent = 'めぼしい品が売れると届く';
      sec.appendChild(p);
    }
    open.forEach((e, i) => logRow(sec, i + 1, e, true));
    box.appendChild(sec);
  }

  // ---------------------------------------------------------------- 店の格
  function checkTier() {
    const next = TIERS[st.tier + 1];
    if (!next || st.total < next.need) return;
    st.tier++;
    SND.se('news');
    showNews(TIERS[st.tier]);
    buildResearch();
    save();
  }

  // 次の格までどのくらい来たか（0〜1）
  function rankProgress() {
    const cur = TIERS[st.tier], next = TIERS[st.tier + 1];
    if (!next) return 1;
    return Math.max(0, Math.min(1, (st.total - cur.need) / (next.need - cur.need)));
  }

  // ---------------------------------------------------------------- 座標
  function layout() {
    const box = document.querySelector('.al-board');
    const availW = box.clientWidth - 12;
    const availH = box.clientHeight - 12;
    cs = Math.max(22, Math.min(58, Math.floor(Math.min(
      (availW - PAD * 2) / st.w, (availH - PAD * 2) / st.h))));
    const w = st.w * cs + PAD * 2, h = st.h * cs + PAD * 2;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const cellX = (x) => ox + x * cs;
  const cellY = (y) => oy + y * cs;
  const midX = (x) => ox + (x + 0.5) * cs;
  const midY = (y) => oy + (y + 0.5) * cs;

  function jointOf(p) {
    const d = DIRS[portDir(p)];
    return { x: midX(p.node.x) + d[0] * cs * 0.5, y: midY(p.node.y) + d[1] * cs * 0.5 };
  }

  function beltPts(b) {
    const pts = [jointOf(b.from)];
    b.cells.forEach((c) => pts.push({ x: midX(c.x), y: midY(c.y) }));
    pts.push(jointOf(b.to));
    return pts;
  }

  function pointerAt(e) {
    const r = cv.getBoundingClientRect();
    const sx = parseFloat(cv.style.width) / r.width;
    const px = (e.clientX - r.left) * sx, py = (e.clientY - r.top) * sx;
    return { px, py, x: Math.floor((px - ox) / cs), y: Math.floor((py - oy) / cs) };
  }

  // ---------------------------------------------------------------- 陸橋
  function straightDirAt(b, x, y) {
    const i = b.cells.findIndex((c) => c.x === x && c.y === y);
    if (i < 0) return null;
    const prev = i > 0 ? b.cells[i - 1] : { x: b.from.node.x, y: b.from.node.y };
    const next = i < b.cells.length - 1 ? b.cells[i + 1] : { x: b.to.node.x, y: b.to.node.y };
    const ax = x - prev.x, ay = y - prev.y;
    const bx = next.x - x, by = next.y - y;
    return (ax === bx && ay === by) ? { x: ax, y: ay } : null;
  }

  function usedBridges() {
    let n = 0;
    for (const c of st.cell) if (c.belts.length > 1) n++;
    return n;
  }
  const dragBridges = () => (drag ? drag.cells.filter((c) => at(c.x, c.y).belts.length > 0).length : 0);

  function bridgeThrough(x, y, sx, sy) {
    if (usedBridges() + dragBridges() >= st.bridges) return null;
    const list = at(x, y).belts;
    if (list.length !== 1) return null;
    const d = straightDirAt(list[0], x, y);
    if (!d || d.x * sx + d.y * sy !== 0) return null;
    const ex = x + sx, ey = y + sy;
    return canDraw(ex, ey) ? { x: ex, y: ey } : null;
  }

  // ---------------------------------------------------------------- 入力
  function compatible(a, b) {
    if (a.io === b.io || a.node === b.node || b.belt) return false;
    return !a.item || !b.item || a.item === b.item;
  }

  function portAtPointer(pc) {
    let best = null, bestD = cs * 0.42;
    for (const p of allPorts()) {
      const j = jointOf(p);
      const d = Math.hypot(j.x - pc.px, j.y - pc.py);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  // 盤面の外の帯。どの辺の拡張ボタンの上にいるか
  function expandAt(pc) {
    const W = st.w * cs, H = st.h * cs;
    if (pc.px >= ox && pc.px <= ox + W) {
      if (pc.py < oy && pc.py > oy - PAD && st.h < BOARD.maxH) return 'N';
      if (pc.py > oy + H && pc.py < oy + H + PAD && st.h < BOARD.maxH) return 'S';
    }
    if (pc.py >= oy && pc.py <= oy + H) {
      if (pc.px < ox && pc.px > ox - PAD && st.w < BOARD.maxW) return 'W';
      if (pc.px > ox + W && pc.px < ox + W + PAD && st.w < BOARD.maxW) return 'E';
    }
    return null;
  }

  function onDown(e) {
    SND.unlock();
    const pc = pointerAt(e);

    // 右クリックはメニュー。設置中なら設置の取り消し
    if (e.button === 2) {
      e.preventDefault();
      if (placing) { placing = null; refreshPalette(); SND.se('ui'); return; }
      closeMenu();
      if (!inBoard(pc.x, pc.y)) return;
      const c = at(pc.x, pc.y);
      if (c.node) { openMenu('node', { node: c.node }, e.clientX, e.clientY); return; }
      if (c.rock) { openMenu('rock', { x: pc.x, y: pc.y }, e.clientX, e.clientY); return; }
      const b = beltAt(pc.x, pc.y);
      if (b) openMenu('belt', { belt: b }, e.clientX, e.clientY);
      return;
    }
    closeMenu();

    const ex = expandAt(pc);
    if (ex) { buyLand(ex); return; }
    if (!inBoard(pc.x, pc.y)) return;

    if (placing) { place(pc.x, pc.y); return; }

    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 合成イベントでは失敗する */ }

    const p = portAtPointer(pc);
    if (p) {
      if (p.belt) removeBelt(p.belt);
      if (!canDraw(portAX(p), portAY(p))) return;
      drag = { port: p, cells: [{ x: portAX(p), y: portAY(p) }], snap: null, px: pc.px, py: pc.py };
      SND.se('grab');
      updateSnap();
      return;
    }

    const node = at(pc.x, pc.y).node;
    if (node) { moving = { node, moved: false, px: e.clientX, py: e.clientY }; SND.se('pickup'); return; }

    if (at(pc.x, pc.y).rock) { openMenu('rock', { x: pc.x, y: pc.y }, e.clientX, e.clientY); return; }
    const hit = beltAt(pc.x, pc.y);
    if (hit) removeBelt(hit);
  }

  // ホイールで回転。設置中はゴースト、盤面では下にある設備
  let wheelAt = 0;
  function onWheel(e) {
    const dir = e.deltaY > 0 ? 1 : 3;
    if (placing) {
      e.preventDefault();
      if (performance.now() - wheelAt < 80) return;
      wheelAt = performance.now();
      placing.rot = (placing.rot + dir) & 3;
      return;
    }
    const pc = pointerAt(e);
    if (!inBoard(pc.x, pc.y)) return;
    const n = at(pc.x, pc.y).node;
    if (!n) return;
    e.preventDefault();
    if (performance.now() - wheelAt < 140) return;   // 一振りで何回も回らないように
    wheelAt = performance.now();
    rotate(n, dir);
  }

  let denyAt = 0;

  function onMove(e) {
    const pc = pointerAt(e);
    hoverCell = inBoard(pc.x, pc.y) ? { x: pc.x, y: pc.y } : null;
    hoverExpand = expandAt(pc);

    if (moving) {
      if (pc.x !== moving.node.x || pc.y !== moving.node.y) moving.moved = true;
      moving.to = inBoard(pc.x, pc.y) ? { x: pc.x, y: pc.y } : null;
      return;
    }
    if (!drag) {
      hoverBelt = inBoard(pc.x, pc.y) ? beltAt(pc.x, pc.y) : null;
      const onRock = inBoard(pc.x, pc.y) && at(pc.x, pc.y).rock;
      cv.style.cursor = placing ? 'copy'
        : (hoverExpand || onRock || hoverBelt) ? 'pointer' : 'crosshair';
      return;
    }
    if (!inBoard(pc.x, pc.y)) return;
    drag.px = pc.px; drag.py = pc.py;
    let drew = 0, backed = 0;
    for (let guard = 0; guard < 120; guard++) {
      const r = stepTowards(pc.x, pc.y);
      if (!r) break;
      if (r === 'push' || r === 'bridge') drew++; else backed++;
    }
    for (let i = 0; i < Math.min(drew, 3); i++) {
      const len = drag.cells.length - (drew - 1 - i);
      SND.se('draw', { rate: 1 + Math.min(len, 20) * 0.02 });
    }
    if (backed) SND.se('undo');
    if (!drew && !backed) {
      const head = drag.cells[drag.cells.length - 1];
      if ((head.x !== pc.x || head.y !== pc.y) && performance.now() - denyAt > 220) {
        denyAt = performance.now(); SND.se('deny');
      }
    }
    updateSnap();
  }

  function stepTowards(tx, ty) {
    const head = drag.cells[drag.cells.length - 1];
    const dx = tx - head.x, dy = ty - head.y;
    if (!dx && !dy) return null;
    const order = Math.abs(dx) >= Math.abs(dy)
      ? [[Math.sign(dx), 0], [0, Math.sign(dy)]]
      : [[0, Math.sign(dy)], [Math.sign(dx), 0]];
    for (const [sx, sy] of order) {
      if (!sx && !sy) continue;
      const nx = head.x + sx, ny = head.y + sy;
      const i = drag.cells.findIndex((c) => c.x === nx && c.y === ny);
      if (i >= 0) {
        drag.cells.length = i + 1;
        const last = drag.cells[drag.cells.length - 1];
        if (drag.cells.length > 1 && at(last.x, last.y).belts.length) drag.cells.pop();
        return 'back';
      }
      if (canDraw(nx, ny)) { drag.cells.push({ x: nx, y: ny }); return 'push'; }
      const exit = bridgeThrough(nx, ny, sx, sy);
      if (exit) { drag.cells.push({ x: nx, y: ny }, exit); return 'bridge'; }
    }
    return null;
  }

  // 同じマスを2つのポートが向いていることがある（工場の横と販売所の横が重なる等）。
  // そのときはポインタに近い方を選ぶ。先に作った方が勝つと繋ぎたい相手に届かない。
  function updateSnap() {
    const head = drag.cells[drag.cells.length - 1];
    let best = null, bestD = Infinity;
    for (const p of allPorts()) {
      if (!compatible(drag.port, p) || portAX(p) !== head.x || portAY(p) !== head.y) continue;
      const j = jointOf(p);
      const d = drag.px === undefined ? 0 : Math.hypot(j.x - drag.px, j.y - drag.py);
      if (d < bestD) { bestD = d; best = p; }
    }
    drag.snap = best;
  }

  function onUp() {
    if (moving) {
      const m = moving; moving = null;
      if (!m.moved) { openMenu('node', { node: m.node }, m.px, m.py); return; }
      if (m.to && free(m.to.x, m.to.y)) moveNode(m.node, m.to.x, m.to.y);
      return;
    }
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.snap) { if (d.cells.length > 1) SND.se('cancel'); return; }
    const cells = d.cells.slice();
    if (d.port.io === 'out') addBelt(d.port, d.snap, cells);
    else addBelt(d.snap, d.port, cells.reverse());
  }

  // ---------------------------------------------------------------- 設備の売買
  function place(x, y) {
    const def = placing.def;
    if (!free(x, y)) { SND.se('deny'); return; }
    const c = defCost(def);
    if (st.money < c) { SND.se('deny'); return; }
    st.money -= c;
    addNode(mkNode(def, x, y, placing.rot, 0));
    resolve();
    SND.se('place');
    save();
    buildPalette();
  }

  function moveNode(n, x, y) {
    n.ins.concat(n.outs).forEach((p) => { if (p.belt) removeBelt(p.belt, true); });
    at(n.x, n.y).node = null;
    n.x = x; n.y = y;
    at(x, y).node = n;
    resolve();
    SND.se('place');
    save();
  }

  function rotate(n, dir) {
    n.ins.concat(n.outs).forEach((p) => { if (p.belt) removeBelt(p.belt, true); });
    n.rot = (n.rot + (dir || 1)) & 3;
    resolve();
    SND.se('place');
    save();
  }

  function sellNode(n) {
    st.money += sellBack(n);
    dropNode(n);
    SND.se('ui');
    save();
    buildPalette();
  }

  function levelUp(n) {
    if (n.lv >= LEVEL.max - 1) return;
    const c = lvCost(n);
    if (st.money < c) { SND.se('deny'); return; }
    st.money -= c;
    n.lv++;
    SND.se('levelup');
    save();
  }

  function buyLand(side) {
    const c = landCost();
    if (st.money < c) { SND.se('deny'); return; }
    st.money -= c;
    st.landBuys++;
    expand(side);
    SND.se('expand');
    layout();
    save();
  }

  // 行／列を1本足す。西と北に伸ばすときは中身をずらす。
  function expand(side) {
    const oldW = st.w, oldH = st.h, old = st.cell;
    const dx = side === 'W' ? 1 : 0, dy = side === 'N' ? 1 : 0;
    st.w += (side === 'W' || side === 'E') ? 1 : 0;
    st.h += (side === 'N' || side === 'S') ? 1 : 0;
    st.cell = makeCells(st.w, st.h);
    for (let y = 0; y < oldH; y++) {
      for (let x = 0; x < oldW; x++) {
        const c = old[y * oldW + x];
        st.cell[(y + dy) * st.w + (x + dx)] = c;
      }
    }
    st.nodes.forEach((n) => { n.x += dx; n.y += dy; });
    st.belts.forEach((b) => b.cells.forEach((c) => { c.x += dx; c.y += dy; }));
    // 新しい帯に岩を撒く。買った土地がそのまま使えるとは限らない。
    const strip = [];
    if (side === 'W') for (let y = 0; y < st.h; y++) strip.push([0, y]);
    if (side === 'E') for (let y = 0; y < st.h; y++) strip.push([st.w - 1, y]);
    if (side === 'N') for (let x = 0; x < st.w; x++) strip.push([x, 0]);
    if (side === 'S') for (let x = 0; x < st.w; x++) strip.push([x, st.h - 1]);
    strip.forEach(([x, y]) => {
      const c = at(x, y);
      if (!c.node && !c.belts.length && Math.random() < BOARD.rockRate) c.rock = true;
    });
  }

  function breakRock(x, y) {
    const c = rockCost();
    if (st.money < c) { SND.se('deny'); return; }
    st.money -= c;
    at(x, y).rock = false;
    SND.se('expand');
    save();
  }

  // ---------------------------------------------------------------- 描画
  let last = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    if (!st) return;
    if (!last) last = now;
    const dt = Math.min(250, now - last);
    last = now;
    advance(dt);
  }

  // パネルを開いていても敷地は動かし続ける。
  // 手を止めている間も工房が回っているのがこのゲームの手触りなので、止めない。
  function advance(dt) {
    st.acc += dt;
    while (st.acc >= DT) { st.acc -= DT; tick(); }

    // ベルトはノードと別の歩調。研究で速くなる
    st.beltPhase += dt / 1000 * cellsPerSec();
    let guard = 0;
    while (st.beltPhase >= 1 && guard++ < 4) { st.beltPhase -= 1; stepBelts(); }

    st.flowT += dt;
    let running = 0;
    st.belts.forEach((b) => { b.flow += dt / 1000 * cellsPerSec() * cs; if (b.moved) running += b.cells.length; });
    SND.amb('belt', Math.min(1, running / 40));

    pops.forEach((p) => { p.t += dt; });
    pops = pops.filter((p) => p.t < 900);

    draw();
    updateHud();
  }

  function draw() {
    const W = st.w * cs + PAD * 2, H = st.h * cs + PAD * 2;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = '#fbf6ec';
    roundRect(ctx, PAD - 6, PAD - 6, st.w * cs + 12, st.h * cs + 12, 10); ctx.fill();
    ctx.strokeStyle = '#e4dbcb';
    ctx.lineWidth = 1;
    for (let x = 0; x <= st.w; x++) {
      ctx.beginPath(); ctx.moveTo(cellX(x) + .5, oy); ctx.lineTo(cellX(x) + .5, oy + st.h * cs); ctx.stroke();
    }
    for (let y = 0; y <= st.h; y++) {
      ctx.beginPath(); ctx.moveTo(ox, cellY(y) + .5); ctx.lineTo(ox + st.w * cs, cellY(y) + .5); ctx.stroke();
    }

    for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
      if (at(x, y).rock) drawGlyph(ctx, 'rubble', midX(x), midY(y), cs * 0.38);
    }
    drawRockPrice();

    drawExpand();
    st.belts.forEach(drawBelt);
    if (drag) drawDrag();
    st.nodes.forEach(drawNode);
    st.belts.forEach(drawItems);
    if (drag) drawPortHints();
    if (placing) drawGhost();
    if (moving && moving.moved) drawMoveGhost();
    drawPops();
  }

  // 岩に乗せたら撤去の値段を出す。盤面の外の ＋ と同じ見せ方に揃える
  function drawRockPrice() {
    if (!hoverCell || placing || drag || moving) return;
    if (!at(hoverCell.x, hoverCell.y).rock) return;
    const c = rockCost();
    const can = st.money >= c;
    const x = midX(hoverCell.x), y = midY(hoverCell.y);
    const txt = '撤去 ' + c + 'G';
    ctx.save();
    ctx.font = '600 ' + Math.round(Math.max(10, cs * 0.24)) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(txt).width + cs * 0.3;
    const h = cs * 0.42;
    roundRect(ctx, x - w / 2, y - cs * 0.62 - h / 2, w, h, 5);
    ctx.fillStyle = 'rgba(255,252,246,.94)'; ctx.fill();
    ctx.strokeStyle = can ? 'rgba(122,95,168,.55)' : 'rgba(190,80,80,.55)';
    ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = can ? '#6a4f8a' : '#b44a4a';
    ctx.fillText(txt, x, y - cs * 0.62);
    ctx.restore();
  }

  function drawExpand() {
    const W = st.w * cs, H = st.h * cs;
    const c = landCost();
    const can = st.money >= c;
    const bands = [];
    if (st.h < BOARD.maxH) bands.push(['N', ox, oy - PAD + 2, W, PAD - 6]);
    if (st.h < BOARD.maxH) bands.push(['S', ox, oy + H + 4, W, PAD - 6]);
    if (st.w < BOARD.maxW) bands.push(['W', ox - PAD + 2, oy, PAD - 6, H]);
    if (st.w < BOARD.maxW) bands.push(['E', ox + W + 4, oy, PAD - 6, H]);
    bands.forEach(([side, x, y, w, h]) => {
      const hot = hoverExpand === side;
      ctx.save();
      roundRect(ctx, x, y, w, h, 5);
      ctx.fillStyle = hot ? (can ? 'rgba(122,95,168,.22)' : 'rgba(190,80,80,.16)') : 'rgba(150,130,180,.12)';
      ctx.fill();
      ctx.fillStyle = hot ? (can ? '#6a4f8a' : '#b44a4a') : 'rgba(110,92,140,.6)';
      ctx.font = '600 ' + Math.round(Math.min(13, PAD * 0.52)) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(hot ? c + 'G' : '＋', x + w / 2, y + h / 2);
      ctx.restore();
    });
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

  function drawBelt(b) {
    const pts = b.pts = beltPts(b);
    for (const c of b.cells) {
      const list = at(c.x, c.y).belts;
      if (list.length < 2 || list[list.length - 1] !== b) continue;
      const d = straightDirAt(b, c.x, c.y) || { x: 1, y: 0 };
      const mx = midX(c.x), my = midY(c.y);
      const ex = d.x * cs * .56, ey = d.y * cs * .56;
      strokePts([{ x: mx - ex, y: my - ey }, { x: mx + ex, y: my + ey }], cs * .74, 'rgba(251,246,236,.95)');
    }
    const hot = hoverBelt === b;
    strokePts(pts, cs * .54, hot ? '#d8a0a8' : '#d9cdbb');
    strokePts(pts, cs * .40, hot ? '#e8bcc2' : '#efe6d8');
    strokePts(pts, cs * .26, 'rgba(122,95,168,0.20)', [cs * .16, cs * .34], -b.flow);
  }

  function under(b, i) {
    const c = b.cells[i];
    const list = at(c.x, c.y).belts;
    return list.length > 1 && list[list.length - 1] !== b;
  }

  function drawItems(b) {
    const pts = b.pts || beltPts(b);
    const n = b.slots.length;
    const r = cs * .26;
    const alpha = st.beltPhase;
    const posAt = (t) => {
      const i = Math.floor(t), f = t - i;
      const a = pts[Math.max(0, Math.min(pts.length - 1, i + 1))];
      const c = pts[Math.max(0, Math.min(pts.length - 1, i + 2))];
      return { x: a.x + (c.x - a.x) * f, y: a.y + (c.y - a.y) * f };
    };
    for (let i = 0; i < n; i++) {
      const o = b.slots[i];
      if (!o || under(b, i)) continue;
      const prev = o.prev === undefined ? i : o.prev;
      const p = posAt(prev + (i - prev) * alpha);
      pad(p.x, p.y, r);
      drawItem(ctx, o.item, p.x, p.y, r);
    }
    b.ghosts.forEach((o) => {
      const p = posAt((n - 1) + alpha);
      ctx.save(); ctx.globalAlpha = 1 - alpha * .6;
      pad(p.x, p.y, r);
      drawItem(ctx, o.item, p.x, p.y, r);
      ctx.restore();
    });
  }

  function pad(x, y, r) {
    ctx.save();
    ctx.fillStyle = '#fffdf8';
    ctx.beginPath(); ctx.arc(x, y, r * 1.2, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(70,58,90,.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawDrag() {
    const pts = [jointOf(drag.port)];
    drag.cells.forEach((c) => pts.push({ x: midX(c.x), y: midY(c.y) }));
    if (drag.snap) pts.push(jointOf(drag.snap));
    strokePts(pts, cs * .44, drag.snap ? 'rgba(122,95,168,.45)' : 'rgba(150,140,170,.28)');
    strokePts(pts, cs * .24, drag.snap ? '#8a63c4' : 'rgba(120,110,140,.45)');
  }

  function drawPortHints() {
    const t = (Math.sin(st.flowT / 220) + 1) / 2;
    allPorts().forEach((p) => {
      if (!compatible(drag.port, p)) return;
      const j = jointOf(p);
      ctx.save();
      ctx.strokeStyle = p === drag.snap ? '#e0962c' : 'rgba(122,95,168,' + (.4 + t * .45) + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(j.x, j.y, cs * (p === drag.snap ? .34 : .28 + t * .05), 0, 7);
      ctx.stroke();
      ctx.restore();
    });
  }

  function nodeBody(def, x, y, rot, lv, n) {
    const skin = SKIN[def.k];
    const px = cellX(x), py = cellY(y);
    const mx = midX(x), my = midY(y);

    ctx.save();
    roundRect(ctx, px + 3, py + 3, cs - 6, cs - 6, cs * .16);
    ctx.fillStyle = skin.fill; ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = (n && n.lit > 0) ? '#e0962c' : (sel === n ? '#8a63c4' : skin.edge);
    ctx.stroke();
    ctx.restore();

    if (def.k === 'src') {
      drawItem(ctx, def.item, mx, my - cs * .1, cs * .22);
      drawSpeed(ctx, mx, my + cs * .40, cs * .58, cs * .2, lv + 1);
    } else if (def.k === 'fac') {
      drawItem(ctx, def.make, mx, my - cs * .08, cs * .22);
      drawSpeed(ctx, mx, my + cs * .40, cs * .58, cs * .2, lv + 1);
      if (n && (n.craftT > 0 || n.pending)) {
        const prog = n.pending ? 1 : 1 - n.craftT / n.span;
        ctx.save();
        ctx.strokeStyle = '#7a5fa8'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(mx, my, cs * .37, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
        ctx.stroke();
        ctx.restore();
      }
    } else if (def.k === 'shop') {
      // 扱う品は繋いだ相手で決まる。繋ぐまでは看板だけ。
      const it = n && n.flow;
      if (it) {
        drawItem(ctx, it, mx, my - cs * .2, cs * .2);
        ctx.fillStyle = '#a8621f';
        ctx.font = '700 ' + Math.round(cs * .19) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(priceOf(it).toLocaleString() + 'G', mx, my + cs * .13);
      } else {
        drawGlyph(ctx, 'shop', mx, my - cs * .06, cs * .26);
      }
      // 採取地・錬成陣と同じ目盛りでレベルを出す
      drawSpeed(ctx, mx, my + cs * .40, cs * .58, cs * .2, lv + 1);
    } else {
      drawGlyph(ctx, def.k, mx, my, cs * .24);
      if (def.k === 'store' && n) {
        ctx.fillStyle = 'rgba(70,58,90,.75)';
        ctx.font = '600 ' + Math.round(cs * .18) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(n.hold.length + '/' + def.hold, mx, my + cs * .2);
      }
    }
  }

  function drawNode(n) {
    n.ins.concat(n.outs).forEach((p) => drawPort(p));
    nodeBody(n.def, n.x, n.y, n.rot, n.lv, n);
  }

  function drawPort(p) {
    const skin = SKIN[p.node.k];
    const j = jointOf(p);
    const s = cs * .38;
    ctx.save();
    roundRect(ctx, j.x - s / 2, j.y - s / 2, s, s, s * .3);
    ctx.fillStyle = p.belt ? skin.edge : skin.fill;
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = skin.edge;
    ctx.stroke();
    ctx.restore();
    if (p.io === 'in' && p.item) {
      drawItem(ctx, p.item, j.x, j.y, cs * .12);
    } else {
      ctx.save();
      ctx.fillStyle = p.belt ? 'rgba(70,58,90,.75)' : 'rgba(70,58,90,.3)';
      ctx.beginPath(); ctx.arc(j.x, j.y, cs * .07, 0, 7); ctx.fill();
      ctx.restore();
    }
  }

  function drawGhost() {
    if (!hoverCell) return;
    const ok = free(hoverCell.x, hoverCell.y) && st.money >= placing.def.cost;
    ctx.save();
    ctx.globalAlpha = ok ? .8 : .3;
    nodeBody(placing.def, hoverCell.x, hoverCell.y, placing.rot, 0, null);
    // 仮のポートも描く。どの向きに口が出るか置く前に分かる
    const s = sidesOf(placing.def, null);
    ctx.globalAlpha = ok ? .6 : .2;
    s.in.concat(s.out).forEach((side) => {
      const d = DIRS[(side + placing.rot) & 3];
      const x = midX(hoverCell.x) + d[0] * cs * .5, y = midY(hoverCell.y) + d[1] * cs * .5;
      const w = cs * .3;
      roundRect(ctx, x - w / 2, y - w / 2, w, w, w * .3);
      ctx.fillStyle = SKIN[placing.def.k].edge; ctx.fill();
    });
    ctx.restore();
    if (!ok) {
      ctx.save();
      ctx.strokeStyle = 'rgba(190,70,70,.85)'; ctx.lineWidth = 2;
      const px = cellX(hoverCell.x), py = cellY(hoverCell.y);
      ctx.beginPath();
      ctx.moveTo(px + 6, py + 6); ctx.lineTo(px + cs - 6, py + cs - 6);
      ctx.moveTo(px + cs - 6, py + 6); ctx.lineTo(px + 6, py + cs - 6);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawMoveGhost() {
    if (!moving.to) return;
    const ok = free(moving.to.x, moving.to.y);
    ctx.save();
    ctx.globalAlpha = ok ? .7 : .25;
    nodeBody(moving.node.def, moving.to.x, moving.to.y, moving.node.rot, moving.node.lv, null);
    ctx.restore();
  }

  function drawPops() {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    pops.forEach((p) => {
      const f = p.t / 900;
      ctx.globalAlpha = 1 - f;
      ctx.fillStyle = '#c07a1c';
      ctx.font = '700 ' + Math.round(cs * .26) + 'px sans-serif';
      ctx.fillText('+' + p.g, midX(p.x), midY(p.y) - cs * (.4 + f * .8));
    });
    ctx.restore();
  }

  // ---------------------------------------------------------------- HUD
  let lastMoney = -1;

  function updateHud() {
    if (st.money !== lastMoney) {
      lastMoney = st.money;
      el('money').textContent = st.money.toLocaleString();
      buildMenu();                               // 買えるようになった項目を押せるようにする
      syncResearch();                            // 研究も開いたまま買えるようになる
    }
    updateHint();
    el('total').textContent = st.total.toLocaleString();
    el('rankName').textContent = TIERS[st.tier].name;
    el('rankFill').style.width = (rankProgress() * 100).toFixed(1) + '%';
    const next = TIERS[st.tier + 1];
    el('rankNote').textContent = next
      ? ('次は ' + next.name + '　' + st.total.toLocaleString() + ' / ' + next.need.toLocaleString() + 'G')
      : 'この星のどこでも名が通る';
  }

  const HINT = '出口から入口へドラッグして送り道を引く　／　右クリックでメニュー　／　ホイールで回転　／　敷地の外の ＋ で土地を買う　／　右上の ? で遊び方';

  // はじめのてびき。案内の行をそのまま使うので、出ても高さは変わらない。
  // 読ませるのではなく、やることを1つずつ出して、やったら次へ進む。
  const TUT = [
    { text: '採取地の右の口から、お店の左の口までドラッグして送り道を引く',
      done: () => st.belts.length > 0 },
    { text: '品がお店に届くと売れる。少し待ってみる',
      done: () => st.total > 0 },
    { text: '右上の「研究」を開いて、いちばん上の「魔石の錬成」を買う',
      done: () => Object.keys(st.done).length > 0 },
    { text: '下の「錬成」から錬成陣を置いて、採取地 → 錬成陣 → お店 とつなぐ',
      done: () => st.nodes.some((n) => n.k === 'fac' && n.outs[0].belt && n.ins.every((p) => p.belt)) },
    { text: 'ここまでがこのゲームの全部。あとは深く錬成するほど高く売れる',
      done: () => st.total > 200 },
  ];

  function tutStep() {
    if (st.tut < 0 || st.tut >= TUT.length) return null;
    while (st.tut < TUT.length && TUT[st.tut].done()) { st.tut++; save(); }
    return st.tut < TUT.length ? TUT[st.tut] : null;
  }

  function updateHint() {
    const h = el('hint');
    const step = placing ? null : tutStep();
    const txt = placing
      ? '設置中：' + placing.def.name + '　左クリックで置く　／　右クリックで取り消し　／　ホイールで回転'
      : step ? step.text : HINT;
    if (h.dataset.txt !== txt) {
      h.dataset.txt = txt;
      h.innerHTML = '';
      if (step) {
        const n = document.createElement('span');
        n.className = 'al-step';
        n.textContent = (st.tut + 1) + ' / ' + TUT.length;
        h.appendChild(n);
      }
      h.appendChild(document.createTextNode(txt));
      if (step) {
        const b = document.createElement('button');
        b.className = 'al-skip';
        b.textContent = 'とじる';
        b.onclick = () => { st.tut = -1; save(); updateHint(); };
        h.appendChild(b);
      }
    }
    h.classList.toggle('on', !!placing);
    h.classList.toggle('tut', !!step);
  }

  // ---------------------------------------------------------------- 購入パレット
  const TABS = [
    { key: 'prod', name: '採取' },
    { key: 'fac', name: '錬成' },
    { key: 'logi', name: '物流' },
  ];
  let tab = 'prod';
  const GROUPED = { fac: 1 };                // 数が多いタブは格で分ける
  const groupSel = { fac: 0 };

  function cardIcon(def) {
    const c = document.createElement('canvas');
    c.width = 56; c.height = 56; c.style.width = '28px'; c.style.height = '28px';
    const cc = c.getContext('2d');
    cc.scale(2, 2);
    if (def.k === 'src') drawItem(cc, def.item, 14, 14, 11);
    else if (def.k === 'fac') drawItem(cc, def.make, 14, 14, 11);
    else if (def.bridge) drawBridge(cc, 14, 14, 9);
    else drawGlyph(cc, def.k, 14, 14, 10);
    return c;
  }

  // 一度も選んでいないカードは NEW。研究で増えた物がどこに出たか分かるようにする。
  const isNew = (key) => !st.seen[key];

  function seeAll() {
    ['prod', 'fac', 'shop', 'logi'].forEach((t) => {
      const keep = tab; tab = t;
      tabList().forEach((b) => { st.seen[b.key] = 1; });
      tab = keep;
    });
  }

  // そのタブがNEWを抱えているか（格の札にも点を出す）
  function newIn(tabKey, rank) {
    const keep = tab; tab = tabKey;
    const hit = tabList().some((b) => isNew(b.key) && (rank === undefined || rankOf(b.key) === rank));
    tab = keep;
    return hit;
  }

  // そのタブに出せるもの全部（格で絞る前）
  function tabList() {
    const out = [];
    {
      Object.keys(BUILDS).forEach((k) => {
        const b = BUILDS[k];
        if (b.tab === tab && st.unlock[b.key]) out.push(b);
      });
      if (tab === 'logi' && st.unlock.bridge) {
        out.push({ key: 'bridge', k: 'bridge', bridge: true, name: '渡し橋の許し',
          sub: '交差を1回ぶん', cost: 400 + st.bridges * 260 });
      }
    }
    return out;
  }

  // 出せるものがある格だけ。無い格の札は出さない（進むほど札が増える）
  function groupsOf(list) {
    const seen = {};
    list.forEach((b) => { seen[rankOf(b.key)] = 1; });
    return TIERS.map((t, i) => i).filter((i) => seen[i]);
  }

  function paletteList() {
    const list = tabList();
    if (!GROUPED[tab]) return list;
    const gs = groupsOf(list);
    if (gs.indexOf(groupSel[tab]) < 0) groupSel[tab] = gs[0] || 0;
    return list.filter((b) => rankOf(b.key) === groupSel[tab]);
  }

  let palSig = '';

  function refreshPalette() {
    const sig = tab + ':' + groupSel[tab] + '|' + groupsOf(tabList()).join('.')
      + '|' + paletteList().map((d) => d.key + defCost(d) + (st.money >= defCost(d) ? '1' : '0') + (isNew(d.key) ? 'n' : '')).join(',')
      + '|' + TABS.map((t) => (newIn(t.key) ? 1 : 0)).join('')
      + '|' + (placing ? placing.def.key : '');
    if (sig === palSig) return;
    palSig = sig;
    buildPalette();
  }

  function buildPalette() {
    const bar = el('tabs');
    bar.innerHTML = '';
    TABS.forEach((t) => {
      const b = document.createElement('button');
      b.className = 'al-tab' + (tab === t.key ? ' on' : '');
      b.textContent = t.name;
      if (newIn(t.key)) b.appendChild(dot());
      b.onclick = () => { SND.unlock(); SND.se('ui'); tab = t.key; refreshPalette(); };
      bar.appendChild(b);
    });
    // 錬成とお店は数が多いので、解放された格で分ける。札は同じ行に続けて出す
    if (GROUPED[tab]) {
      const gs = groupsOf(tabList());
      if (gs.length > 1) {
        const sep = document.createElement('span');
        sep.className = 'al-tabsep';
        bar.appendChild(sep);
        gs.forEach((i) => {
          const b = document.createElement('button');
          b.className = 'al-grp' + (groupSel[tab] === i ? ' on' : '');
          b.textContent = TIERS[i].name;
          if (newIn(tab, i)) b.appendChild(dot());
          b.onclick = () => { SND.unlock(); SND.se('ui'); groupSel[tab] = i; refreshPalette(); };
          bar.appendChild(b);
        });
      }
    }

    const box = el('cards');
    box.innerHTML = '';
    const list = paletteList();
    if (!list.length) {
      const p = document.createElement('p');
      p.className = 'al-empty';
      p.textContent = '研究すると増える';
      box.appendChild(p);
      return;
    }
    list.forEach((def) => {
      const d = document.createElement('button');
      d.className = 'al-card';
      d.appendChild(cardIcon(def));
      const t = document.createElement('span');
      t.innerHTML = '<b>' + def.name + '</b><i>' + (def.sub || '') + '</i><em>'
        + defCost(def).toLocaleString() + 'G</em>';
      d.appendChild(t);
      if (isNew(def.key)) {
        const n = document.createElement('u');
        n.className = 'al-new';
        n.textContent = 'NEW';
        d.appendChild(n);
      }
      const afford = st.money >= defCost(def);
      d.classList.toggle('poor', !afford);
      d.classList.toggle('on', !!placing && placing.def.key === def.key);
      d.onclick = () => {
        SND.unlock(); SND.se('ui');
        st.seen[def.key] = 1;
        save();
        if (def.bridge) { buyBridge(def.cost); return; }
        placing = (placing && placing.def.key === def.key) ? null : { def, rot: 0 };
        refreshPalette();
      };
      box.appendChild(d);
    });
  }

  function dot() {
    const d = document.createElement('i');
    d.className = 'al-dot';
    return d;
  }

  function buyBridge(cost) {
    if (st.money < cost) { SND.se('deny'); return; }
    st.money -= cost;
    st.bridges++;
    save();
    buildPalette();
  }

  // ---------------------------------------------------------------- メニュー
  // 右クリックで開く。設備・ベルト・岩で中身が変わる。
  // 金を使う操作はここに集めてある（左クリックで黙って減らない）。
  let menu = null;

  function closeMenu() {
    if (!menu) return;
    menu = null;
    sel = null;
    el('menu').hidden = true;
  }

  function openMenu(kind, t, px, py) {
    menu = Object.assign({ kind }, t);
    sel = t.node || null;
    const box = el('menu');
    box.hidden = false;
    buildMenu();
    const r = box.getBoundingClientRect();
    box.style.left = Math.max(8, Math.min(px + 4, window.innerWidth - r.width - 8)) + 'px';
    box.style.top = Math.max(8, Math.min(py + 4, window.innerHeight - r.height - 8)) + 'px';
    SND.se('ui');
  }

  function menuItem(label, on, dis) {
    const b = document.createElement('button');
    b.className = 'al-btn';
    b.textContent = label;
    b.disabled = !!dis;
    b.onclick = on;
    el('mItems').appendChild(b);
  }

  function buildMenu() {
    if (!menu) return;
    el('mItems').innerHTML = '';
    if (menu.kind === 'node') {
      const n = menu.node;
      const rated = n.k === 'src' || n.k === 'fac' || n.k === 'shop';
      const per = n.k === 'shop' ? sellTicks(n.def, n.lv) / TPS : nodeTicks(n.def, n.lv) / TPS;
      el('mName').textContent = n.def.name;
      const what = n.k === 'shop' ? (n.flow ? ITEMS[n.flow].name : 'まだ何も来ていない') : '';
      el('mInfo').textContent = rated
        ? n.def.kind + '　Lv' + (n.lv + 1) + '　' + per.toFixed(1) + '秒に1つ' + (what ? '　' + what : '')
        : n.def.kind + '　' + n.def.sub;
      const maxed = n.lv >= LEVEL.max - 1;
      if (rated) {
        menuItem(maxed ? 'レベル最大' : 'レベルアップ ' + lvCost(n) + 'G',
          () => { levelUp(n); buildMenu(); }, maxed || st.money < lvCost(n));
      }
      menuItem('回転（ホイールでも回る）', () => { rotate(n); buildMenu(); });
      menuItem('売却 +' + sellBack(n).toLocaleString() + 'G', () => { sellNode(n); closeMenu(); });
    } else if (menu.kind === 'belt') {
      el('mName').textContent = '送り道';
      el('mInfo').textContent = menu.belt.cells.length + 'マス';
      menuItem('撤去', () => { removeBelt(menu.belt); closeMenu(); });
    } else {
      el('mName').textContent = '瓦礫';
      el('mInfo').textContent = '送り道も設備も置けない';
      menuItem('撤去 ' + rockCost() + 'G',
        () => { breakRock(menu.x, menu.y); closeMenu(); }, st.money < rockCost());
    }
    menuItem('閉じる', closeMenu);
  }

  // ---------------------------------------------------------------- 研究
  // 研究の説明は data.js から組み立てる。表を別に持つと必ずずれるため。
  const RES_EFFECT = {
    belt:     (v) => ['全部の送り道が速くなる', '+' + (v * 2) + ' マス/秒'],
    sellRate: (v) => ['全部のお店が速く捌ける', '+' + Math.round(v * 100) + '%'],
    price:    (v) => ['全部の売値が上がる', '+' + Math.round(v * 100) + '%'],
    land:     (v) => ['土地の値段が下がる', '−' + Math.round(v * 100) + '%'],
    rock:     (v) => ['瓦礫の撤去費が下がる', '−' + Math.round(v * 100) + '%'],
  };

  function unlockName(k) {
    if (k === 'bridge') return '陸橋';
    const b = BUILDS[k];
    if (!b) return k;
    return b.k === 'fac' ? b.name + '（' + b.sub + '）' : b.name;
  }

  function resLines(r) {
    const out = [];
    const lv = resLv(r), max = resMax(r);
    if (r.unlock) out.push(['買えるようになる：' + r.unlock.map(unlockName).join('、'), '']);
    if (r.stat) {
      const e = RES_EFFECT[r.stat];
      out.push([e(r.per)[0] + '。1レベルにつき ' + e(r.per)[1], '']);
      out.push(['いま Lv' + lv + ' / ' + max + '　合計 ' + e(r.per * lv)[1], 'dim']);
    }
    if (lv >= max) out.push([r.stat ? 'これ以上は上げられない' : '解放済み', 'dim']);
    else if (r.tier > st.tier) out.push([TIERS[r.tier].name + 'に届くまで買えない', 'dim']);
    else {
      const c = resCost(r, lv);
      out.push([(r.stat ? '次のレベル ' : '') + c.toLocaleString() + 'G', 'dim']);
      if (st.money < c) out.push(['あと ' + (c - st.money).toLocaleString() + 'G 足りない', 'dim']);
    }
    return out;
  }

  // 説明の吹き出し。押せない項目にも出したいので disabled は使わない
  function showTip(anchor, lines) {
    const t = el('tip');
    t.innerHTML = '';
    lines.forEach(([txt, cls]) => {
      const sp = document.createElement('span');
      sp.textContent = txt;
      if (cls) sp.className = cls;
      t.appendChild(sp);
    });
    t.hidden = false;
    const a = anchor.getBoundingClientRect();
    const r = t.getBoundingClientRect();
    let y = a.bottom + 6;
    if (y + r.height > window.innerHeight - 8) y = a.top - r.height - 6;
    t.style.left = Math.max(8, Math.min(a.left, window.innerWidth - r.width - 8)) + 'px';
    t.style.top = Math.max(8, y) + 'px';
  }

  function hideTip() { el('tip').hidden = true; }

  // 開いたまま金が貯まるので、作り直さずに押せる・押せないだけ塗り替える。
  // 作り直すと、カーソルを乗せている説明が毎秒消えてしまう。
  let resEls = [];
  function syncResearch() {
    resEls.forEach(({ r, b }) => {
      const lv = resLv(r);
      const off = lv >= resMax(r) || r.tier > st.tier || st.money < resCost(r, lv);
      b.classList.toggle('off', !!off);
    });
  }

  function buildResearch() {
    const box = el('resBody');
    const keep = box.scrollTop;
    box.innerHTML = '';
    resEls = [];
    // 柱を列で並べると錬成だけ極端に長くなるので、柱ごとの帯にして折り返す
    PILLARS.forEach((p) => {
      const col = document.createElement('div');
      col.className = 'al-resec';
      const h = document.createElement('h4');
      h.textContent = p.name;
      col.appendChild(h);
      const grid = document.createElement('div');
      grid.className = 'al-resgrid';
      col.appendChild(grid);
      RESEARCH.filter((r) => r.p === p.key).forEach((r) => {
        const done = resLv(r) >= resMax(r);
        const locked = r.tier > st.tier;
        const b = document.createElement('button');
        const off = done || locked || st.money < resCost(r);
        b.className = 'al-res' + (done ? ' done' : locked ? ' locked' : '') + (off ? ' off' : '');
        const lv = resLv(r), max = resMax(r);
        const right = done ? (r.stat ? '最大' : '解放済み')
          : locked ? TIERS[r.tier].name + 'から'
            : resCost(r).toLocaleString() + 'G';
        b.innerHTML = '<b>' + r.name + '</b>'
          + (max > 1 ? '<em>Lv' + lv + '/' + max + '</em>' : '')
          + '<i>' + right + '</i>';
        b.onclick = () => buyResearch(r);
        b.onmouseenter = () => showTip(b, resLines(r));
        b.onmouseleave = hideTip;
        resEls.push({ r, b });
        grid.appendChild(b);
      });
      box.appendChild(col);
    });
    box.scrollTop = keep;
    hideTip();
  }

  function buyResearch(r) {
    const lv = resLv(r);
    const c = resCost(r, lv);
    if (lv >= resMax(r) || r.tier > st.tier || st.money < c) { SND.se('deny'); return; }
    st.money -= c;
    st.done[r.key] = lv + 1;
    applyResearch();
    // 増えたカードが埋もれないよう、その格へ寄せておく
    if (r.unlock) groupSel.fac = r.tier;
    SND.se('research');
    buildResearch();
    buildPalette();
    buildCodex();
    save();
  }

  // ---------------------------------------------------------------- 図鑑
  // 深くなると「これ何に使うのか」が分からなくなる。作り方と使い道を出す。
  function buildCodex() {
    const box = el('codexBody');
    box.innerHTML = '';
    for (let t = 0; t <= 3; t++) {
      const known = Object.keys(ITEMS).filter((k) => ITEMS[k].tier === t && producible(k));
      if (!known.length) continue;
      const sec = document.createElement('div');
      sec.className = 'al-cosec';
      const h = document.createElement('h4');
      h.textContent = t === 0 ? '原料' : t + '段';
      sec.appendChild(h);
      known.forEach((k) => {
        const row = document.createElement('div');
        row.className = 'al-corow';
        const c = document.createElement('canvas');
        c.width = 48; c.height = 48; c.style.width = '24px'; c.style.height = '24px';
        const cc = c.getContext('2d'); cc.scale(2, 2);
        drawItem(cc, k, 12, 12, 9);
        row.appendChild(c);
        const from = RECIPES.filter((r) => r.make === k && st.unlock[r.key])
          .map((r) => r.in.map((i) => ITEMS[i].name).join('＋'));
        const src = SOURCES.filter((s) => s.item === k && st.unlock[s.key]).map(() => '採取地');
        const use = RECIPES.filter((r) => r.in.indexOf(k) >= 0 && st.unlock[r.key])
          .map((r) => ITEMS[r.make].name);
        const txt = document.createElement('span');
        txt.innerHTML = '<b>' + ITEMS[k].name + '</b><em>' + priceOf(k) + 'G</em>'
          + '<i>作り方: ' + (src.concat(from).join(' ／ ') || '—') + '</i>'
          + '<i>使い道: ' + (use.join('・') || 'まだ無い（売る）') + '</i>';
        row.appendChild(txt);
        sec.appendChild(row);
      });
      box.appendChild(sec);
    }
  }

  // ---------------------------------------------------------------- 通信
  function showNews(t) {
    el('newsHead').textContent = t.name;
    const b = el('newsBody');
    b.innerHTML = '';
    t.msg.forEach((line) => {
      const p = document.createElement('p');
      p.textContent = line;
      b.appendChild(p);
    });
    const n = el('news');
    n.hidden = false;
    n.classList.remove('in');
    void n.offsetWidth;
    n.classList.add('in');
    if (!TIERS[st.tier + 1]) el('newsEnd').hidden = false;
  }

  // ---------------------------------------------------------------- 世界一の看板
  function showCert() {
    SND.bgm('end');
    const top = Object.keys(st.sold).sort((a, b) => st.sold[b] - st.sold[a])[0];
    el('certBody').innerHTML =
      '<dl>'
      + '<dt>店の格</dt><dd>世界一の魔法のお店</dd>'
      + '<dt>総売上</dt><dd>' + st.total.toLocaleString() + ' G</dd>'
      + '<dt>看板商品</dt><dd>' + (top ? ITEMS[top].name : '—') + '</dd>'
      + '<dt>設備</dt><dd>' + st.nodes.length + ' 基</dd>'
      + '<dt>送り道</dt><dd>' + st.belts.reduce((a, b) => a + b.cells.length, 0) + ' マス</dd>'
      + '<dt>称号</dt><dd>' + title(top) + '</dd>'
      + '</dl>';
    el('cert').hidden = false;
  }

  function title(top) {
    if (!top) return '看板だけの店';
    if (ITEMS[top].tier === 0) return '掘っただけで世界一になった人';
    if (st.bridges >= 8) return '渡し橋を' + st.bridges + '本架けた錬金術師';
    if (ITEMS[top].tier === 3) return ITEMS[top].name + 'の名店';
    return ITEMS[top].name + '専門店';
  }

  // ---------------------------------------------------------------- 保存
  let saveT = 0;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(writeSave, 400);
  }

  function writeSave() {
    try {
      const pi = new Map();
      st.nodes.forEach((n, i) => {
        n.ins.forEach((p, j) => pi.set(p, [i, 'i', j]));
        n.outs.forEach((p, j) => pi.set(p, [i, 'o', j]));
      });
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        w: st.w, h: st.h, money: st.money, total: st.total, tier: st.tier,
        landBuys: st.landBuys, bridges: st.bridges, done: st.done, sold: st.sold, log: st.log, seen: st.seen, tut: st.tut,
        rocks: st.cell.map((c, i) => (c.rock ? i : -1)).filter((i) => i >= 0),
        nodes: st.nodes.map((n) => ({ d: n.def.key, x: n.x, y: n.y, r: n.rot, l: n.lv })),
        belts: st.belts.map((b) => ({ f: pi.get(b.from), t: pi.get(b.to), c: b.cells.map((c) => [c.x, c.y]) })),
      }));
    } catch (e) { /* file:// で弾かれても遊べる */ }
  }

  function load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return false; }
    if (!raw || !raw.nodes) return false;
    st = blank();
    st.w = raw.w; st.h = raw.h;
    st.cell = makeCells(st.w, st.h);
    (raw.rocks || []).forEach((i) => { if (st.cell[i]) st.cell[i].rock = true; });
    st.money = raw.money; st.total = raw.total; st.tier = raw.tier || 0;
    st.landBuys = raw.landBuys || 0; st.bridges = raw.bridges || 0;
    st.done = raw.done || {}; st.sold = raw.sold || {}; st.log = raw.log || {}; st.seen = raw.seen || {};
    st.tut = raw.tut === undefined ? -1 : raw.tut;
    applyResearch();
    raw.nodes.forEach((n) => {
      const def = BUILDS[n.d] || (n.d.indexOf('shop_') === 0 ? BUILDS.shop : null);
      if (def) addNode(mkNode(def, n.x, n.y, n.r, n.l));
    });
    const port = (ref) => {
      const n = st.nodes[ref[0]];
      return n ? (ref[1] === 'i' ? n.ins[ref[2]] : n.outs[ref[2]]) : null;
    };
    (raw.belts || []).forEach((b) => {
      const f = port(b.f), t = port(b.t);
      if (!f || !t || f.belt || t.belt) return;
      addBelt(f, t, b.c.map(([x, y]) => ({ x, y })));
    });
    return true;
  }

  function reset() {
    st = blank();
    st.cell = makeCells(st.w, st.h);
    applyResearch();
    seeAll();
    // 開始時、敷地には魔鉱石の採取地1と魔鉱石屋1が置いてある。送り道は1本も引いてない。
    addNode(mkNode(BUILDS.src_magicore, 2, Math.floor(st.h / 2), 0, 0));
    addNode(mkNode(BUILDS.shop, st.w - 3, Math.floor(st.h / 2), 2, 0));
    resolve();
    save();
  }

  // ---------------------------------------------------------------- 起動
  function overlay(id, openBtn, closeBtn, onOpen) {
    const o = el(id);
    if (openBtn) el(openBtn).onclick = () => { SND.unlock(); SND.se('ui'); if (onOpen) onOpen(); o.hidden = false; };
    if (closeBtn) el(closeBtn).onclick = () => { SND.se('ui'); o.hidden = true; hideTip(); };
  }

  function init() {
    if (!load()) reset();
    layout();
    buildPalette();
    buildResearch();
    buildCodex();
    markLog();

    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('wheel', onWheel, { passive: false });

    // 購入パレットは横に並ぶ。ホイールは縦に回すので、そのまま横送りに割り当てる
    el('cards').addEventListener('wheel', (e) => {
      const box = el('cards');
      if (box.scrollWidth <= box.clientWidth) return;
      e.preventDefault();
      box.scrollLeft += e.deltaY || e.deltaX;
    }, { passive: false });
    cv.addEventListener('pointerleave', () => { hoverCell = null; hoverExpand = null; });
    window.addEventListener('resize', layout);
    window.addEventListener('beforeunload', writeSave);
    // メニューの外を触ったら閉じる
    document.addEventListener('pointerdown', (e) => {
      if (menu && !el('menu').contains(e.target) && e.target !== cv) closeMenu();
    }, true);

    overlay('res', 'btnRes', 'btnResClose', buildResearch);
    overlay('help', 'btnHelp', 'btnHelpClose');
    overlay('ovOpt', 'btnOpt', 'btnOptClose', syncSound);
    el('btnTut').onclick = () => { st.tut = 0; save(); updateHint(); el('help').hidden = true; };
    overlay('log', 'btnLog', 'btnLogClose', buildLog);
    overlay('codex', 'btnCodex', 'btnCodexClose', buildCodex);
    overlay('cert', null, 'btnCertClose');
    el('btnNewsClose').onclick = () => { SND.se('ui'); el('news').hidden = true; };
    el('btnNewsEnd').onclick = () => { el('news').hidden = true; showCert(); };

    el('btnReset').onclick = () => {
      if (!confirm('最初からやり直します。よろしいですか？')) return;
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
      reset(); layout(); buildPalette(); buildResearch(); buildCodex(); markLog(); closeMenu();
      el('ovOpt').hidden = true;
    };

    setupSound();
    setInterval(refreshPalette, 600);   // 買えるようになったカードを光らせる
    SND.bgm('play');
    requestAnimationFrame(frame);
  }

  // 盤面の中身をブラウザから覗くための口。動作確認に使う
  window.__cl = {
    st: () => st,
    ports: () => allPorts().map((p) => ({ n: p.node.def.key, io: p.io, item: p.item,
      side: p.side, dir: portDir(p), ax: portAX(p), ay: portAY(p), belt: !!p.belt })),
    belts: () => st.belts.map((b) => ({ from: b.from.node.def.key, to: b.to.node.def.key,
      item: b.from.item, cells: b.cells.length })),
    money: (v) => { st.money = v; },
    // 時間を渡せば進む。描画が止まる場所でも同じ道筋で確かめられるようにする
    advance: (ms, step) => { const d = step || 100; for (let t = 0; t < ms; t += d) advance(d); },
  };

  // ---------------------------------------------------------------- オプション
  // 右上は歯車ひとつ。音・データ・サイトへの導線をここにまとめる。
  function syncSound() {
    const on = SND.ready();
    el('volBox').hidden = !on;
    el('noAudio').hidden = on;
    el('btnOpt').classList.toggle('is-mute', on && SND.muted());
    if (!on) return;
    const v = SND.vol();
    el('vBgm').value = v.bgm; el('vBgmV').textContent = Math.round(v.bgm * 100) + '%';
    el('vSe').value = v.se; el('vSeV').textContent = Math.round(v.se * 100) + '%';
    el('btnMute').textContent = SND.muted() ? 'ミュート解除' : 'ミュート';
  }

  function setupSound() {
    syncSound();
    el('btnMute').onclick = () => { SND.setMute(!SND.muted()); syncSound(); };
    el('vBgm').oninput = (e) => { SND.setVol('bgm', +e.target.value); syncSound(); };
    el('vSe').oninput = (e) => { SND.setVol('se', +e.target.value); syncSound(); };
    const cr = SND.credits();
    if (cr.length) {
      el('credits').hidden = false;
      el('credits').innerHTML = cr.map((c) => c.what + '：' + (c.url
        ? '<a href="' + c.url + '" target="_blank" rel="noopener">' + c.who + '</a>' : c.who)).join('　');
    }
  }

  init();
})();
