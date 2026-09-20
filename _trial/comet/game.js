// コリジョン・シューティングスター（試作）
// 確かめたいのは3つ。
//   1. 慣性でマウスを追う手触り。助走してから当てにいく動きが自然に出るか
//   2. 尾の長さ＝速度＝破壊力が、説明なしで伝わるか
//   3. 強くなるほど曲がれなくなる、が気持ちよさとして成立するか

(() => {
'use strict';

// ============ 調整値。触るのはここだけ ============
const W = 1280, H = 720;
const TICK = 1 / 60;

const C = {
  ACC: 0.42,        // マウスへの加速度（質量で割られる）
  ACC_EXP: 0.35,    // 質量が増えるほど鈍る強さ
  DRAG: 0.9925,     // 空間の減衰。弱いほど慣性が強い
  VMAX: 15,         // 速度上限
  NEAR: 70,         // これより近いと加速を弱める（マウス上で震えないように）
  M0: 12,           // 開始質量
  MDEAD: 7,         // これを下回るとゲームオーバー
  WALL: 0.94,       // 壁の反発

  SOFT: 3.2,        // 相対速度がこれ未満なら弾かれるだけ
  TOUGH: 5.5,      // 隕石の素の硬さ。大きいほど助走が要る
  GUARD: 2.2,      // 彗星の素の硬さ。小さいほど止まっていると危ない
  // 判定幅は左右で変える。助走が決まればちゃんと砕け、
  // 削られるのは本当に止まっているときだけ、という非対称にする
  BREAK: 1.10,      // 砕く側。小さいほど砕きやすい
  HURT: 1.45,       // 削られる側。大きいほど削られにくい
  AGGR: 0.75,       // 隕石の攻め側の弱め。仕掛けるのはこちら、という形にする

  PULL_R: 130,      // 欠片を吸う距離
  PULL_A: 0.55,
  GAIN: 0.75,       // 1体砕いたときの基本の取り分。質量の平方根で増える。
                    // 隕石の質量にそのまま比例させると雪だるまになり、速度が意味を失う
  DROP: 0.78,       // 削られた分のうち拾い直せる割合
  CAP: 1.35,        // 隕石の質量の上限（彗星の何倍まで）。
                    // 超えると速度上限を出しても砕けず、ただの壁になる
  SCALE: 0.80,      // 隕石の大きさが彗星に追いつく強さ。1 で完全に追随＝成長の実感が消え、
                    // 0 に近いほど終盤が作業になる。少しだけ楽になる程度に置く

  BURN: 4.2,        // 燃焼の秒数
  BURN_VMAX: 22,

  METEOR_MIN: 11, METEOR_MAX: 19, METEOR_WARN: 1.15, METEOR_RUN: 1.5,
};

// 核はゆっくりしか育てない。育ちすぎると「助走しないと砕けない」が消える
const LV = [12, 14.5, 17, 20, 23.5, 27, 31, 35.5, 40, 45, 51];

const BOSSES = [
  { name: '水星', r: 62,  hp: 100, moons: 2, spin: 1.15, arc: 1.10, bands: 0, ring: false,
    col: { hi:'#f6dcab', mid:'#c99a4f', lo:'#6b4820', glow:'#ffcf80' } },
  { name: '土星', r: 88,  hp: 165, moons: 3, spin: 0.70, arc: 1.25, bands: 3, ring: true,
    col: { hi:'#ffdcad', mid:'#e0a25f', lo:'#87532a', glow:'#ffbe7a', ring:'rgba(236,211,176,.8)' } },
  { name: '木星', r: 114, hp: 250, moons: 4, spin: 0.40, arc: 1.40, bands: 5, ring: false,
    col: { hi:'#ffe6c8', mid:'#d98f57', lo:'#7a3d20', glow:'#ffb070' } },
];

// 宙域の差は mix（氷・金属の比率）とボスで出す。
// mul を大きくすると、彗星の育ちに対して隕石が先に重くなり、砕けない壁になる
const WAVES = [
  { goal: 10, max: 9,  mul: 1.00, mix: { rock: .70, ice: .30, metal: 0 } },
  { goal: 13, max: 11, mul: 1.10, mix: { rock: .48, ice: .27, metal: .25 } },
  { goal: 16, max: 12, mul: 1.20, mix: { rock: .38, ice: .30, metal: .32 } },
];

const GROWTH = [
  { id:'core',  n:'核を固く', d:'削られにくい。さらに重くなる' },
  { id:'tail',  n:'尾を長く', d:'同じ速度でも運動量が乗る' },
  { id:'pull',  n:'引力',    d:'欠片を遠くから吸う。追従が鋭くなる' },
  { id:'split', n:'分裂',    d:'砕くと周りにも衝撃。核が一回り小さくなる' },
];

// ============ 補助 ============
const cv = document.getElementById('cv');
const g = cv.getContext('2d');
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
function angDiff(a, b) { let d = (a - b) % 6.2832; if (d > 3.1416) d -= 6.2832; if (d < -3.1416) d += 6.2832; return d; }

let view = { s: 1, ox: 0, oy: 0 };
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = cv.clientWidth, ch = cv.clientHeight;
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  const s = Math.min(cw / W, ch / H);
  view = { s, ox: (cw - W * s) / 2, oy: (ch - H * s) / 2, dpr };
}
window.addEventListener('resize', resize);

// ============ 状態 ============
let S;
function reset(full) {
  S = {
    mode: full ? 'title' : 'field',
    wave: 0, kills: 0,
    comet: {
      x: W / 2, y: H / 2, vx: 0, vy: 0, m: C.M0, r: 0,
      trail: [], burn: 0, hard: 1, tail: 1, pull: 1, split: 0, acc: 1, vmax: 1,
      hurt: 0, inv: 0,
    },
    enemies: [], shards: [], debris: [], flashes: [], sparks: [],
    boss: null, meteor: null, meteorT: rnd(C.METEOR_MIN, C.METEOR_MAX),
    scrollX: 0, scrollY: 0, shake: 0, hitStop: 0, t: 0,
    lv: 1, best: 0, banner: null, bannerT: 0,
    ai: { phase: 'run', target: null, tx: W / 2, ty: H / 2 },
  };
  S.comet.r = radOf(S.comet.m);
  fillField();
}
const radOf = m => Math.sqrt(m) * 3.05;

function levelOf(m) { let l = 1; for (let i = 0; i < LV.length; i++) if (m >= LV[i]) l = i + 1; return l; }

// ============ 入力 ============
const mouse = { x: W / 2, y: H / 2, has: false };
cv.addEventListener('pointermove', e => {
  const b = cv.getBoundingClientRect();
  mouse.x = clamp((e.clientX - b.left - view.ox) / view.s, 0, W);
  mouse.y = clamp((e.clientY - b.top - view.oy) / view.s, 0, H);
  mouse.has = true;
});

// ============ 生成 ============
function shapeOf() {
  const n = 9 + ((Math.random() * 4) | 0), a = [];
  for (let i = 0; i < n; i++) a.push(0.78 + Math.random() * 0.34);
  return a;
}

function kindByMix(mix) {
  const r = Math.random(); let acc = 0;
  for (const k in mix) { acc += mix[k]; if (r < acc) return k; }
  return 'rock';
}

function makeRock(kind, x, y, mul) {
  let m, hp = 1;
  if (kind === 'ice') m = rnd(5, 13);
  else if (kind === 'metal') { m = rnd(12, 20); hp = 2; }
  else m = rnd(7, 17);
  // 宙域の倍率 × 彗星の育ち具合。育つほど隕石も大きくなる
  const cm = S ? S.comet.m : C.M0;
  m *= (mul || 1) * Math.pow(cm / C.M0, C.SCALE);
  // 速度上限を出しても砕けない隕石は作らない。壁になって手が止まる
  m = Math.min(m, cm * C.CAP);
  const sp = kind === 'ice' ? rnd(1.6, 3.4) : rnd(0.5, 1.7);
  const a = rnd(0, 6.2832);
  return {
    x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
    m, r: radOf(m) * 1.02, kind, hp, hpMax: hp,
    rot: rnd(0, 6.2832), spin: rnd(-1.4, 1.4), shape: shapeOf(),
    aggro: rnd(0.05, 0.13) * (kind === 'ice' ? 1.5 : 1),
    cool: 0,
    orb: null,
  };
}

// 彗星から離れた位置に湧かせる。真横に出現して即衝突、をさせない
function spawnPos() {
  const c = S.comet;
  for (let i = 0; i < 24; i++) {
    const x = rnd(60, W - 60), y = rnd(60, H - 60);
    if (Math.hypot(x - c.x, y - c.y) > 300) return { x, y };
  }
  return { x: rnd(60, W - 60), y: rnd(60, H - 60) };
}

function fillField() {
  const w = WAVES[Math.min(S.wave, WAVES.length - 1)];
  while (S.enemies.filter(e => !e.orb).length < w.max) {
    const p = spawnPos();
    S.enemies.push(makeRock(kindByMix(w.mix), p.x, p.y, w.mul));
  }
}

function spawnShards(x, y, vx, vy, total, kind) {
  const n = clamp(Math.round(total * 1.6), 3, 9);
  for (let i = 0; i < n; i++) {
    const a = rnd(0, 6.2832), sp = rnd(1.2, 4.2);
    S.shards.push({
      x, y, vx: vx * 0.3 + Math.cos(a) * sp, vy: vy * 0.3 + Math.sin(a) * sp,
      val: total / n, r: clamp(2.0 + total * 1.2, 2.0, 4.6),
      kind, ph: rnd(0, 6.2832), life: 15,
    });
  }
}

function spawnDebris(x, y, r, kind, n) {
  const col = kind === 'ice' ? '#8fd6f2' : kind === 'metal' ? '#98a4b2' : '#7a5b45';
  for (let i = 0; i < n; i++) {
    const a = rnd(0, 6.2832), sp = rnd(1.5, 6);
    S.debris.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: rnd(r * 0.10, r * 0.26), rot: rnd(0, 6.2832), spin: rnd(-8, 8),
      col, life: rnd(0.5, 1.1), max: 1.1 });
  }
}

