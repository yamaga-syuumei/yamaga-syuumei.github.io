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
  const { ITEMS, RECIPES, SOURCES, FLAVOR, LOGI, SHOP, RESEARCH, PILLARS, TIERS, LOG, BOARD, LEVEL } = D;
  const { drawItem, drawBridge, drawSpeed, drawGlyph, roundRect,
    hexA, drawSigil, drawStone, glow, twinkle } = window.ART;
  const SND = window.ALSND;

  const TPS = 12;
  const DT = 1000 / TPS;
  const PAD = 26;                       // 盤面の外。拡張ボタンを描く帯
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // E S W N
  const SAVE_KEY = 'alchemy.save1';
  const SAVE_VER = 1;

  // 明るい盤面の上に置くので、面は淡く・縁だけ濃くする
  // fill と edge は明るい札の上、glow は夜の盤面の上で使う色
  const SKIN = {
    src:   { fill: '#e4f0f7', edge: '#4e87a8', glow: '#6fd3ff' },
    fac:   { fill: '#ece4f7', edge: '#7a5fa8', glow: '#b994ff' },
    split: { fill: '#dff1ea', edge: '#2e8b6f', glow: '#62e6b0' },
    store: { fill: '#f5ecd8', edge: '#a3833c', glow: '#f0c46a' },
    shop:  { fill: '#fbe7d8', edge: '#c07a3c', glow: '#ffae5c' },
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
  const shopCost = (n) => Math.round(SHOP.baseCost
    * Math.pow(SHOP.stepEasy, Math.min(Math.max(0, n), SHOP.easy))
    * Math.pow(SHOP.stepHard, Math.max(0, n - SHOP.easy)));
  // 買うときも売るときも、その軒数のときの値段で数える
  const defCost = (def) => (def.k === 'shop' ? shopCost(shopCount()) : def.cost);
  const sellBack = (n) => Math.round((n.k === 'shop' ? shopCost(shopCount() - 1) : n.def.cost) / 2);

  // 設備がどのランクで解放されるか。購入パレットの並べ替えに使う。
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
  // 拡大。zoom 1 で盤面全体が枠に収まる。focus は枠の中心に来る盤面の位置（マス単位）
  let zoom = 1, fitCs = 46, focusX = -1, focusY = -1, VW = 0, VH = 0;
  let panning = null;       // 盤面を掴んで動かしている
  const ZOOM_MAX = 3.2;
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
  const landCost = () => Math.round(BOARD.landBase
    * Math.pow(BOARD.landStep, Math.min(st.landBuys, BOARD.landSoft))
    * Math.pow(BOARD.landStep2, Math.max(0, st.landBuys - BOARD.landSoft))
    * (1 - st.bonus.land));
  const rockCost = () => Math.round(BOARD.rockCost
    * Math.pow(BOARD.rockStep, st.rockBuys || 0) * (1 - st.bonus.rock));
  const lvCost = (n) => Math.round(n.def.cost * Math.pow(LEVEL.costMul, n.lv));

  // ---------------------------------------------------------------- 組み立て
  function blank() {
    return {
      w: BOARD.w, h: BOARD.h, cell: [], nodes: [], belts: [],
      money: BOARD.startMoney, total: 0, tier: 0, landBuys: 0, rockBuys: 0, bridges: 0,
      unlock: {}, done: {}, sold: {}, log: {}, logNew: 0, seen: {}, tut: 0, made: {},
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
        if (n.t >= nodeTicks(n.def, n.lv)) { n.t = 0; o.buf.push(n.def.item); discover(n.def.item); }
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
        if (o.buf.length < o.cap) {
          discover(n.pending);
          o.buf.push(n.pending); n.pending = null; n.lit = 1; SND.se('craft');
          addFx('craft', n.x, n.y, { col: SKIN.fac.glow });
        }
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
        addFx('coin', n.x, n.y);
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
      if (e.key && window.HERO) HERO.boss();      // 勇者の話が進んだ。次の敵は大物
    });
    if (got.length) heroSync();
    if (got.length) SND.se('news');
    if (got.length) { markDots(); save(); }
  }

  // 便り・研究・図鑑の点。「まだ見ていないものがある」印。
  // 研究は買えるようになったもの、図鑑は作れるようになった品を数える。
  const resKeys = () => RESEARCH.filter((r) => r.tier <= st.tier && resLv(r) < resMax(r))
    .map((r) => 'res:' + r.key);
  const codexKeys = () => Object.keys(st.made).map((k) => 'cdx:' + k);
  const anyNew = (keys) => keys.some((k) => !st.seen[k]);

  function markDots() {
    el('logDot').hidden = !st.logNew;
    el('resDot').hidden = !anyNew(resKeys());
    el('codexDot').hidden = !anyNew(codexKeys());
  }

  // 開いた時点で買える・見られるものを見たことにする。あとで増えたらまた点が出る
  function seeThese(keys) {
    keys.forEach((k) => { st.seen[k] = 1; });
    markDots();
    save();
  }

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
    markDots();
    const box = el('logBody');
    box.innerHTML = '';

    const hero = document.createElement('div');
    hero.className = 'al-logsec';
    const h1 = document.createElement('h4');
    const hOpen = LOG.hero.filter((e) => st.log[e.key]).length;
    h1.innerHTML = '<span>勇者の歩み</span><span>' + hOpen + ' / ' + LOG.hero.length + '</span>';
    hero.appendChild(h1);
    LOG.hero.forEach((e, i) => {
      logRow(hero, i + 1, e, !!st.log[e.key], e.need.toLocaleString() + 'G 以上の品を売ると届く');
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

  // ---------------------------------------------------------------- 錬金術師のランク
  function checkTier() {
    const next = TIERS[st.tier + 1];
    if (!next || st.total < next.need) return;
    st.tier++;
    heroSync();
    SND.se('news');
    showNews(TIERS[st.tier]);
    buildResearch();
    markDots();
    save();
  }

  // 次のランクまでどのくらい来たか（0〜1）
  function rankProgress() {
    const cur = TIERS[st.tier], next = TIERS[st.tier + 1];
    if (!next) return 1;
    return Math.max(0, Math.min(1, (st.total - cur.need) / (next.need - cur.need)));
  }

  // ---------------------------------------------------------------- 座標
  // キャンバスは枠いっぱい。拡大していなければ盤面全体が収まる大きさで真ん中に置く
  function layout() {
    const box = document.querySelector('.al-board');
    VW = Math.max(120, box.clientWidth);
    VH = Math.max(120, box.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(VW * dpr);
    cv.height = Math.round(VH * dpr);
    cv.style.width = VW + 'px';
    cv.style.height = VH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fitCs = Math.max(12, Math.min(58, Math.floor(Math.min((VW - PAD * 2) / st.w, (VH - PAD * 2) / st.h))));
    cs = fitCs * zoom;
    placeView();
  }

  // 拡大中でも盤面の外ばかり見えないよう、盤面の端を枠に合わせて止める
  function placeView() {
    if (focusX < 0) { focusX = st.w / 2; focusY = st.h / 2; }
    const fit = (f, n, view) => {
      const full = n * cs;
      if (full + PAD * 2 <= view) return Math.round(view / 2 - full / 2);
      return Math.min(PAD, Math.max(view - full - PAD, view / 2 - f * cs));
    };
    ox = fit(focusX, st.w, VW);
    oy = fit(focusY, st.h, VH);
    focusX = (VW / 2 - ox) / cs;
    focusY = (VH / 2 - oy) / cs;
  }

  // 指している場所を動かさずに拡大・縮小する
  function zoomAt(px, py, factor) {
    const nz = Math.max(1, Math.min(ZOOM_MAX, zoom * factor));
    if (Math.abs(nz - zoom) < 1e-4) return;
    const bx = (px - ox) / cs, by = (py - oy) / cs;
    zoom = nz;
    cs = fitCs * zoom;
    focusX = (VW / 2 - (px - bx * cs)) / cs;
    focusY = (VH / 2 - (py - by * cs)) / cs;
    placeView();
  }

  function panBy(dx, dy) {
    focusX -= dx / cs;
    focusY -= dy / cs;
    placeView();
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

  // 口をつかめるのは設備の外側の1マスだけ。設備の上から引くと移動と取り違える。
  // そのマスが空いているか、その口から出ている送り道（引き直し）のときだけ。
  // 同じマスを2つの口が向いていることがあるので、近い方を選ぶ。
  function portAtPointer(pc) {
    let best = null, bestD = Infinity;
    const open = canDraw(pc.x, pc.y);
    for (const p of allPorts()) {
      if (portAX(p) !== pc.x || portAY(p) !== pc.y) continue;
      if (!open && !(p.belt && at(pc.x, pc.y).belts.indexOf(p.belt) >= 0)) continue;
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

    // 中ボタンはどこでも盤面を掴む
    if (e.button === 1) { e.preventDefault(); startPan(e, pc); return; }

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
    if (!inBoard(pc.x, pc.y)) { if (zoom > 1) startPan(e, pc); return; }

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
    if (node) { moving = { node, moved: false }; SND.se('pickup'); return; }

    if (at(pc.x, pc.y).rock) return;
    const hit = beltAt(pc.x, pc.y);
    if (hit) { removeBelt(hit); return; }
    // 何も無いマス。拡大中なら掴んで盤面を動かす
    if (zoom > 1) startPan(e, pc);
  }

  function startPan(e, pc) {
    panning = { px: pc.px, py: pc.py };
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 合成イベントでは失敗する */ }
    cv.style.cursor = 'grabbing';
  }

  // ホイールは拡大・縮小。Shift を押しながらだと回転。
  // 回すと送り道が外れるので、拡大のつもりで回ってしまわないよう分けてある
  function onWheel(e) {
    e.preventDefault();
    const d = e.deltaY || e.deltaX;            // Shift を押すと横の量で来るブラウザがある
    const pc = pointerAt(e);
    if (e.shiftKey) { turnAt(pc, d > 0 ? 1 : 3); return; }
    zoomAt(pc.px, pc.py, Math.exp(-d * (e.deltaMode === 1 ? 0.05 : 0.0015)));
  }

  // 回す。設置中は置く向き、そうでなければ指している設備
  let turnAtT = 0;
  function turnAt(pc, dir) {
    if (performance.now() - turnAtT < 140) return;   // 一振りで何回も回らないように
    turnAtT = performance.now();
    if (placing) { placing.rot = (placing.rot + dir) & 3; return; }
    if (!pc || !inBoard(pc.x, pc.y)) return;
    const n = at(pc.x, pc.y).node;
    if (n) rotate(n, dir);
  }

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'r' || e.key === 'R') { turnAt(hoverCell, e.shiftKey ? 3 : 1); return; }
    if (e.key === '+' || e.key === '=') { zoomAt(VW / 2, VH / 2, 1.25); return; }
    if (e.key === '-') { zoomAt(VW / 2, VH / 2, 0.8); return; }
    if (e.key === '0') { zoom = 1; focusX = -1; layout(); }
  }

  let denyAt = 0;

  function onMove(e) {
    const pc = pointerAt(e);
    if (panning) {
      panBy(pc.px - panning.px, pc.py - panning.py);
      const q = pointerAt(e);
      panning.px = q.px; panning.py = q.py;
      return;
    }
    hoverCell = inBoard(pc.x, pc.y) ? { x: pc.x, y: pc.y } : null;
    hoverExpand = expandAt(pc);

    if (moving) {
      if (pc.x !== moving.node.x || pc.y !== moving.node.y) moving.moved = true;
      moving.to = inBoard(pc.x, pc.y) ? { x: pc.x, y: pc.y } : null;
      return;
    }
    if (!drag) {
      hoverBelt = inBoard(pc.x, pc.y) ? beltAt(pc.x, pc.y) : null;
      const onNode = inBoard(pc.x, pc.y) && at(pc.x, pc.y).node;
      const onRock = inBoard(pc.x, pc.y) && at(pc.x, pc.y).rock;
      cv.style.cursor = placing ? 'copy'
        : onNode ? 'move'
        : (hoverExpand || hoverBelt) ? 'pointer'
        : (zoom > 1 && !onRock) ? 'grab' : 'crosshair';
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
    if (panning) { panning = null; cv.style.cursor = zoom > 1 ? 'grab' : 'crosshair'; return; }
    if (moving) {
      const m = moving; moving = null;
      if (m.moved && m.to && free(m.to.x, m.to.y)) moveNode(m.node, m.to.x, m.to.y);
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
    const nn = mkNode(def, x, y, placing.rot, 0);
    nn.born = performance.now();
    addNode(nn);
    addFx('build', x, y, { col: SKIN[def.k].glow, kind: def.k === 'split' || def.k === 'store' ? 'none' : def.k });
    resolve();
    SND.se('place');
    save();
    buildPalette();
  }

  function moveNode(n, x, y) {
    n.ins.concat(n.outs).forEach((p) => { if (p.belt) removeBelt(p.belt, true); });
    at(n.x, n.y).node = null;
    addFx('poof', n.x, n.y, { col: SKIN[n.k].glow });
    n.x = x; n.y = y;
    at(x, y).node = n;
    n.born = performance.now();
    addFx('build', x, y, { col: SKIN[n.k].glow, kind: n.k === 'split' || n.k === 'store' ? 'none' : n.k });
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
    addFx('poof', n.x, n.y, { col: SKIN[n.k].glow });
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
    addFx('level', n.x, n.y);
    SND.se('levelup');
    save();
  }

  function buyLand(side) {
    const c = landCost();
    if (st.money < c) { SND.se('deny'); return; }
    st.money -= c;
    st.landBuys++;
    expand(side);
    if (side === 'W') focusX += 1;
    if (side === 'N') focusY += 1;
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
    st.rockBuys = (st.rockBuys || 0) + 1;
    at(x, y).rock = false;
    addFx('poof', x, y, { col: '#b9a8d8' });
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
    stepMotes(dt);
    stepFx(dt);
    discStep(dt);
    if (window.HERO) { HERO.step(dt); HERO.draw(); }

    draw();
    updateHud(dt);
  }

  // ---------------------------------------------------------------- 盤面の絵
  // 夜の錬金台。暗い石の台に金の縁、薄く回る大きな魔法陣、漂う光の粒。
  // 設備は石の台座に乗り、足元の魔法陣が働いている間だけ速く回る。
  // 光は shadowBlur を使わず、放射グラデーションを加算で重ねて出す（数が増えても重くしない）。

  // 漂う光の粒。盤面の中の位置を 0〜1 で持つので、拡大しても同じ場所に浮いている
  const motes = [];
  function stepMotes(dt) {
    const want = Math.min(70, Math.round(st.w * st.h / 3));
    while (motes.length < want) motes.push(newMote(true));
    if (motes.length > want) motes.length = want;
    const k = dt / 1000;
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      m.v -= m.sp * k;
      m.u += Math.sin(m.ph + st.flowT / 1000 * m.sw) * .004 * k;
      if (m.v < -0.05) motes[i] = newMote(false);
    }
  }
  function newMote(anywhere) {
    return { u: Math.random(), v: anywhere ? Math.random() : 1.05, sp: .015 + Math.random() * .03,
      ph: Math.random() * 6.3, sw: .4 + Math.random() * .8, r: .4 + Math.random() * .9,
      col: Math.random() < .7 ? '#c9a8ff' : '#f0c46a' };
  }

  let fx = [];              // 一度きりの演出（設置・レベルアップ・撤去・錬成・売上）
  const FX_DUR = { build: 900, level: 1000, poof: 700, craft: 520, coin: 800 };
  function addFx(type, x, y, extra) {
    const f = Object.assign({ type, x, y, t: 0, parts: [] }, extra || {});
    const n = { build: 18, level: 14, poof: 16, craft: 7, coin: 4 }[type] || 0;
    for (let i = 0; i < n; i++) {
      f.parts.push({ a: Math.random() * 6.283, v: .6 + Math.random() * .9, s: .5 + Math.random() * .8,
        d: Math.random() * .25, spin: (Math.random() - .5) * 8 });
    }
    fx.push(f);
    if (fx.length > 160) fx.splice(0, fx.length - 160);
  }
  function stepFx(dt) {
    for (const f of fx) f.t += dt;
    fx = fx.filter((f) => f.t < FX_DUR[f.type]);
  }

  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const backOut = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

  function draw() {
    ctx.clearRect(0, 0, VW, VH);
    drawTable();
    drawRocks();
    drawRockPrice();
    drawHover();
    drawExpand();
    st.belts.forEach(drawBelt);
    if (drag) drawDrag();
    st.nodes.forEach(drawNode);
    st.belts.forEach(drawItems);
    if (drag) drawPortHints();
    if (placing) drawGhost();
    if (moving && moving.moved) drawMoveGhost();
    drawFx();
    drawPops();
  }

  // 台。外は暗い縁、内に金の二重線。中に罫と透かしの魔法陣と光の粒
  function drawTable() {
    const BW = st.w * cs, BH = st.h * cs;
    const t = st.flowT / 1000;
    ctx.save();
    roundRect(ctx, ox - 8, oy - 8, BW + 16, BH + 16, 12);
    ctx.fillStyle = '#0f0b1c'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#b8913f'; ctx.stroke();
    const g = ctx.createRadialGradient(ox + BW / 2, oy + BH / 2, 0, ox + BW / 2, oy + BH / 2, Math.max(BW, BH) * .72);
    g.addColorStop(0, '#2c2149'); g.addColorStop(.7, '#1b1430'); g.addColorStop(1, '#120d22');
    ctx.fillStyle = g;
    ctx.fillRect(ox, oy, BW, BH);
    ctx.strokeStyle = 'rgba(240,196,106,.32)'; ctx.lineWidth = 1;
    ctx.strokeRect(ox - 3.5, oy - 3.5, BW + 7, BH + 7);
    // 四隅の金の飾り
    ctx.fillStyle = '#d9b35a';
    [[ox - 8, oy - 8], [ox + BW + 8, oy - 8], [ox - 8, oy + BH + 8], [ox + BW + 8, oy + BH + 8]].forEach(([x, y]) => {
      ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.closePath(); ctx.fill();
    });

    ctx.beginPath(); ctx.rect(ox, oy, BW, BH); ctx.clip();
    // 透かしの魔法陣。とてもゆっくり回る
    const R = Math.min(BW, BH) * .46;
    drawSigil(ctx, ox + BW / 2, oy + BH / 2, R, t * .02, 'rgba(201,168,255,.07)', 'big');
    drawSigil(ctx, ox + BW / 2, oy + BH / 2, R * .55, -t * .035, 'rgba(240,196,106,.05)', 'fac');
    // 罫と交点の金の点
    ctx.strokeStyle = 'rgba(201,168,255,.075)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < st.w; x++) { const px = Math.round(cellX(x)) + .5; ctx.moveTo(px, oy); ctx.lineTo(px, oy + BH); }
    for (let y = 1; y < st.h; y++) { const py = Math.round(cellY(y)) + .5; ctx.moveTo(ox, py); ctx.lineTo(ox + BW, py); }
    ctx.stroke();
    if (cs >= 20) {
      ctx.fillStyle = 'rgba(240,196,106,.28)';
      for (let y = 1; y < st.h; y++) for (let x = 1; x < st.w; x++) {
        ctx.fillRect(Math.round(cellX(x)) - .5, Math.round(cellY(y)) - .5, 2, 2);
      }
    }
    // 光の粒
    ctx.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      const x = ox + m.u * BW, y = oy + m.v * BH;
      const tw = .5 + .5 * Math.sin(t * 2 + m.ph * 3);
      glow(ctx, x, y, cs * .12 * m.r * (1 + tw * .5), m.col, .35 * tw + .1);
    }
    ctx.restore();
  }

  function drawRocks() {
    for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
      if (at(x, y).rock) drawStone(ctx, midX(x), midY(y), cs * .4, x * 31 + y * 17);
    }
  }

  // 指しているマスをうっすら照らす
  function drawHover() {
    if (!hoverCell || drag || moving || panning) return;
    const x = cellX(hoverCell.x), y = cellY(hoverCell.y);
    ctx.save();
    ctx.fillStyle = 'rgba(201,168,255,.07)';
    ctx.fillRect(x, y, cs, cs);
    ctx.strokeStyle = 'rgba(240,196,106,.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(x + .5, y + .5, cs - 1, cs - 1);
    ctx.restore();
  }

  // 岩に乗せたら撤去の値段を出す。盤面の外の ＋ と同じ見せ方に揃える
  function drawRockPrice() {
    if (!hoverCell || placing || drag || moving) return;
    if (!at(hoverCell.x, hoverCell.y).rock) return;
    const c = rockCost();
    const can = st.money >= c;
    const x = midX(hoverCell.x), y = midY(hoverCell.y);
    const txt = '撤去 ' + c.toLocaleString() + 'G';
    ctx.save();
    ctx.font = '600 ' + Math.round(Math.max(10, Math.min(16, cs * 0.24))) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(txt).width + 14;
    const h = Math.max(18, Math.min(24, cs * 0.42));
    roundRect(ctx, x - w / 2, y - cs * 0.62 - h / 2, w, h, 5);
    ctx.fillStyle = 'rgba(20,14,36,.92)'; ctx.fill();
    ctx.strokeStyle = can ? 'rgba(240,196,106,.7)' : 'rgba(240,110,110,.7)';
    ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = can ? '#f3d58a' : '#ff9a9a';
    ctx.fillText(txt, x, y - cs * 0.62);
    ctx.restore();
  }

  function drawExpand() {
    const W = st.w * cs, H = st.h * cs;
    const c = landCost();
    const can = st.money >= c;
    const bands = [];
    if (st.h < BOARD.maxH) bands.push(['N', ox, oy - PAD + 1, W, PAD - 11]);
    if (st.h < BOARD.maxH) bands.push(['S', ox, oy + H + 10, W, PAD - 11]);
    if (st.w < BOARD.maxW) bands.push(['W', ox - PAD + 1, oy, PAD - 11, H]);
    if (st.w < BOARD.maxW) bands.push(['E', ox + W + 10, oy, PAD - 11, H]);
    bands.forEach(([side, x, y, w, h]) => {
      const hot = hoverExpand === side;
      ctx.save();
      roundRect(ctx, x, y, w, h, 4);
      ctx.fillStyle = hot ? (can ? 'rgba(240,196,106,.28)' : 'rgba(200,80,80,.22)') : 'rgba(122,95,168,.10)';
      ctx.fill();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = hot ? (can ? 'rgba(184,121,28,.9)' : 'rgba(180,74,74,.8)') : 'rgba(122,95,168,.35)';
      ctx.lineWidth = 1; ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = hot ? (can ? '#8a5a12' : '#b44a4a') : 'rgba(110,92,140,.7)';
      ctx.font = '700 ' + Math.round(Math.min(13, PAD * 0.52)) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(hot ? c.toLocaleString() + 'G' : '＋', x + w / 2, y + h / 2);
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

  // 送り道は魔力の流れる溝。動いている間だけ芯が明るく、光の粒が流れる
  function drawBelt(b) {
    const pts = b.pts = beltPts(b);
    for (const c of b.cells) {
      const list = at(c.x, c.y).belts;
      if (list.length < 2 || list[list.length - 1] !== b) continue;
      // 渡し橋。下の道を石の橋で覆う
      const d = straightDirAt(b, c.x, c.y) || { x: 1, y: 0 };
      const mx = midX(c.x), my = midY(c.y);
      const ex = d.x * cs * .56, ey = d.y * cs * .56;
      strokePts([{ x: mx - ex, y: my - ey }, { x: mx + ex, y: my + ey }], cs * .78, '#3a2f57');
      strokePts([{ x: mx - ex, y: my - ey }, { x: mx + ex, y: my + ey }], cs * .7, '#241a3a');
    }
    const hot = hoverBelt === b;
    const live = b.moved;
    strokePts(pts, cs * .6, hot ? 'rgba(200,70,90,.45)' : 'rgba(5,3,12,.55)');
    strokePts(pts, cs * .46, hot ? '#4a1e2e' : '#251b3d');
    strokePts(pts, cs * .46, hot ? 'rgba(255,120,140,.25)' : 'rgba(201,168,255,.10)', [1, cs * .5], 0);
    strokePts(pts, cs * .2, hot ? 'rgba(255,140,160,.35)' : (live ? 'rgba(180,140,255,.32)' : 'rgba(150,120,210,.14)'));
    strokePts(pts, cs * .08, hot ? 'rgba(255,200,210,.7)' : (live ? 'rgba(230,214,255,.75)' : 'rgba(200,180,240,.25)'));
    if (live) strokePts(pts, cs * .13, 'rgba(255,240,200,.65)', [cs * .06, cs * .44], -b.flow);
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
      pad(p.x, p.y, r, o.item);
      drawItem(ctx, o.item, p.x, p.y, r);
    }
    b.ghosts.forEach((o) => {
      const p = posAt((n - 1) + alpha);
      ctx.save(); ctx.globalAlpha = 1 - alpha * .6;
      pad(p.x, p.y, r, o.item);
      drawItem(ctx, o.item, p.x, p.y, r);
      ctx.restore();
    });
  }

  // 流れている品の下敷き。品の色で淡く光る玉
  function pad(x, y, r, item) {
    const col = (ITEMS[item] && ITEMS[item].color) || '#c9a8ff';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y, r * 1.9, col, .45);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#1a1430';
    ctx.beginPath(); ctx.arc(x, y, r * 1.12, 0, 7); ctx.fill();
    ctx.strokeStyle = hexA(col, .75);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }

  function drawDrag() {
    const pts = [jointOf(drag.port)];
    drag.cells.forEach((c) => pts.push({ x: midX(c.x), y: midY(c.y) }));
    if (drag.snap) pts.push(jointOf(drag.snap));
    const on = !!drag.snap;
    strokePts(pts, cs * .56, on ? 'rgba(240,196,106,.22)' : 'rgba(201,168,255,.14)');
    strokePts(pts, cs * .3, on ? 'rgba(240,196,106,.45)' : 'rgba(201,168,255,.3)');
    strokePts(pts, cs * .1, on ? '#ffe7a8' : 'rgba(230,214,255,.8)', [cs * .1, cs * .2], -st.flowT / 20);
  }

  function drawPortHints() {
    const t = (Math.sin(st.flowT / 220) + 1) / 2;
    allPorts().forEach((p) => {
      if (!compatible(drag.port, p)) return;
      const j = jointOf(p);
      const snap = p === drag.snap;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, j.x, j.y, cs * (snap ? .6 : .42 + t * .1), snap ? '#f0c46a' : '#b48cff', snap ? .6 : .25 + t * .25);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = snap ? '#ffe2a0' : 'rgba(201,168,255,' + (.5 + t * .45) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(j.x, j.y, cs * (snap ? .34 : .28 + t * .05), 0, 7);
      ctx.stroke();
      ctx.restore();
    });
  }

  // 働いているか。足元の魔法陣の回り方と明るさに使う
  function busy(n) {
    if (!n) return false;
    if (n.k === 'fac') return n.craftT > 0 || !!n.pending;
    if (n.k === 'src') return n.outs[0].buf.length < n.outs[0].cap;
    if (n.k === 'shop') return n.ins[0].buf.length > 0;
    if (n.k === 'store') return n.hold.length > 0;
    return n.ins.some((p) => p.buf.length > 0);
  }

  function nodeBody(def, x, y, rot, lv, n, scale) {
    const skin = SKIN[def.k];
    const mx = midX(x), my = midY(y);
    const s = cs * (scale === undefined ? 1 : scale);
    const t = st.flowT / 1000;
    const on = busy(n);
    const lit = n && n.lit > 0 ? n.lit : 0;

    ctx.save();
    // 足元の光と魔法陣
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, mx, my, s * (.8 + lit * .4), skin.glow, (on ? .28 : .12) + lit * .4);
    ctx.globalCompositeOperation = 'source-over';
    drawSigil(ctx, mx, my, s * .6, t * (on ? .9 : .18) * (def.k === 'fac' ? 1 : -1),
      hexA(skin.glow, on ? .6 : .25), def.k === 'split' || def.k === 'store' ? 'none' : def.k);
    // 石の台座
    const h = s * .4;
    roundRect(ctx, mx - h, my - h, h * 2, h * 2, s * .13);
    const g = ctx.createLinearGradient(mx, my - h, mx, my + h);
    g.addColorStop(0, '#3d3160'); g.addColorStop(1, '#1b1530');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(1.5, s * .045);
    ctx.strokeStyle = lit > .3 ? '#ffe2a0' : (n && sel === n ? '#ffffff' : skin.glow);
    ctx.stroke();
    roundRect(ctx, mx - h + 3, my - h + 3, h * 2 - 6, h * 2 - 6, s * .09);
    ctx.strokeStyle = hexA(skin.glow, .22); ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();

    const meterOn = hexA(skin.glow, .95), meterOff = 'rgba(255,255,255,.12)';
    if (def.k === 'src') {
      iconGlow(def.item, mx, my - s * .07, s * .21);
      drawSpeed(ctx, mx, my + s * .33, s * .5, s * .15, lv + 1, meterOn, meterOff);
    } else if (def.k === 'fac') {
      iconGlow(def.make, mx, my - s * .06, s * .21);
      drawSpeed(ctx, mx, my + s * .33, s * .5, s * .15, lv + 1, meterOn, meterOff);
      if (n && (n.craftT > 0 || n.pending)) {
        const prog = n.pending ? 1 : 1 - n.craftT / n.span;
        ctx.save();
        ctx.strokeStyle = hexA(skin.glow, .25); ctx.lineWidth = Math.max(2, s * .05);
        ctx.beginPath(); ctx.arc(mx, my, s * .47, 0, 7); ctx.stroke();
        ctx.strokeStyle = '#e7d6ff'; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(mx, my, s * .47, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
        ctx.stroke();
        ctx.restore();
      }
    } else if (def.k === 'shop') {
      // 扱う品は繋いだ相手で決まる。繋ぐまでは看板だけ。
      const it = n && n.flow;
      if (it) {
        iconGlow(it, mx, my - s * .14, s * .18);
        ctx.fillStyle = '#ffd98a';
        ctx.font = '700 ' + Math.round(s * .17) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(priceOf(it).toLocaleString() + 'G', mx, my + s * .12);
      } else {
        drawGlyph(ctx, 'shop', mx, my - s * .05, s * .23, true);
      }
      drawSpeed(ctx, mx, my + s * .33, s * .5, s * .15, lv + 1, meterOn, meterOff);
    } else {
      drawGlyph(ctx, def.k, mx, my - (def.k === 'store' ? s * .06 : 0), s * .22, true);
      if (def.k === 'store' && n) {
        ctx.fillStyle = 'rgba(243,213,138,.9)';
        ctx.font = '600 ' + Math.round(s * .16) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(n.hold.length + '/' + def.hold, mx, my + s * .18);
      }
    }
  }

  // 品の絵を、その色の光の上に置く
  function iconGlow(item, x, y, r) {
    const col = (ITEMS[item] && ITEMS[item].color) || '#c9a8ff';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y, r * 1.9, col, .4);
    ctx.restore();
    drawItem(ctx, item, x, y, r);
  }

  function drawNode(n) {
    const age = n.born ? (performance.now() - n.born) / 420 : 1;
    const sc = age < 1 ? Math.max(.2, backOut(Math.max(0, age))) : 1;
    if (sc === 1) n.ins.concat(n.outs).forEach((p) => drawPort(p));
    nodeBody(n.def, n.x, n.y, n.rot, n.lv, n, sc);
    if (sc !== 1 && age >= .6) n.ins.concat(n.outs).forEach((p) => drawPort(p));
  }

  // 口。入口は丸い受け口、出口は菱形の宝石。繋がっていれば光る
  function drawPort(p) {
    const skin = SKIN[p.node.k];
    const j = jointOf(p);
    const s = cs * .19;
    ctx.save();
    ctx.translate(j.x, j.y);
    if (p.belt) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, 0, s * 2.2, skin.glow, .45);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.lineWidth = Math.max(1.5, cs * .04);
    ctx.strokeStyle = skin.glow;
    if (p.io === 'in') {
      ctx.fillStyle = '#1b1530';
      ctx.beginPath(); ctx.arc(0, 0, s, 0, 7); ctx.fill(); ctx.stroke();
      if (p.item) drawItem(ctx, p.item, 0, 0, cs * .11);
      else {
        ctx.fillStyle = p.belt ? skin.glow : hexA(skin.glow, .35);
        ctx.beginPath(); ctx.arc(0, 0, s * .35, 0, 7); ctx.fill();
      }
    } else {
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = p.belt ? skin.glow : '#1b1530';
      ctx.fillRect(-s * .78, -s * .78, s * 1.56, s * 1.56);
      ctx.strokeRect(-s * .78, -s * .78, s * 1.56, s * 1.56);
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.fillRect(-s * .5, -s * .5, s * .45, s * .45);
    }
    ctx.restore();
  }

  function drawGhost() {
    if (!hoverCell) return;
    const ok = free(hoverCell.x, hoverCell.y) && st.money >= placing.def.cost;
    ctx.save();
    ctx.globalAlpha = ok ? .78 : .3;
    nodeBody(placing.def, hoverCell.x, hoverCell.y, placing.rot, 0, null);
    // 仮のポートも描く。どの向きに口が出るか置く前に分かる
    const s = sidesOf(placing.def, null);
    const skin = SKIN[placing.def.k];
    ctx.globalAlpha = ok ? .85 : .25;
    s.in.forEach((side) => ghostPort(side, 'in', skin));
    s.out.forEach((side) => ghostPort(side, 'out', skin));
    ctx.restore();
    if (!ok) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,110,110,.9)'; ctx.lineWidth = 2;
      const px = cellX(hoverCell.x), py = cellY(hoverCell.y);
      ctx.beginPath();
      ctx.moveTo(px + 6, py + 6); ctx.lineTo(px + cs - 6, py + cs - 6);
      ctx.moveTo(px + cs - 6, py + 6); ctx.lineTo(px + 6, py + cs - 6);
      ctx.stroke();
      ctx.restore();
    }
  }

  function ghostPort(side, io, skin) {
    const d = DIRS[(side + placing.rot) & 3];
    const x = midX(hoverCell.x) + d[0] * cs * .5, y = midY(hoverCell.y) + d[1] * cs * .5;
    const s = cs * .19;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = skin.glow; ctx.fillStyle = io === 'out' ? skin.glow : '#1b1530';
    ctx.lineWidth = 2;
    if (io === 'in') { ctx.beginPath(); ctx.arc(0, 0, s, 0, 7); ctx.fill(); ctx.stroke(); }
    else { ctx.rotate(Math.PI / 4); ctx.fillRect(-s * .78, -s * .78, s * 1.56, s * 1.56); }
    ctx.restore();
  }

  function drawMoveGhost() {
    if (!moving.to) return;
    const ok = free(moving.to.x, moving.to.y);
    ctx.save();
    ctx.globalAlpha = ok ? .7 : .25;
    nodeBody(moving.node.def, moving.to.x, moving.to.y, moving.node.rot, moving.node.lv, null);
    ctx.restore();
  }

  // 一度きりの演出
  function drawFx() {
    for (const f of fx) {
      const dur = FX_DUR[f.type], k = f.t / dur;
      const x = midX(f.x), y = midY(f.y);
      ctx.save();
      if (f.type === 'build') {
        // 光の柱が立ち、魔法陣が開き、粒がはじける
        const e = easeOut(Math.min(1, k * 1.6));
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, x, y, cs * (.6 + e * 1.1), f.col, (1 - k) * .7);
        const colW = cs * .5 * (1 - k);
        const cg = ctx.createLinearGradient(x, y - cs * 2.2, x, y);
        cg.addColorStop(0, hexA(f.col, 0)); cg.addColorStop(1, hexA(f.col, .55 * (1 - k)));
        ctx.fillStyle = cg;
        ctx.fillRect(x - colW / 2, y - cs * 2.2, colW, cs * 2.2);
        ctx.globalCompositeOperation = 'source-over';
        drawSigil(ctx, x, y, cs * (.3 + e * .55), k * 4, hexA(f.col, .9 * (1 - k)), f.kind || 'fac');
        ctx.strokeStyle = hexA('#ffe7a8', (1 - k) * .9); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, cs * (.2 + e * 1.1), 0, 7); ctx.stroke();
        for (const p of f.parts) {
          const q = Math.max(0, (k - p.d) / (1 - p.d));
          if (q <= 0) continue;
          const d = cs * (.3 + easeOut(q) * 1.2 * p.v);
          twinkle(ctx, x + Math.cos(p.a) * d, y + Math.sin(p.a) * d - q * cs * .3,
            cs * .09 * p.s * (1 - q), q < .5 ? '#fff4d0' : f.col);
        }
      } else if (f.type === 'level') {
        // 金の粒が昇る
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, x, y, cs * 1.2, '#f0c46a', (1 - k) * .55);
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = hexA('#ffe7a8', 1 - k); ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(x, y, cs * (.45 + k * .6), 0, 7); ctx.stroke();
        for (const p of f.parts) {
          const q = Math.max(0, Math.min(1, (k - p.d) / .7));
          if (q <= 0 || q >= 1) continue;
          twinkle(ctx, x + Math.cos(p.a) * cs * .42 * p.v, y + cs * .3 - q * cs * 1.4 * p.v,
            cs * .1 * p.s * (1 - q * .6), '#ffe08a');
        }
        ctx.fillStyle = hexA('#ffe7a8', 1 - k);
        ctx.font = '800 ' + Math.round(cs * .26) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('Lv UP', x, y - cs * (.6 + k * .5));
      } else if (f.type === 'poof') {
        // ほどけて消える
        for (const p of f.parts) {
          const d = cs * (.1 + easeOut(k) * .9 * p.v);
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = f.col;
          ctx.beginPath();
          ctx.arc(x + Math.cos(p.a) * d, y + Math.sin(p.a) * d - k * cs * .4, cs * .07 * p.s * (1 - k * .5), 0, 7);
          ctx.fill();
        }
      } else if (f.type === 'craft') {
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, x, y, cs * (.5 + k * .4), f.col, (1 - k) * .5);
        for (const p of f.parts) {
          const d = cs * (.35 + easeOut(k) * .45 * p.v);
          twinkle(ctx, x + Math.cos(p.a) * d, y + Math.sin(p.a) * d, cs * .07 * p.s * (1 - k), '#f4e8ff');
        }
      } else if (f.type === 'coin') {
        // 金貨が跳ねる
        f.parts.forEach((p, i) => {
          const q = Math.max(0, Math.min(1, (k - i * .08) / .8));
          if (q <= 0) return;
          const cx = x + (i - 1.5) * cs * .18 + Math.cos(p.a) * cs * .08;
          const cy = y - cs * .3 - Math.sin(q * Math.PI) * cs * .55 - q * cs * .2;
          ctx.globalAlpha = 1 - q * q;
          const w = cs * .1 * Math.abs(Math.cos(q * 9 + p.a));
          ctx.fillStyle = '#f0c46a';
          ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(1, w), cs * .1, 0, 0, 7); ctx.fill();
          ctx.strokeStyle = '#9a6a14'; ctx.lineWidth = 1; ctx.stroke();
        });
      }
      ctx.restore();
    }
  }

  function drawPops() {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    pops.forEach((p) => {
      const f = p.t / 900;
      ctx.globalAlpha = 1 - f * f;
      ctx.font = '800 ' + Math.round(Math.max(11, cs * .27)) + 'px sans-serif';
      const x = midX(p.x), y = midY(p.y) - cs * (.45 + f * .8);
      ctx.strokeStyle = 'rgba(40,24,6,.85)'; ctx.lineWidth = 3;
      ctx.strokeText('+' + p.g + 'G', x, y);
      ctx.fillStyle = '#ffd36a';
      ctx.fillText('+' + p.g + 'G', x, y);
    });
    ctx.restore();
  }

  // ---------------------------------------------------------------- HUD
  let lastMoney = -1;

  // ---------------------------------------------------------------- 所持金のリール
  // 数字ごとに 0〜9 の帯を縦に持ち、増えるときは下から、減るときは上から回して止める。
  // 大きく動いたときは1周余分に回し、左の桁から順に止まる。スロットのリールに見せる。
  // 増えた分は少しまとめてから「+」を浮かせる。売上は細かく続くので、1つずつ出すと読めない。
  const REEL_H = 1.15;      // 1文字の高さ（em）
  const reel = { digits: [], str: '', value: -1, gain: 0, gainT: 0, flashT: 0, coinT: 0, floats: [] };

  function reelBuild(str) {
    const box = el('money');
    box.innerHTML = '';
    const keep = reel.digits.slice().reverse();     // 右から引き継ぐ。桁が増えても下の桁は回り続ける
    reel.digits = [];
    for (const ch of str) {
      if (ch < '0' || ch > '9') {
        const s = document.createElement('span');
        s.className = 'al-comma'; s.textContent = ch;
        box.appendChild(s);
        continue;
      }
      const w = document.createElement('span'); w.className = 'al-reel';
      const strip = document.createElement('span'); strip.className = 'al-strip';
      let h = '';
      for (let k = 0; k < 30; k++) h += '<i>' + (k % 10) + '</i>';
      strip.innerHTML = h;
      w.appendChild(strip);
      box.appendChild(w);
      reel.digits.push({ strip, pos: +ch, goal: +ch, shown: NaN });
    }
    const n = reel.digits.length;
    keep.forEach((d, i) => { if (i < n) { const t = reel.digits[n - 1 - i]; t.pos = d.pos; } });
  }

  function reelSet(v) {
    const str = v.toLocaleString();
    const first = reel.value < 0;
    const dir = v >= reel.value ? 1 : -1;
    const delta = v - reel.value;
    const nd = str.replace(/\D/g, '').length;
    if (str.length !== reel.str.length || nd !== reel.digits.length) reelBuild(str);
    reel.str = str;
    const ds = str.replace(/\D/g, '');
    const big = !first && Math.abs(delta) >= Math.max(100, reel.value * 0.02);
    reel.digits.forEach((d, i) => {
      const want = +ds[i];
      if (first) { d.pos = d.goal = want; return; }
      const cur = ((d.goal % 10) + 10) % 10;
      let dist = dir > 0 ? (want - cur + 10) % 10 : -((cur - want + 10) % 10);
      if (big && dist !== 0) dist += dir * 10;
      d.goal += dist;
      d.rate = 7 + (ds.length - i) * 1.3;          // 左の桁ほど速く止まる
    });
    el('money').setAttribute('aria-label', str + 'G');
    if (!first) {
      const box = el('money');
      box.classList.toggle('up', dir > 0);
      box.classList.toggle('down', dir < 0);
      reel.flashT = 380;
      if (delta > 0) { reel.gain += delta; reel.coinT = 420; }
      else if (delta < 0) reelFloat('-' + (-delta).toLocaleString(), 'down');
    }
    reel.value = v;
  }

  function reelFloat(text, cls) {
    const f = document.createElement('span');
    f.className = 'al-float ' + cls;
    f.textContent = text + 'G';
    el('moneyBox').appendChild(f);
    reel.floats.push({ el: f, t: 0, dir: cls === 'down' ? 1 : -1 });
  }

  function reelStep(dt) {
    for (const d of reel.digits) {
      const diff = d.goal - d.pos;
      if (Math.abs(diff) < 0.003) d.pos = d.goal;
      else d.pos += diff * Math.min(1, dt / 1000 * (d.rate || 9));
      if (d.pos !== d.shown) {
        d.shown = d.pos;
        const p = ((d.pos % 10) + 10) % 10 + 10;
        d.strip.style.transform = 'translateY(' + (-p * REEL_H).toFixed(4) + 'em)';
      }
    }
    if (reel.flashT > 0) {
      reel.flashT -= dt;
      if (reel.flashT <= 0) el('money').classList.remove('up', 'down');
    }
    reel.gainT += dt;
    if (reel.gain > 0 && reel.gainT > 650) { reelFloat('+' + reel.gain.toLocaleString(), 'up'); reel.gain = 0; reel.gainT = 0; }
    // 金貨は増えたときにくるりと回る
    const coin = el('coin');
    if (reel.coinT > 0) {
      reel.coinT -= dt;
      coin.style.transform = 'scaleX(' + Math.cos((1 - Math.max(0, reel.coinT) / 420) * Math.PI * 2).toFixed(3) + ')';
    } else if (coin.style.transform) coin.style.transform = '';
    reel.floats = reel.floats.filter((f) => {
      f.t += dt;
      const k = f.t / 1100;
      f.el.style.transform = 'translateY(' + (f.dir * k * 22).toFixed(1) + 'px)';
      f.el.style.opacity = Math.max(0, 1 - k * k).toFixed(3);
      if (k >= 1) { f.el.remove(); return false; }
      return true;
    });
  }

  function updateHud(dt) {
    reelStep(dt || 16);
    if (st.money !== lastMoney) {
      lastMoney = st.money;
      reelSet(st.money);
      syncMenu();                                // 買えるようになった項目を押せるようにする
      syncResearch();                            // 研究も開いたまま買えるようになる
      syncPalette();                             // 購入パレットの札も色だけ変える
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

  const HINT = '出口から入口へドラッグして送り道を引く　／　右クリックでメニュー　／　ホイールで拡大　／　R キーで回転　／　敷地の外の ＋ で土地を買う';

  // はじめのてびき。案内の行をそのまま使うので、出ても高さは変わらない。
  // 読ませるのではなく、やることを1つずつ出して、やったら次へ進む。
  const TUT = [
    { text: '採取地の右の口から、お店の左の口までドラッグして送り道を引く',
      done: () => st.belts.length > 0 },
    { text: '品がお店に届くと売れる。少し待ってみる',
      done: () => st.total > 0 },
    { text: '右上の「研究」を開いて、いちばん上の「野と海と山」を買う',
      done: () => Object.keys(st.done).length > 0 },
    { text: '下の「錬成」から錬成陣を置いて、採取地 → 錬成陣 → お店 とつなぐ',
      done: () => st.nodes.some((n) => n.k === 'fac' && n.outs[0].belt && n.ins.every((p) => p.belt)) },
    { text: 'ここまでがこのゲームの全部。1回錬成するごとに値が10倍になる',
      done: () => st.total > 2000 },
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
      ? '設置中：' + placing.def.name + '　左クリックで置く　／　右クリックで取り消し　／　R キーで回転'
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
  const GROUPED = { fac: 1 };                // 数が多いタブはランクで分ける
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

  // そのタブがNEWを抱えているか（ランクの札にも点を出す）
  function newIn(tabKey, rank) {
    const keep = tab; tab = tabKey;
    const hit = tabList().some((b) => isNew(b.key) && (rank === undefined || rankOf(b.key) === rank));
    tab = keep;
    return hit;
  }

  // そのタブに出せるもの全部（ランクで絞る前）
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

  // 出せるものがあるランクだけ。無いランクの札は出さない（進むほど札が増える）
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
  let cardEls = [];

  // 札の並びが変わったときだけ作り直す。所持金で変わるのは色だけなので、
  // 作り直すと押している最中に札が差し替わってクリックが成立しなくなる。
  function refreshPalette() {
    const sig = tab + ':' + groupSel[tab] + '|' + groupsOf(tabList()).join('.')
      + '|' + paletteList().map((d) => d.key + defCost(d) + (isNew(d.key) ? 'n' : '')).join(',')
      + '|' + TABS.map((t) => (newIn(t.key) ? 1 : 0)).join('')
      + '|' + (placing ? placing.def.key : '');
    if (sig !== palSig) { palSig = sig; buildPalette(); }
    syncPalette();
  }

  function syncPalette() {
    cardEls.forEach(({ def, d }) => d.classList.toggle('poor', st.money < defCost(def)));
  }

  // 札の説明。とくに錬成陣は「何を入れると何ができるか」が1行では足りない。
  // 言い回しは錬金術のものに寄せる（素材・錬成・出どころ）。
  // 出どころと使い道は、解放済みの採取地と錬成陣だけを数える。
  function madeBy(item) {
    const src = SOURCES.filter((s) => s.item === item && st.unlock[s.key]).map(() => '採取地で採れる');
    const from = RECIPES.filter((r) => r.make === item && st.unlock[r.key])
      .map((r) => r.in.map((i) => ITEMS[i].name).join('＋') + 'から錬成');
    return src.concat(from).join(' ／ ');
  }

  function usedFor(item) {
    const to = RECIPES.filter((r) => r.in.indexOf(item) >= 0 && st.unlock[r.key])
      .map((r) => ITEMS[r.make].name);
    return to.length ? to.join('・') + 'の素材になる' : '';
  }

  function defLines(def) {
    const out = [];
    const rate = (secs, verb) => secs.toFixed(1) + '秒にひとつ' + verb;
    if (def.k === 'fac') {
      out.push(['素材：' + def.in.map((i) => ITEMS[i].name).join(' ＋ '), '']);
      out.push(['錬成：' + ITEMS[def.make].name + '　' + priceOf(def.make).toLocaleString() + 'G', '']);
      out.push([rate(def.secs, '錬成') + '　入口 ' + def.in.length + '／出口 1', 'dim']);
      const seen = {};
      def.in.forEach((i) => {
        if (seen[i]) return;
        seen[i] = 1;
        out.push([ITEMS[i].name + 'の出どころ: ' + (madeBy(i) || 'まだ研究していない'), 'dim']);
      });
      out.push([ITEMS[def.make].name + 'の使い道: ' + (usedFor(def.make) || 'まだ無い（売るだけ）'), 'dim']);
    } else if (def.k === 'src') {
      out.push(['採取：' + ITEMS[def.item].name + '　' + priceOf(def.item).toLocaleString() + 'G', '']);
      out.push([rate(def.secs, '採れる') + '　出口 1', 'dim']);
      out.push([ITEMS[def.item].name + 'の使い道: ' + (usedFor(def.item) || 'まだ無い（売るだけ）'), 'dim']);
    } else if (def.k === 'shop') {
      out.push(['店売り：流れてきた品を、その品の値で売る', '']);
      out.push([rate(def.secs, '捌く') + '　入口 1', 'dim']);
      out.push(['軒数が増えるほど次の1軒は高くなる', 'dim']);
    } else if (def.k === 'split') {
      out.push(['流れてきた品を2つの出口へ交互に分ける', '']);
      out.push(['入口 1／出口 2', 'dim']);
    } else if (def.k === 'store') {
      out.push(['品を' + def.hold + '個まで寝かせておける', '']);
      out.push(['錬成と店売りの速さの差を吸収する', 'dim']);
      out.push(['入口 1／出口 1', 'dim']);
    } else if (def.bridge) {
      out.push(['送り道をまっすぐ1回だけ交差させられる', '']);
      out.push(['いま ' + st.bridges + '本ぶん', 'dim']);
    }
    const c = defCost(def);
    if (st.money < c) out.push(['あと ' + (c - st.money).toLocaleString() + 'G 足りない', 'dim']);
    return out;
  }

  function buildPalette() {
    hideTip();
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
    // 錬成とお店は数が多いので、解放されたランクで分ける。札は同じ行に続けて出す
    if (GROUPED[tab]) {
      const gs = groupsOf(tabList());
      if (gs.length > 1) {
        const sep = document.createElement('span');
        sep.className = 'al-tabsep';
        bar.appendChild(sep);
        gs.forEach((i) => {
          const b = document.createElement('button');
          b.className = 'al-grp' + (groupSel[tab] === i ? ' on' : '');
          b.textContent = TIERS[i].short;
          if (newIn(tab, i)) b.appendChild(dot());
          b.onclick = () => { SND.unlock(); SND.se('ui'); groupSel[tab] = i; refreshPalette(); };
          bar.appendChild(b);
        });
      }
    }

    const box = el('cards');
    box.innerHTML = '';
    cardEls = [];
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
      d.classList.toggle('poor', st.money < defCost(def));
      d.classList.toggle('on', !!placing && placing.def.key === def.key);
      cardEls.push({ def, d });
      d.onmouseenter = () => showTip(d, defLines(def));
      d.onmouseleave = hideTip;
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

  function menuItem(label, on, dis, live) {
    const b = document.createElement('button');
    b.className = 'al-btn';
    b.textContent = label;
    b.disabled = !!dis;
    b.onclick = on;
    b.live = live || null;      // 所持金で変わるものだけ持つ
    el('mItems').appendChild(b);
  }

  // 所持金は売れるたびに動く。そのたびにメニューを作り直すと、
  // 押している最中にボタンが別物に差し替わって、クリックが成立しない。
  // 中身だけ書き換える。
  function syncMenu() {
    if (!menu) return;
    Array.prototype.forEach.call(el('mItems').children, (b) => {
      if (!b.live) return;
      const v = b.live();
      if (v.label !== undefined && b.textContent !== v.label) b.textContent = v.label;
      b.disabled = !!v.dis;
    });
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
        const lvLabel = () => (n.lv >= LEVEL.max - 1
          ? 'レベル最大' : 'レベルアップ ' + lvCost(n).toLocaleString() + 'G');
        menuItem(lvLabel(), () => { levelUp(n); buildMenu(); }, maxed || st.money < lvCost(n),
          () => ({ label: lvLabel(), dis: n.lv >= LEVEL.max - 1 || st.money < lvCost(n) }));
      }
      menuItem('回転（R キーでも回る）', () => { rotate(n); buildMenu(); });
      menuItem('売却 +' + sellBack(n).toLocaleString() + 'G', () => { sellNode(n); closeMenu(); });
    } else if (menu.kind === 'belt') {
      el('mName').textContent = '送り道';
      el('mInfo').textContent = menu.belt.cells.length + 'マス';
      menuItem('撤去', () => { removeBelt(menu.belt); closeMenu(); });
    } else {
      el('mName').textContent = '瓦礫';
      el('mInfo').textContent = '送り道も設備も置けない';
      menuItem('撤去 ' + rockCost().toLocaleString() + 'G',
        () => { breakRock(menu.x, menu.y); closeMenu(); }, st.money < rockCost(),
        () => ({ label: '撤去 ' + rockCost().toLocaleString() + 'G', dis: st.money < rockCost() }));
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
          : locked ? TIERS[r.tier].short + 'から'
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
    // 増えたカードが埋もれないよう、そのランクへ寄せておく
    if (r.unlock) groupSel.fac = r.tier;
    SND.se('research');
    buildResearch();
    buildPalette();
    buildCodex();
    markDots();
    save();
  }

  // ---------------------------------------------------------------- 図鑑
  // 深くなると「これ何に使うのか」が分からなくなる。作り方と使い道を出す。
  // 区切りは錬成の深さではなくランク。研究の並びと同じ順で読めるようにする。
  function itemRank(item) {
    let best = Infinity;
    SOURCES.forEach((s) => { if (s.item === item) best = Math.min(best, rankOf(s.key)); });
    RECIPES.forEach((r) => { if (r.make === item) best = Math.min(best, rankOf(r.key)); });
    return best;
  }

  // 図鑑は作った品が載る。研究で作れるようになっただけの品は、影と作り方だけ見せる。
  function buildCodex() {
    const box = el('codexBody');
    box.innerHTML = '';
    const all = Object.keys(ITEMS).length;
    const got = Object.keys(st.made).filter((k) => ITEMS[k]).length;
    el('codexCount').textContent = '登録 ' + got + ' / ' + all;
    for (let t = 0; t < TIERS.length; t++) {
      const known = Object.keys(ITEMS).filter((k) => itemRank(k) === t && (st.made[k] || producible(k)));
      if (!known.length) continue;
      const sec = document.createElement('div');
      sec.className = 'al-cosec';
      const h = document.createElement('h4');
      const n = known.filter((k) => st.made[k]).length;
      h.innerHTML = '<span>' + TIERS[t].name + '</span><span>' + n + ' / ' + known.length + '</span>';
      sec.appendChild(h);
      known.forEach((k) => {
        const made = !!st.made[k];
        const row = document.createElement('div');
        row.className = 'al-corow' + (made ? '' : ' unknown');
        const c = document.createElement('canvas');
        c.width = 48; c.height = 48; c.style.width = '24px'; c.style.height = '24px';
        const cc = c.getContext('2d'); cc.scale(2, 2);
        drawItem(cc, k, 12, 12, 9);
        if (!made) { cc.globalCompositeOperation = 'source-in'; cc.fillStyle = '#5b4f70'; cc.fillRect(0, 0, 24, 24); }
        row.appendChild(c);
        const from = RECIPES.filter((r) => r.make === k && st.unlock[r.key])
          .map((r) => r.in.map((i) => ITEMS[i].name).join('＋'));
        const src = SOURCES.filter((s) => s.item === k && st.unlock[s.key]).map(() => '採取地');
        const use = RECIPES.filter((r) => r.in.indexOf(k) >= 0 && st.unlock[r.key])
          .map((r) => ITEMS[r.make].name);
        const txt = document.createElement('span');
        txt.innerHTML = made
          ? '<b>' + ITEMS[k].name + '</b><em>' + priceOf(k).toLocaleString() + 'G</em>'
            + (FLAVOR[k] ? '<q>' + FLAVOR[k] + '</q>' : '')
            + '<i>作り方: ' + (src.concat(from).join(' ／ ') || '—') + '</i>'
            + '<i>使い道: ' + (use.join('・') || 'まだ無い（売る）') + '</i>'
          : '<b>？？？</b>'
            + '<i>まだ作っていない。作ると図鑑に載る</i>'
            + '<i>作り方: ' + (src.concat(from).join(' ／ ') || '—') + '</i>';
        row.appendChild(txt);
        sec.appendChild(row);
      });
      box.appendChild(sec);
    }
  }

  // 勇者の帯に、いまの話とランクを渡す
  function heroSync() {
    if (!window.HERO) return;
    const n = LOG.hero.filter((h) => st.log[h.key]).length;
    const ch = Math.max(0, n - 1);
    HERO.set({ chapter: ch, tier: st.tier });
    el('heroCap').textContent = '勇者の歩み　第' + (ch + 1) + '話　' + LOG.hero[ch].text;
  }

  // 古い保存には作った記録が無い。売ったことのある品と、その材料をさかのぼって作ったことにする
  function madeFromSold(sold) {
    const made = {};
    const mark = (k) => {
      if (made[k] || !ITEMS[k]) return;
      made[k] = 1;
      RECIPES.filter((r) => r.make === k).slice(0, 1).forEach((r) => r.in.forEach(mark));
    };
    Object.keys(sold || {}).forEach(mark);
    return made;
  }

  // ---------------------------------------------------------------- 図鑑に載った
  // 初めて作った品は、画面の真ん中に札を出して紙吹雪で祝う。続けて作れたら順番に出す。
  // タイトルが出ている間は待たせる（裏で盤面が動いているので、遊ぶ前に作ってしまう）。
  const disc = { queue: [], cur: null, t: 0 };
  const DISC_IN = 320, DISC_HOLD = 2600, DISC_OUT = 320;
  let confetti = [];

  function discover(item) {
    if (!item || st.made[item]) return;
    st.made[item] = 1;
    disc.queue.push(item);
    markDots();
    save();
  }

  function discOpen(item) {
    disc.cur = item; disc.t = 0;
    const it = ITEMS[item];
    el('discName').textContent = it.name;
    el('discFlavor').textContent = FLAVOR[item] || '';
    el('discMeta').textContent = TIERS[Math.min(TIERS.length - 1, Math.max(0, itemRank(item)))].short + 'の品　／　売値 ' + priceOf(item).toLocaleString() + 'G';
    const got = Object.keys(st.made).length;
    el('discCount').textContent = '図鑑 ' + got + ' / ' + Object.keys(ITEMS).length;
    el('discover').hidden = false;
    el('discCard').style.visibility = 'visible';
    SND.se('discover');
    burstConfetti(it.color);
  }

  function discClose() { disc.t = Math.max(disc.t, DISC_IN + DISC_HOLD); }

  function discStep(dt) {
    if (!disc.cur) {
      if (disc.queue.length && el('ovTitle').hidden) discOpen(disc.queue.shift());
    } else {
      disc.t += dt;
      const card = el('discCard');
      let sc = 1, op = 1;
      if (disc.t < DISC_IN) { const k = disc.t / DISC_IN; sc = .55 + .45 * backOut(k); op = Math.min(1, k * 2); }
      else if (disc.t > DISC_IN + DISC_HOLD) { const k = Math.min(1, (disc.t - DISC_IN - DISC_HOLD) / DISC_OUT); sc = 1 + k * .06; op = 1 - k; }
      card.style.transform = 'scale(' + sc.toFixed(3) + ')';
      card.style.opacity = op.toFixed(3);
      drawDiscIcon();
      if (disc.t >= DISC_IN + DISC_HOLD + DISC_OUT) {
        disc.cur = null;
        card.style.visibility = 'hidden';          // 透明のまま残すと真ん中のクリックを奪う
        el('discover').hidden = !confetti.length;
      }
    }
    stepConfetti(dt);
  }

  // 札の絵。後ろで光の筋がゆっくり回る
  function drawDiscIcon() {
    const c = el('discIcon');
    const dpr = window.devicePixelRatio || 1;
    const S = 110;
    if (c.width !== Math.round(S * dpr)) { c.width = Math.round(S * dpr); c.height = Math.round(S * dpr); }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, S, S);
    const col = ITEMS[disc.cur].color;
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate(disc.t / 2600);
    for (let i = 0; i < 12; i++) {
      g.rotate(Math.PI / 6);
      g.fillStyle = i % 2 ? hexA('#f0c46a', .22) : hexA(col, .2);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-7, -S / 2); g.lineTo(7, -S / 2); g.closePath(); g.fill();
    }
    g.restore();
    glow(g, S / 2, S / 2, S * .38, col, .55);
    drawItem(g, disc.cur, S / 2, S / 2, S * .24);
  }

  // 紙吹雪。真ん中から上へはじけ、左右の下からも打ち上げる。重力で落ちながら回る
  function burstConfetti(col) {
    const W = window.innerWidth, H = window.innerHeight;
    const cols = ['#f0c46a', '#b994ff', '#6fd3ff', '#ff8fb1', '#7cf0c0', col];
    const add = (x, y, a0, spread, n, sp) => {
      for (let i = 0; i < n; i++) {
        const a = a0 + (Math.random() - .5) * spread, v = sp * (.55 + Math.random() * .6);
        confetti.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6.3, vr: (Math.random() - .5) * 14,
          f: Math.random() * 6.3, vf: 6 + Math.random() * 10, w: 5 + Math.random() * 5, h: 8 + Math.random() * 7,
          col: cols[(Math.random() * cols.length) | 0], t: 0, life: 2600 + Math.random() * 1200, star: Math.random() < .18 });
      }
    };
    add(W / 2, H * .46, -Math.PI / 2, Math.PI * 1.3, 70, 900);
    add(-10, H * .95, -Math.PI / 3, .55, 45, 1250);
    add(W + 10, H * .95, -Math.PI * 2 / 3, .55, 45, 1250);
    if (confetti.length > 400) confetti.splice(0, confetti.length - 400);
  }

  function stepConfetti(dt) {
    const c = el('confetti');
    if (!confetti.length) { if (c.width) { c.width = 0; c.height = 0; } return; }
    const W = window.innerWidth, H = window.innerHeight, dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const k = dt / 1000;
    confetti = confetti.filter((p) => {
      p.t += dt;
      p.vy += 1500 * k;
      p.vx *= Math.pow(.35, k); p.vy *= Math.pow(.5, k);
      p.vy = Math.min(p.vy, 260);
      p.vx += Math.sin(p.f) * 30 * k;
      p.x += p.vx * k; p.y += p.vy * k;
      p.r += p.vr * k; p.f += p.vf * k;
      const a = Math.min(1, (p.life - p.t) / 500);
      if (a <= 0 || p.y > H + 30) return false;
      g.save();
      g.globalAlpha = a;
      g.translate(p.x, p.y); g.rotate(p.r);
      g.fillStyle = p.col;
      if (p.star) twinkle(g, 0, 0, p.w * .9, p.col);
      else { g.scale(1, Math.cos(p.f)); g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
      g.restore();
      return true;
    });
    if (!confetti.length && !disc.cur) el('discover').hidden = true;
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
    if (!TIERS[st.tier + 1]) el('btnNewsEnd').hidden = false;
  }

  // ---------------------------------------------------------------- 世界一の看板
  function showCert() {
    SND.bgm('end');
    const top = Object.keys(st.sold).sort((a, b) => st.sold[b] - st.sold[a])[0];
    el('certBody').innerHTML =
      '<dl>'
      + '<dt>ランク</dt><dd>' + TIERS[TIERS.length - 1].name + '</dd>'
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

  function snapshot() {
    const pi = new Map();
    st.nodes.forEach((n, i) => {
      n.ins.forEach((p, j) => pi.set(p, [i, 'i', j]));
      n.outs.forEach((p, j) => pi.set(p, [i, 'o', j]));
    });
    return {
      v: SAVE_VER,
      w: st.w, h: st.h, money: st.money, total: st.total, tier: st.tier,
      landBuys: st.landBuys, rockBuys: st.rockBuys, bridges: st.bridges,
      done: st.done, sold: st.sold, log: st.log, seen: st.seen, tut: st.tut, made: st.made,
      rocks: st.cell.map((c, i) => (c.rock ? i : -1)).filter((i) => i >= 0),
      nodes: st.nodes.map((n) => ({ d: n.def.key, x: n.x, y: n.y, r: n.rot, l: n.lv })),
      belts: st.belts.map((b) => ({ f: pi.get(b.from), t: pi.get(b.to), c: b.cells.map((c) => [c.x, c.y]) })),
    };
  }

  function writeSave() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot()));
    } catch (e) { /* file:// で弾かれても遊べる */ }
  }

  function load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return false; }
    return restore(raw);
  }

  function restore(raw) {
    zoom = 1; focusX = -1; focusY = -1;
    if (!raw || !raw.nodes) return false;
    st = blank();
    st.w = raw.w; st.h = raw.h;
    st.cell = makeCells(st.w, st.h);
    (raw.rocks || []).forEach((i) => { if (st.cell[i]) st.cell[i].rock = true; });
    st.money = raw.money; st.total = raw.total;
    st.landBuys = raw.landBuys || 0; st.rockBuys = raw.rockBuys || 0; st.bridges = raw.bridges || 0;
    // ランクは保存された番号ではなく累計売上から数え直す。
    // ランクの表が増えても、古い保存が別のランクに着地しない。
    st.tier = 0;
    while (TIERS[st.tier + 1] && st.total >= TIERS[st.tier + 1].need) st.tier++;
    st.done = raw.done || {}; st.sold = raw.sold || {}; st.log = raw.log || {}; st.seen = raw.seen || {};
    st.tut = raw.tut === undefined ? -1 : raw.tut;
    st.made = raw.made || madeFromSold(st.sold);
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
    zoom = 1; focusX = -1; focusY = -1;
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

  // 続きがあるときは、その盤面を裏に出したまま「つづきから」を見せる。
  // 数日またいで開くゲームなので、黙って復元されると続きなのか分からない。
  function showTitle(resume) {
    el('btnStart').textContent = resume ? 'つづきから' : 'はじめる';
    el('btnTitleNew').hidden = !resume;
    el('titleNote').textContent = resume
      ? TIERS[st.tier].name + '　累計売上 ' + Math.round(st.total).toLocaleString() + 'G'
      : '';
    el('ovTitle').hidden = false;
  }

  function startFresh() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    reset(); layout(); buildPalette(); buildResearch(); buildCodex(); markDots(); closeMenu(); heroSync();
  }

  function init() {
    const resumed = load();
    if (!resumed) reset();
    layout();
    buildPalette();
    buildResearch();
    buildCodex();
    markDots();

    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });   // 中ボタンの自動スクロールを止める
    window.addEventListener('keydown', onKey);
    if (window.HERO) { HERO.attach(el('heroCv')); heroSync(); }
    el('discCard').addEventListener('click', discClose);

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

    overlay('res', 'btnRes', 'btnResClose', () => { seeThese(resKeys()); buildResearch(); });
    overlay('help', 'btnHelp', 'btnHelpClose');
    overlay('ovOpt', 'btnOpt', 'btnOptClose', syncSound);
    el('btnTut').onclick = () => { st.tut = 0; save(); updateHint(); el('help').hidden = true; };
    overlay('log', 'btnLog', 'btnLogClose', buildLog);
    overlay('codex', 'btnCodex', 'btnCodexClose', () => { seeThese(codexKeys()); buildCodex(); });
    overlay('cert', null, 'btnCertClose');
    el('btnCertClose').addEventListener('click', () => SND.bgm(st.boom ? 'boom' : 'play'));
    el('btnNewsClose').onclick = () => { SND.se('ui'); el('news').hidden = true; };
    el('btnNewsEnd').onclick = () => { el('news').hidden = true; showCert(); };

    el('btnExport').onclick = () => { SND.se('ui'); exportSave(); };
    el('btnImport').onclick = () => { SND.se('ui'); el('fileSave').click(); };
    el('fileSave').onchange = (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) importSave(f);
    };

    el('btnReset').onclick = () => {
      if (!confirm('最初からやり直します。よろしいですか？')) return;
      startFresh();
      el('ovOpt').hidden = true;
    };

    el('btnStart').onclick = () => {
      SND.unlock(); SND.se('ui');
      el('ovTitle').hidden = true;
      SND.bgm('play');
    };
    el('btnTitleNew').onclick = () => {
      SND.unlock(); SND.se('ui');
      if (!confirm('最初からやり直します。いまの盤面は消えます。よろしいですか？')) return;
      startFresh();
      el('ovTitle').hidden = true;
      SND.bgm('play');
    };
    showTitle(resumed);

    setupSound();
    setInterval(refreshPalette, 600);   // 買えるようになったカードを光らせる
    requestAnimationFrame(frame);
  }

  // 盤面の中身をブラウザから覗くための口。動作確認に使う
  window.__cl = {
    st: () => st,
    view: () => ({ zoom, cs, ox, oy, fitCs, focusX, focusY, VW, VH }),
    hero: () => (window.HERO ? HERO.state() : null),
    disc: () => ({ cur: disc.cur, queue: disc.queue.slice(), t: disc.t, confetti: confetti.length, made: Object.keys(st.made) }),
    discover: (k) => discover(k),
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

  // ---------------------------------------------------------------- 控え
  // 数日かけて遊ぶので、localStorage 1枚に預けたままにしない。
  // ブラウザのデータを消すと盤面ごと消えるため、ファイルに出せるようにしておく。
  let noteT = 0;
  function note(text) {
    const e = el('saveNote');
    e.textContent = text;
    e.hidden = false;
    clearTimeout(noteT);
    noteT = setTimeout(() => { e.hidden = true; }, 6000);
  }

  function exportSave() {
    writeSave();
    const d = new Date();
    const stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      + '-' + String(d.getDate()).padStart(2, '0');
    const name = '錬金工場_' + TIERS[st.tier].name + '_' + stamp + '.txt';
    const blob = new Blob([JSON.stringify(snapshot())], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    note('控えを書き出しました。' + name);
  }

  function importSave(file) {
    const fr = new FileReader();
    fr.onload = () => {
      let raw = null;
      try { raw = JSON.parse(fr.result); } catch (e) { raw = null; }
      if (!raw || !raw.nodes) { alert('この控えは読めませんでした。'); return; }
      const name = (TIERS[raw.tier || 0] || TIERS[0]).name;
      if (!confirm('「' + name + '／累計 ' + Math.round(raw.total || 0).toLocaleString()
        + 'G」を読み込みます。\n\nいま遊んでいる盤面は消えます。よろしいですか？')) return;
      if (!restore(raw)) { alert('この控えは読めませんでした。'); return; }
      writeSave();
      layout(); buildPalette(); buildResearch(); buildCodex(); markDots(); closeMenu(); heroSync();
      SND.se('levelup');
      note('控えを読み込みました。' + name);
    };
    fr.readAsText(file);
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