function flash(x, y, r, col) { S.flashes.push({ x, y, r, col, life: 1, max: 1 }); }

function startMeteor() {
  const edge = (Math.random() * 4) | 0;
  let x0, y0;
  if (edge === 0) { x0 = rnd(0, W); y0 = -40; }
  else if (edge === 1) { x0 = W + 40; y0 = rnd(0, H); }
  else if (edge === 2) { x0 = rnd(0, W); y0 = H + 40; }
  else { x0 = -40; y0 = rnd(0, H); }
  // 盤面の中ほどを通す。端をかすめるだけの流星にしない
  const tx = rnd(W * 0.25, W * 0.75), ty = rnd(H * 0.25, H * 0.75);
  const dx = tx - x0, dy = ty - y0, L = Math.hypot(dx, dy);
  const ex = x0 + dx / L * 2200, ey = y0 + dy / L * 2200;
  S.meteor = { st: 'warn', t: 0, x0, y0, x1: ex, y1: ey, x: x0, y: y0, px: x0, py: y0, r: 17 };
  Snd.play('warn');
}

function startBoss() {
  const def = BOSSES[Math.min(S.wave, BOSSES.length - 1)];
  const c = S.comet;
  let bx = c.x < W / 2 ? W - 180 : 180;
  const b = {
    def, x: bx, y: H / 2, vx: 0, vy: 0, r: def.r, m: 900,
    face: rnd(0, 6.2832), spin: def.spin, arc: 3.1416,
    hp: def.hp, hpMax: def.hp, col: def.col, bands: def.bands, ring: def.ring,
    mood: 'normal', aura: 0, shieldFlash: 0,
    st: 'idle', t: 2.2, dead: 0, moons: def.moons,
  };
  S.boss = b;
  for (let i = 0; i < def.moons; i++) {
    const m = makeRock('metal', b.x, b.y);
    // 剥がすのに要る速度が宙域ごとに少しずつ上がるよう、彗星の質量に対して決める
    m.m = c.m * (0.95 + S.wave * 0.08); m.r = radOf(m.m) * 1.02;
    m.hp = 1; m.hpMax = 1; m.moon = true;
    m.orb = { ang: i / def.moons * 6.2832, rad: b.r * 1.85 + i * 14, spd: 1.00 - S.wave * 0.08 };
    S.enemies.push(m);
  }
  S.mode = 'boss';
  banner(def.name + ' が来た', '衛星を剥がしてから、目の反対側を突く');
  Snd.play('bossin');
}

function banner(a, b) { S.banner = [a, b]; S.bannerT = 3.4; }

// ============ 物理 ============
function step(dt) {
  S.t += dt;
  if (S.hitStop > 0) { S.hitStop -= dt; return; }

  const c = S.comet;

  // --- 彗星 ---
  let tx = mouse.x, ty = mouse.y;
  if (S.mode === 'title') { autoPilot(dt); tx = S.ai.tx; ty = S.ai.ty; }

  const dx = tx - c.x, dy = ty - c.y;
  const d = Math.hypot(dx, dy) || 1;
  const near = Math.min(1, d / C.NEAR);
  const accel = C.ACC * Math.pow(C.M0 / c.m, C.ACC_EXP) * c.acc;
  c.vx += dx / d * accel * near * (dt / TICK);
  c.vy += dy / d * accel * near * (dt / TICK);

  const drag = Math.pow(C.DRAG, dt / TICK);
  c.vx *= drag; c.vy *= drag;

  const vmax = (c.burn > 0 ? C.BURN_VMAX : C.VMAX) * c.vmax;
  let sp = Math.hypot(c.vx, c.vy);
  if (sp > vmax) { c.vx *= vmax / sp; c.vy *= vmax / sp; sp = vmax; }

  const pxc = c.x, pyc = c.y;
  c.x += c.vx * (dt / TICK); c.y += c.vy * (dt / TICK);
  bounceWall(c);

  c.r = radOf(c.m);
  c.trail.push({ x: c.x, y: c.y });
  if (c.trail.length > 70) c.trail.shift();

  S.scrollX += c.vx * (dt / TICK) * 0.55;
  S.scrollY += c.vy * (dt / TICK) * 0.55;

  if (c.burn > 0) {
    c.burn -= dt;
    if (c.burn <= 0) { c.burn = 0; Snd.play('burnout'); }
    if (Math.random() < 0.7) S.sparks.push({
      x: c.x + rnd(-c.r, c.r), y: c.y + rnd(-c.r, c.r),
      vx: -c.vx * 0.3 + rnd(-1, 1), vy: -c.vy * 0.3 + rnd(-1, 1),
      r: rnd(1.5, 3.5), col: pick(['#ffd27a', '#fff0c0', '#ff9a4a']), life: 0.5, max: 0.5,
    });
  }
  if (c.hurt > 0) c.hurt -= dt;
  if (c.inv > 0) c.inv -= dt;
  Snd.trail(clamp(sp / C.VMAX, 0, 1));

  // --- ボス ---
  if (S.boss) bossStep(S.boss, dt);

  // --- 隕石 ---
  for (const e of S.enemies) {
    if (e.orb && S.boss) {
      e.orb.ang += e.orb.spd * dt;
      const b = S.boss;
      const nx = b.x + Math.cos(e.orb.ang) * e.orb.rad;
      const ny = b.y + Math.sin(e.orb.ang) * e.orb.rad;
      e.vx = (nx - e.x) / (dt / TICK); e.vy = (ny - e.y) / (dt / TICK);
      e.x = nx; e.y = ny;
    } else {
      // 彗星の方へゆっくり向きを変える。敵も慣性なので行き過ぎる
      const ex = c.x - e.x, ey = c.y - e.y, ed = Math.hypot(ex, ey) || 1;
      if (ed < 560) {
        e.vx += ex / ed * e.aggro * (dt / TICK);
        e.vy += ey / ed * e.aggro * (dt / TICK);
      }
      const es = Math.hypot(e.vx, e.vy), emax = e.kind === 'ice' ? 7 : 5;
      if (es > emax) { e.vx *= emax / es; e.vy *= emax / es; }
      e.vx *= Math.pow(0.9975, dt / TICK); e.vy *= Math.pow(0.9975, dt / TICK);
      e.x += e.vx * (dt / TICK); e.y += e.vy * (dt / TICK);
      bounceWall(e);
    }
    e.rot += e.spin * dt;
    if (e.cool > 0) e.cool -= dt;
  }

  // --- 隕石どうし ---
  for (let i = 0; i < S.enemies.length; i++) {
    for (let j = i + 1; j < S.enemies.length; j++) {
      const a = S.enemies[i], b2 = S.enemies[j];
      if (a.orb && b2.orb) continue;
      const dx2 = b2.x - a.x, dy2 = b2.y - a.y, dd = Math.hypot(dx2, dy2);
      const rr = a.r + b2.r;
      if (dd > rr || dd === 0) continue;
      const nx = dx2 / dd, ny = dy2 / dd;
      if (!a.orb && !b2.orb) {
        const push = (rr - dd) / 2;
        a.x -= nx * push; a.y -= ny * push; b2.x += nx * push; b2.y += ny * push;
        const rel = (b2.vx - a.vx) * nx + (b2.vy - a.vy) * ny;
        if (rel < 0) {
          const imp = -1.7 * rel / (1 / a.m + 1 / b2.m);
          a.vx -= imp * nx / a.m; a.vy -= imp * ny / a.m;
          b2.vx += imp * nx / b2.m; b2.vy += imp * ny / b2.m;
        }
      }
    }
  }

  // --- 彗星 × 隕石（線分で判定。速いとすり抜けるため）---
  for (let i = S.enemies.length - 1; i >= 0; i--) {
    const e = S.enemies[i];
    if (e.cool > 0) continue;
    if (!sweepHit(pxc, pyc, c.x, c.y, c.r, e)) continue;
    e.cool = 0.30;
    resolveHit(c, e, i);
  }

  // --- 彗星 × ボス ---
  if (S.boss && !S.boss.dead) bossHit(c, S.boss, pxc, pyc);

  // --- 流星 ---
  meteorStep(dt);

  // --- 欠片 ---
  for (let i = S.shards.length - 1; i >= 0; i--) {
    const s = S.shards[i];
    const sx = c.x - s.x, sy = c.y - s.y, sd = Math.hypot(sx, sy) || 1;
    const R = C.PULL_R * c.pull + c.r;
    if (sd < R) {
      const k = 1 - sd / R;
      s.vx += sx / sd * C.PULL_A * (0.4 + k * 2.2) * (dt / TICK);
      s.vy += sy / sd * C.PULL_A * (0.4 + k * 2.2) * (dt / TICK);
    }
    s.vx *= Math.pow(0.985, dt / TICK); s.vy *= Math.pow(0.985, dt / TICK);
    s.x += s.vx * (dt / TICK); s.y += s.vy * (dt / TICK);
    s.life -= dt;
    if (sd < c.r + s.r + 4) {
      c.m += s.val; S.shards.splice(i, 1); Snd.play('pick');
      const nl = levelOf(c.m);
      if (nl > S.lv) { S.lv = nl; Snd.play('level'); flash(c.x, c.y, c.r * 3, 'rgba(180,235,255,.9)'); }
      continue;
    }
    if (s.life <= 0) S.shards.splice(i, 1);
  }

  // --- 粒 ---
  for (let i = S.debris.length - 1; i >= 0; i--) {
    const d2 = S.debris[i];
    d2.x += d2.vx * (dt / TICK); d2.y += d2.vy * (dt / TICK);
    d2.vx *= 0.985; d2.vy *= 0.985; d2.rot += d2.spin * dt; d2.life -= dt;
    if (d2.life <= 0) S.debris.splice(i, 1);
  }
  for (let i = S.sparks.length - 1; i >= 0; i--) {
    const p = S.sparks[i];
    p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy *= 0.94; p.life -= dt;
    if (p.life <= 0) S.sparks.splice(i, 1);
  }
  for (let i = S.flashes.length - 1; i >= 0; i--) {
    S.flashes[i].life -= dt * 3.2;
    if (S.flashes[i].life <= 0) S.flashes.splice(i, 1);
  }

  if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 26);
  if (S.bannerT > 0) S.bannerT -= dt;

  // --- 進行 ---
  if (S.mode === 'field' || S.mode === 'title') fillField();
  if (S.mode === 'field' && S.kills >= WAVES[Math.min(S.wave, WAVES.length - 1)].goal) startBoss();
  // デモは序盤の手触りを見せるもの。放置で巨大化も消滅もさせない
  if (S.mode === 'title') { c.m = clamp(c.m, 11, 18); S.lv = levelOf(c.m); }
  if (c.m < C.MDEAD && S.mode !== 'over' && S.mode !== 'title') gameOver();
}

function bounceWall(o) {
  if (o.x < o.r) { o.x = o.r; o.vx = Math.abs(o.vx) * C.WALL; }
  if (o.x > W - o.r) { o.x = W - o.r; o.vx = -Math.abs(o.vx) * C.WALL; }
  if (o.y < o.r) { o.y = o.r; o.vy = Math.abs(o.vy) * C.WALL; }
  if (o.y > H - o.r) { o.y = H - o.r; o.vy = -Math.abs(o.vy) * C.WALL; }
}

// 移動前後を結ぶ線分と円。最高速だと1フレームで直径以上動くので重なり判定だけでは素通りする
function sweepHit(x0, y0, x1, y1, r, e) {
  const R = r + e.r;
  const dx = x1 - x0, dy = y1 - y0;
  const fx = x0 - e.x, fy = y0 - e.y;
  const a = dx * dx + dy * dy;
  if (a < 1e-6) return (fx * fx + fy * fy) <= R * R;
  const b = 2 * (fx * dx + fy * dy);
  const cc = fx * fx + fy * fy - R * R;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return false;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1) || (t1 < 0 && t2 > 1) || cc <= 0;
}

// 企画書の判定。運動量で勝ち負けを決め、近ければ両方弾く
function resolveHit(c, e, idx) {
  const rvx = c.vx - e.vx, rvy = c.vy - e.vy;
  const vrel = Math.hypot(rvx, rvy);
  const nx0 = e.x - c.x, ny0 = e.y - c.y, dd = Math.hypot(nx0, ny0) || 1;
  const nx = nx0 / dd, ny = ny0 / dd;

  const sepAndBounce = (loss) => {
    const over = (c.r + e.r) - dd;
    if (over > 0) { c.x -= nx * over * 0.5; c.y -= ny * over * 0.5; if (!e.orb) { e.x += nx * over * 0.5; e.y += ny * over * 0.5; } }
    const rel = rvx * nx + rvy * ny;
    if (rel > 0) {
      const im = -(1 + 0.75) * rel / (1 / c.m + 1 / (e.orb ? 400 : e.m));
      c.vx += im * nx / c.m; c.vy += im * ny / c.m;
      if (!e.orb) { e.vx -= im * nx / e.m; e.vy -= im * ny / e.m; }
    }
    // 弾かれた隕石はしばらく離れる。彗星が押さえ込まれないように
    if (!e.orb) { e.vx += nx * 2.6; e.vy += ny * 2.6; }
  };

  if (vrel < C.SOFT && c.burn <= 0) { sepAndBounce(0); Snd.play('bounce'); return; }

  const cSp = Math.hypot(c.vx, c.vy), eSp = Math.hypot(e.vx, e.vy);
  // 相手の硬さは彗星の質量で頭打ちにする。生成時だけ抑えても、
  // 削られたあとに「今の自分では絶対に壊せない相手」が居残ってしまう
  const eM = Math.min(e.m, c.m * C.CAP);
  const cAtk = c.m * cSp * c.tail;
  const cDef = c.m * (cSp + C.GUARD) * c.hard;
  const eAtk = e.m * eSp * C.AGGR;
  const eDef = eM * (eSp + C.TOUGH);

  if (c.burn > 0 || cAtk > eDef * C.BREAK) {
    e.hp -= 1;
    if (e.hp > 0) { sepAndBounce(0); Snd.play('crack'); flash(e.x, e.y, e.r * 1.2, 'rgba(255,220,150,.8)'); return; }
    breakRock(e, idx, cAtk);
    c.vx *= 0.88; c.vy *= 0.88;
  } else if (c.inv <= 0 && eAtk > cDef * C.HURT) {
    const ratio = eAtk / cDef;
    const loss = c.m * clamp(0.07 + 0.09 * (ratio - 1), 0.05, 0.26) / c.hard;
    c.m -= loss;
    c.hurt = 0.45; c.inv = 0.7;
    S.lv = levelOf(c.m);
    spawnShards(c.x, c.y, c.vx, c.vy, loss * C.DROP, 'rock');
    sepAndBounce(loss);
    S.shake = 16; S.hitStop = 0.05;
    flash(c.x, c.y, c.r * 2.4, 'rgba(255,110,90,.9)');
    Snd.play('hurt');
  } else {
    sepAndBounce(0);
    Snd.play('bounce');
    flash((c.x + e.x) / 2, (c.y + e.y) / 2, 14, 'rgba(200,220,255,.7)');
  }
}

function breakRock(e, idx, power) {
  spawnShards(e.x, e.y, e.vx, e.vy, C.GAIN * Math.sqrt(e.m / 12), e.kind);
  spawnDebris(e.x, e.y, e.r, e.kind, 8 + (e.r / 3) | 0);
  flash(e.x, e.y, e.r * 1.8, 'rgba(255,240,200,.95)');
  S.enemies.splice(idx, 1);
  S.shake = 10 + e.r * 0.25;
  S.hitStop = 0.045;
  S.kills++;
  Snd.play('break');
  if (e.moon && S.boss) {
    S.boss.moons--;
    if (S.boss.moons <= 0) { S.boss.arc = S.boss.def.arc; banner('衛星が全部落ちた', '目の反対側なら通る'); }
  }
  // 分裂：周りの隕石にも衝撃
  if (S.comet.split > 0) {
    const R = e.r * (2.6 + S.comet.split * 0.8);
    for (let i = S.enemies.length - 1; i >= 0; i--) {
      const o = S.enemies[i];
      if (Math.hypot(o.x - e.x, o.y - e.y) > R + o.r) continue;
      const p = power * (0.45 + 0.12 * S.comet.split);
      if (p > o.m * (Math.hypot(o.vx, o.vy) + C.TOUGH) * C.BREAK) {
        o.hp -= 1;
        if (o.hp <= 0) breakRock(o, i, p * 0.5);
      }
    }
  }
}

// ============ ボス ============
function bossStep(b, dt) {
  const c = S.comet;
  b.aura = clamp(1.6 - Math.hypot(c.x - b.x, c.y - b.y) / (b.r * 5), 0.25, 1.4);
  b.shieldFlash = Math.max(0, b.shieldFlash - dt * 4);

  if (b.dead > 0) {
    b.dead -= dt; b.mood = 'dead'; b.face += 4 * dt;
    b.vx *= 0.94; b.vy *= 0.94;
    b.x += b.vx * (dt / TICK); b.y += b.vy * (dt / TICK);
    if (Math.random() < 0.5) spawnDebris(b.x + rnd(-b.r, b.r), b.y + rnd(-b.r, b.r), b.r * 0.4, 'rock', 1);
    if (b.dead <= 0) bossDown(b);
    return;
  }

  b.t -= dt;
  if (b.st === 'idle') {
    b.face += b.spin * dt;
    b.mood = 'normal';
    // 地球の方（左）へじわじわ進む
    b.vx -= 0.006 * (dt / TICK);
    if (b.t <= 0) { b.st = 'wind'; b.t = 0.75; Snd.play('rage'); }
  } else if (b.st === 'wind') {
    b.face += b.spin * 0.35 * dt;
    b.mood = 'angry';
    b.vx *= 0.93; b.vy *= 0.93;
    if (b.t <= 0) {
      const dx = c.x - b.x, dy = c.y - b.y, d = Math.hypot(dx, dy) || 1;
      const imp = 5.2 + S.wave * 0.6;
      b.vx = dx / d * imp; b.vy = dy / d * imp;
      b.face = Math.atan2(dy, dx);              // 顔を向けて突っ込む
      b.st = 'charge'; b.t = 1.35;
    }
  } else if (b.st === 'charge') {
    b.mood = 'angry';
    if (b.t <= 0) { b.st = 'stun'; b.t = 1.9; b.mood = 'squint'; }
  } else if (b.st === 'stun') {
    b.mood = 'squint';
    b.vx *= 0.90; b.vy *= 0.90;
    if (b.t <= 0) { b.st = 'idle'; b.t = rnd(3.4, 5.0); }
  }

  b.vx *= Math.pow(0.995, dt / TICK); b.vy *= Math.pow(0.995, dt / TICK);
  b.x += b.vx * (dt / TICK); b.y += b.vy * (dt / TICK);
  bounceWall(b);
}

function bossHit(c, b, px, py) {
  if (!sweepHit(px, py, c.x, c.y, c.r, b)) return;
  const nx0 = c.x - b.x, ny0 = c.y - b.y, dd = Math.hypot(nx0, ny0) || 1;
  const nx = nx0 / dd, ny = ny0 / dd;
  const over = (c.r + b.r) - dd;
  if (over > 0) { c.x += nx * over; c.y += ny * over; }

  const hitAng = Math.atan2(ny, nx);
  const shielded = Math.abs(angDiff(hitAng, b.face)) < b.arc;
  const rel = (c.vx - b.vx) * nx + (c.vy - b.vy) * ny;
  const vrel = Math.hypot(c.vx - b.vx, c.vy - b.vy);

  // 跳ね返す
  if (rel < 0) {
    c.vx -= 2 * rel * nx * 0.95; c.vy -= 2 * rel * ny * 0.95;
    c.vx += nx * 2.2; c.vy += ny * 2.2;
  }

  if (vrel < C.SOFT) { Snd.play('bounce'); return; }

  if (shielded || b.moons > 0) {
    b.shieldFlash = 1;
    S.shake = 12; S.hitStop = 0.04;
    flash(c.x, c.y, c.r * 2, 'rgba(255,255,255,.9)');
    // 正面は弾かれるだけ。削られるのは突進を食らったときに限る
    if (c.burn <= 0 && c.inv <= 0 && b.st === 'charge') {
      const loss = c.m * 0.10 / c.hard;
      c.m -= loss; c.hurt = 0.45; c.inv = 0.7; S.lv = levelOf(c.m);
      spawnShards(c.x, c.y, c.vx, c.vy, loss * C.DROP, 'rock');
      Snd.play('hurt');
    } else Snd.play('shield');
    return;
  }

  // 背後に通った
  const cSp = Math.hypot(c.vx, c.vy);
  const dmg = (c.m * cSp * c.tail) * 0.045 * (c.burn > 0 ? 1.6 : 1);
  b.hp -= dmg;
  b.mood = 'hurt';
  S.shake = 20; S.hitStop = 0.07;
  flash(c.x, c.y, c.r * 3, 'rgba(255,210,120,.95)');
  spawnDebris(c.x, c.y, b.r * 0.3, 'rock', 8);
  Snd.play('weak');
  if (b.hp <= 0) { b.hp = 0; b.dead = 1.3; b.vx *= 0.3; b.vy *= 0.3; }
}

function bossDown(b) {
  for (let i = 0; i < 6; i++)
    spawnShards(b.x + rnd(-b.r, b.r), b.y + rnd(-b.r, b.r), rnd(-2, 2), rnd(-2, 2), 0.5 + S.wave * 0.2, 'boss');
  spawnDebris(b.x, b.y, b.r, 'rock', 40);
  flash(b.x, b.y, b.r * 3, 'rgba(255,230,180,1)');
  S.shake = 34;
  S.boss = null;
  S.enemies = S.enemies.filter(e => !e.orb);
  Snd.play('down');
  S.wave++;
  S.kills = 0;
  if (S.wave >= BOSSES.length) { S.mode = 'clear'; showOver(true); }
  else { S.mode = 'choice'; showChoice(); }
}

// ============ 流星 ============
function meteorStep(dt) {
  const c = S.comet;
  if (!S.meteor) {
    S.meteorT -= dt;
    if (S.meteorT <= 0 && S.mode !== 'choice') { startMeteor(); S.meteorT = rnd(C.METEOR_MIN, C.METEOR_MAX); }
    return;
  }
  const m = S.meteor;
  m.t += dt;
  if (m.st === 'warn') {
    if (m.t >= C.METEOR_WARN) { m.st = 'run'; m.t = 0; }
    return;
  }
  const k = m.t / C.METEOR_RUN;
  m.px = m.x; m.py = m.y;
  m.x = m.x0 + (m.x1 - m.x0) * k;
  m.y = m.y0 + (m.y1 - m.y0) * k;
  if (sweepHit(m.px, m.py, m.x, m.y, m.r, { x: c.x, y: c.y, r: c.r })) {
    c.burn = C.BURN;
    flash(c.x, c.y, c.r * 5, 'rgba(255,220,140,1)');
    S.shake = 14;
    Snd.play('ignite');
    S.meteor = null;
    return;
  }
  if (k >= 1) S.meteor = null;
}

// ============ タイトルのデモ ============
// 助走してから当てる、という意図した動きをそのまま見せる
function autoPilot(dt) {
  const c = S.comet, ai = S.ai;
  ai.pt = (ai.pt || 0) + dt;
  let t = ai.target;
  if (!t || S.enemies.indexOf(t) < 0) {
    let best = null, bd = 1e9;
    for (const e of S.enemies) {
      const d = Math.hypot(e.x - c.x, e.y - c.y);
      if (d < bd) { bd = d; best = e; }
    }
    ai.target = t = best; ai.phase = 'run'; ai.pt = 0;
    if (!t) { ai.tx = W / 2; ai.ty = H / 2; return; }
  }
  const dx = t.x - c.x, dy = t.y - c.y, d = Math.hypot(dx, dy) || 1;
  const sp = Math.hypot(c.vx, c.vy);
  if (ai.phase === 'run') {
    // 隕石の反対側へ回り込んで距離を稼ぐ。
    // 真後ろが盤外なら角度をずらす。クランプすると助走点が足元に来て止まる
    const base = Math.atan2(-dy, -dx);
    let ok = false;
    for (const off of [0, 0.7, -0.7, 1.4, -1.4, 2.1, -2.1]) {
      const x = t.x + Math.cos(base + off) * 420, y = t.y + Math.sin(base + off) * 420;
      if (x > 70 && x < W - 70 && y > 70 && y < H - 70) { ai.tx = x; ai.ty = y; ok = true; break; }
    }
    if (!ok) { ai.tx = W / 2; ai.ty = H / 2; }
    if (d > 330 || sp > C.VMAX * 0.72 || ai.pt > 2.2) { ai.phase = 'hit'; ai.pt = 0; }
  } else {
    ai.tx = clamp(t.x + t.vx * 14, 20, W - 20);
    ai.ty = clamp(t.y + t.vy * 14, 20, H - 20);
    if (d < 40 || ai.pt > 3.0) { ai.phase = 'run'; ai.pt = 0; ai.target = null; }
  }
}

// ============ 描画 ============
function draw() {
  const c = S.comet;
  g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  g.fillStyle = '#05070d';
  g.fillRect(0, 0, cv.clientWidth, cv.clientHeight);

  g.save();
  const sh = S.shake;
  g.translate(view.ox + (sh ? rnd(-sh, sh) : 0), view.oy + (sh ? rnd(-sh, sh) : 0));
  g.scale(view.s, view.s);
  g.beginPath(); g.rect(0, 0, W, H); g.clip();

  // 背景
  const bg = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.75);
  bg.addColorStop(0, '#0b1020'); bg.addColorStop(1, '#04060c');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  Art.stars(g, W, H, S.scrollX, S.scrollY, S.t);
  Art.bounds(g, W, H, S.t);

  for (const d of S.debris) Art.debris(g, d);
  for (const s of S.shards) Art.shard(g, s, S.t);

  if (S.boss) {
    const b = S.boss;
    const lx = c.x - b.x, ly = c.y - b.y, ld = Math.hypot(lx, ly) || 1;
    Art.planet(g, b, { x: lx / ld, y: ly / ld }, S.t);
  }
  for (const e of S.enemies) {
    if (e.moon) {
      const lx = c.x - e.x, ly = c.y - e.y, ld = Math.hypot(lx, ly) || 1;
      Art.moon(g, e, { x: lx / ld, y: ly / ld }, S.t);
    } else Art.rock(g, e);
  }

  if (S.meteor) { if (S.meteor.st === 'warn') Art.meteorWarn(g, S.meteor, S.t); else Art.meteor(g, S.meteor); }

  for (const p of S.sparks) Art.spark(g, p);

  const sp = Math.hypot(c.vx, c.vy);
  const spN = clamp(sp / C.VMAX, 0, 1);
  const tailLen = Math.round((8 + 58 * spN) * c.tail);
  Art.comet(g, c, c.trail, tailLen, spN, c.burn);

  for (const f of S.flashes) Art.flash(g, f);

  // 削られた合図
  if (c.hurt > 0) {
    g.fillStyle = 'rgba(255,60,50,' + (c.hurt * 0.30) + ')';
    g.fillRect(0, 0, W, H);
  }
  // 燃焼中は縁が光る
  if (c.burn > 0) {
    const k = clamp(c.burn / C.BURN, 0, 1);
    g.save(); g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(255,200,110,' + (0.12 + 0.30 * k) + ')';
    g.lineWidth = 8 + 26 * k;
    g.strokeRect(0, 0, W, H);
    g.restore();
  }
  g.restore();

  hud(sp, spN);
}

function hud(sp, spN) {
  const c = S.comet;
  // タイトル中はデモの数字。出すと本人の記録と紛らわしい
  elHud.classList.toggle('cs-hud-demo', S.mode === 'title');
  elLv.textContent = 'Lv ' + S.lv;
  const lo = LV[S.lv - 1] || 0, hi = LV[S.lv] || (lo + 20);
  elCore.style.width = clamp((c.m - lo) / (hi - lo) * 100, 0, 100) + '%';
  elMass.textContent = c.m.toFixed(1);
  elSpd.style.width = (spN * 100) + '%';
  elSpd.style.background = c.burn > 0 ? '#ffc65a' : 'linear-gradient(90deg,#4aa8ff,#eaf7ff)';

  if (S.boss) {
    elWave.textContent = S.boss.def.name;
    elProg.textContent = S.boss.moons > 0 ? '衛星 ' + S.boss.moons : '';
    elBossWrap.hidden = false;
    elBoss.style.width = clamp(S.boss.hp / S.boss.hpMax * 100, 0, 100) + '%';
  } else {
    const w = WAVES[Math.min(S.wave, WAVES.length - 1)];
    elWave.textContent = '宙域 ' + (S.wave + 1);
    elProg.textContent = S.kills + ' / ' + w.goal;
    elBossWrap.hidden = true;
  }

  if (S.bannerT > 0 && S.banner) {
    elBan.hidden = false;
    elBan.style.opacity = clamp(S.bannerT / 0.6, 0, 1);
    elBanA.textContent = S.banner[0];
    elBanB.textContent = S.banner[1];
  } else elBan.hidden = true;
}

// ============ 画面 ============
const $ = id => document.getElementById(id);
const elHud = document.querySelector('.cs-hud');
const elLv = $('lv'), elCore = $('core'), elMass = $('mass'), elSpd = $('spd');
const elWave = $('wave'), elProg = $('prog'), elBoss = $('bossbar'), elBossWrap = $('bosswrap');
const elBan = $('banner'), elBanA = $('banA'), elBanB = $('banB');
const ovTitle = $('ovTitle'), ovChoice = $('ovChoice'), ovOver = $('ovOver');

function showChoice() {
  const pool = GROWTH.slice();
  const three = [];
  while (three.length < 3 && pool.length) three.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
  const box = $('choiceBox');
  box.innerHTML = '';
  for (const o of three) {
    const b = document.createElement('button');
    b.className = 'cs-card';
    b.innerHTML = '<b>' + o.n + '</b><span>' + o.d + '</span>';
    b.onclick = () => { applyGrowth(o.id); ovChoice.hidden = true; S.mode = 'field'; fillField(); Snd.play('ui'); };
    box.appendChild(b);
  }
  $('choiceHead').textContent = BOSSES[S.wave - 1].name + ' を落とした';
  ovChoice.hidden = false;
}

function applyGrowth(id) {
  const c = S.comet;
  if (id === 'core')  { c.m *= 1.10; c.hard += 0.16; }
  if (id === 'tail')  { c.tail += 0.22; }
  if (id === 'pull')  { c.pull += 0.55; c.acc += 0.10; c.vmax -= 0.04; }
  if (id === 'split') { c.split += 1; c.m *= 0.94; }
  S.lv = levelOf(c.m);
}

function gameOver() { S.mode = 'over'; Snd.play('over'); showOver(false); }

function showOver(win) {
  $('overHead').textContent = win ? '地球は守られた' : '核が保たなかった';
  $('overBody').textContent = win
    ? '惑星3つを落とした。'
    : '宙域 ' + (S.wave + 1) + ' で力尽きた。撃破 ' + S.kills + '。';
  ovOver.hidden = false;
}

$('btnStart').onclick = () => { Snd.boot(); ovTitle.hidden = true; reset(false); Snd.play('ui'); };
$('btnAgain').onclick = () => { ovOver.hidden = true; reset(false); Snd.play('ui'); };
$('btnMute').onclick = () => {
  Snd.boot(); Snd.setMute(!Snd.isMuted());
  $('btnMute').textContent = Snd.isMuted() ? '🔇' : '🔊';
};

// ============ ループ ============
let last = performance.now(), acc = 0;
function loop(now) {
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  while (acc >= TICK) { step(TICK); acc -= TICK; }
  draw();
  requestAnimationFrame(loop);
}

Art.initStars(W, H, Math.random);
resize();
reset(true);
requestAnimationFrame(loop);

// 調整用。コンソールから触る
window.__cs = {
  get C() { return C; },
  get S() { return S; },
  boss: () => startBoss(),
  meteor: () => startMeteor(),
  grow: m => { S.comet.m = m; S.lv = levelOf(m); },
};

})();
