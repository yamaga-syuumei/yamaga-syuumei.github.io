// 魔法プログラミングゲーム（試作）
//
// 動かし方: index.html を開くだけ。ビルド工程はない。
//
// 設計
//  * 呪文は1行1命令。parse が命令の並びにし、run が「実行トレース」を作る。
//    描画はトレースを1ステップずつ再生するだけで、計算と絵を混ぜない。
//  * 魔素はスタック。入力が積み、変換が一番上を書き換え、出力が消費する。
//  * 戦いは詠唱のたびに作り直す。失敗しても魔力は満タンに戻る。
//  * scan で開いた防壁と弱点は、その詠唱のあいだだけ見えている。
(function () {
  'use strict';

  const D = window.SPELL;
  const { ELEMS, CMDS, FOES, STAGES, TEXT } = D;
  const A = window.SPART;

  const SAVE_KEY = 'spell.save1';
  const SAVE_VER = 1;
  const STEP_MS = 280;                  // 1命令の再生時間
  const FAST_MS = 70;
  const HIT_AT = 0.55;                  // 放った魔素が届くまでの割合

  const el = (id) => document.getElementById(id);
  const cv = el('cv');
  const ctx = cv.getContext('2d');

  const CMD = {};
  CMDS.forEach((c) => { CMD[c.key] = c; });

  let st = null;        // 進みぐあい（保存する）
  let battle = null;    // いまの戦い
  let play = null;      // 再生中のトレース
  let pops = [];        // ダメージの浮き文字
  let W = 0, H = 0, last = 0, time = 0;

  // ---------------------------------------------------------------- 進みぐあい
  function blank() {
    return { v: SAVE_VER, at: 0, cleared: {}, best: {}, scripts: {} };
  }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(st)); } catch (e) { /* 弾かれても遊べる */ }
  }

  function load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return false; }
    if (!raw || raw.v !== SAVE_VER) return false;
    st = Object.assign(blank(), raw);
    st.at = Math.max(0, Math.min(STAGES.length - 1, st.at || 0));
    return true;
  }

  // 使える命令と属性は、いまの試しまでの解放を積み上げたもの
  function unlocked() {
    const cmds = {}, elems = {};
    for (let i = 0; i <= st.at; i++) {
      const u = STAGES[i].unlock;
      (u.cmds || []).forEach((k) => { cmds[k] = 1; });
      (u.elems || []).forEach((k) => { elems[k] = 1; });
    }
    return { cmds, elems };
  }

  // ---------------------------------------------------------------- 戦い
  function newBattle(i) {
    const s = STAGES[i];
    return {
      i, def: s, mpMax: s.mp,
      foes: s.foes.map((f) => {
        const d = FOES[f.def];
        return { id: f.id, name: d.name, art: d.art, hp: d.hp, max: d.hp,
          guard: d.guard, weak: d.weak, hurt: 0 };
      }),
    };
  }

  const targets = () => battle.foes.map((f) => f.id);

  // ---------------------------------------------------------------- 読み取り
  // 行番号は光らせる場所とエラーの指し先に使うので、どの段でも持ち回る。
  function costOf(n) {
    if (n.key === 'draw') return n.n + ELEMS[n.el].add;
    return CMD[n.key].cost;
  }

  function parse(text) {
    const prog = [], errs = [];
    const u = unlocked();
    const tg = targets();
    text.split('\n').forEach((raw, i) => {
      const line = i + 1;
      const body = raw.replace(/\/\/.*$/, '').trim();
      if (!body) return;
      const tk = body.split(/\s+/);
      const key = tk[0];
      const c = CMD[key];
      if (!c) { errs.push({ line, msg: 'そんな命令は無い: ' + key }); return; }
      if (!u.cmds[key]) { errs.push({ line, msg: 'まだ授かっていない命令: ' + key }); return; }

      if (key === 'draw') {
        const e = ELEMS[tk[1]];
        if (!e) { errs.push({ line, msg: '属性が違う: ' + (tk[1] || '（無い）') }); return; }
        if (!u.elems[e.key]) { errs.push({ line, msg: 'まだ引けない属性: ' + tk[1] }); return; }
        const n = Number(tk[2]);
        if (!Number.isInteger(n) || n < 1) { errs.push({ line, msg: '量は1以上の数で書く: ' + c.usage }); return; }
        if (tk.length > 3) { errs.push({ line, msg: '余計な語がある: ' + c.usage }); return; }
        prog.push({ line, key, el: e.key, n });
        return;
      }

      if (c.args.length) {
        if (!tk[1]) { errs.push({ line, msg: '的を書く: ' + c.usage }); return; }
        if (tg.indexOf(tk[1]) < 0) {
          errs.push({ line, msg: 'そんな的はいない: ' + tk[1] + '（いるのは ' + tg.join('・') + '）' });
          return;
        }
        if (tk.length > 2) { errs.push({ line, msg: '余計な語がある: ' + c.usage }); return; }
        prog.push({ line, key, to: tk[1] });
        return;
      }

      if (tk.length > 1) { errs.push({ line, msg: '余計な語がある: ' + c.usage }); return; }
      prog.push({ line, key });
    });
    return { prog, errs };
  }

  // ---------------------------------------------------------------- 実行
  // 絵は描かない。1命令ごとの状態をまるごと写して並べ、再生はそれをなぞるだけ。
  function run(prog, b) {
    const steps = [];
    const stack = [];
    const foes = b.foes.map((f) => Object.assign({}, f));
    let mp = b.mpMax, revealed = false, err = null, win = false;

    const snap = (line, log, cls, fx) => steps.push({
      line, log, cls: cls || '', mp, revealed, fx: fx || null,
      stack: stack.map((o) => Object.assign({}, o)),
      foes: foes.map((f) => Object.assign({}, f)),
    });
    const stop = (line, msg) => { err = { line, msg }; };
    const top = () => stack[stack.length - 1];
    const foeOf = (id) => foes.filter((f) => f.id === id)[0];

    for (const n of prog) {
      const cost = costOf(n);
      if (cost > mp) { stop(n.line, '魔力が足りない（残り ' + mp + '、必要 ' + cost + '）'); break; }

      if (n.key === 'draw') {
        mp -= cost;
        stack.push({ power: n.n, el: n.el, pierce: false });
        snap(n.line, '　' + ELEMS[n.el].name + 'の魔素 ' + n.n + ' を取り出した（-' + cost + '）');

      } else if (n.key === 'amp' || n.key === 'pierce' || n.key === 'split') {
        if (!stack.length) { stop(n.line, '手元に魔素が無い'); break; }
        mp -= cost;
        if (n.key === 'amp') {
          top().power *= 2;
          snap(n.line, '　増幅した。威力 ' + top().power + '（-' + cost + '）');
        } else if (n.key === 'pierce') {
          top().pierce = true;
          snap(n.line, '　貫通を与えた（-' + cost + '）');
        } else {
          const o = stack.pop();
          const half = Math.floor(o.power / 2);
          stack.push({ power: half, el: o.el, pierce: o.pierce });
          stack.push({ power: half, el: o.el, pierce: o.pierce });
          snap(n.line, '　割った。威力 ' + half + ' が2つ（-' + cost + '）');
        }

      } else if (n.key === 'scan') {
        const f = foeOf(n.to);
        mp -= cost;
        revealed = true;
        snap(n.line, '　' + f.name + '：防壁 ' + f.guard
          + ' ／ 弱点 ' + (f.weak ? ELEMS[f.weak].name : 'なし') + '（-' + cost + '）', 'hit');

      } else if (n.key === 'cast') {
        if (!stack.length) { stop(n.line, '手元に魔素が無い'); break; }
        const f = foeOf(n.to);
        if (f.hp <= 0) { stop(n.line, f.name + 'はもう倒れている'); break; }
        mp -= cost;
        const o = stack.pop();
        const weak = f.weak && f.weak === o.el;
        let dmg = o.power * (weak ? 2 : 1);
        if (!o.pierce) dmg = Math.max(0, dmg - f.guard);
        f.hp = Math.max(0, f.hp - dmg);
        snap(n.line, '　' + f.name + 'に ' + dmg + ' のダメージ'
          + (weak ? '（弱点）' : '') + (o.pierce ? '（貫通）' : '') + '（-' + cost + '）',
        'hit', { type: 'cast', to: f.id, dmg, orb: o, weak });
      }

      if (foes.every((f) => f.hp <= 0)) { win = true; break; }
    }

    if (err) steps.push({
      line: err.line, log: '　' + err.msg, cls: 'err', mp, revealed, fx: null,
      stack: stack.map((o) => Object.assign({}, o)),
      foes: foes.map((f) => Object.assign({}, f)),
    });

    return { steps, win, err, used: b.mpMax - mp };
  }

  // ---------------------------------------------------------------- 再生
  const stepMs = () => (el('fast').checked ? FAST_MS : STEP_MS);

  function startRun() {
    if (play) return;
    const text = el('code').value;
    const { prog, errs } = parse(text);
    clearLog();
    if (errs.length) {
      errs.forEach((e) => addLog(e.line + ' | ' + e.msg, 'err'));
      markLines(errs.map((e) => e.line), 'err');
      return;
    }
    if (!prog.length) { addLog('呪文が書かれていない', 'err'); return; }

    st.scripts[battle.def.key] = text;
    save();

    battle = newBattle(battle.i);          // 傷も魔力も戻して引き直す
    pops = [];
    play = { res: run(prog, battle), i: -1, t: 0, hit: false };
    addLog('▶ 詠唱をはじめる');
    el('result').hidden = true;
    el('btnRun').hidden = true;
    el('btnStop').hidden = false;
    el('code').readOnly = true;
    document.querySelector('.sp-ed').classList.add('run');
    hideComp();
  }

  function stopRun(quiet) {
    if (!play) return;
    play = null;
    el('btnRun').hidden = false;
    el('btnStop').hidden = true;
    el('code').readOnly = false;
    document.querySelector('.sp-ed').classList.remove('run');
    markLines([], 'on');
    if (!quiet) addLog('■ 中断した');
  }

  // 1ステップ進める。最後まで行ったら勝ち負けを出す
  function advancePlay(dt) {
    const ms = stepMs();
    play.t += dt;
    const cur = play.i >= 0 ? play.res.steps[play.i] : null;

    if (cur && cur.fx && !play.hit && play.t >= ms * HIT_AT) {
      play.hit = true;
      const f = viewFoes().filter((x) => x.id === cur.fx.to)[0];
      const p = foePos(cur.fx.to);
      if (f) f.hurt = 1;
      pops.push({ x: p.x, y: p.y - p.s * .6, dmg: cur.fx.dmg, weak: cur.fx.weak, t: 0 });
    }

    if (play.t < ms) return;
    play.t = 0; play.hit = false;
    play.i++;
    const step = play.res.steps[play.i];
    if (step) {
      addLog(step.line + ' |' + step.log, step.cls);
      markLines([step.line], step.cls === 'err' ? 'err' : 'on');
      return;
    }
    finishRun();
  }

  function finishRun() {
    const res = play.res;
    // 終わったあとも、終わったときの姿のまま止めておく
    const end = res.steps[res.steps.length - 1];
    if (end) battle.rest = { foes: end.foes, mp: end.mp, revealed: end.revealed };
    stopRun(true);
    const s = battle.def;
    const box = el('result');
    box.hidden = false;
    box.className = 'sp-result ' + (res.win ? 'win' : 'lose');
    if (res.win) {
      el('resultHead').textContent = '倒した';
      el('resultNote').textContent = '使った魔力 ' + res.used + ' / ' + s.mp
        + (st.best[s.key] !== undefined && st.best[s.key] <= res.used
          ? '　（これまでの最短 ' + st.best[s.key] + '）' : '　最短を更新');
      if (st.best[s.key] === undefined || res.used < st.best[s.key]) st.best[s.key] = res.used;
      st.cleared[s.key] = 1;
      save();
      el('btnNext').hidden = false;
      el('btnNext').textContent = STAGES[battle.i + 1] ? '次の試しへ' : '章を終える';
    } else {
      el('resultHead').textContent = res.err ? '詠唱が途切れた' : '倒しきれなかった';
      el('resultNote').textContent = res.err ? res.err.msg : s.hint;
      el('btnNext').hidden = true;
    }
  }

  // ---------------------------------------------------------------- 見せる状態
  // 再生中は、そのステップの写しをそのまま使う。放っている最中だけ、
  // 当たる前の敵を出して魔素を飛ばす。
  function view() {
    const r = battle.rest;
    const idle = () => ({ stack: [], bolt: null,
      foes: r ? r.foes : battle.foes, mp: r ? r.mp : battle.mpMax, revealed: r ? r.revealed : false });
    if (!play || play.i < 0) return idle();
    const cur = play.res.steps[play.i];
    if (!cur) return idle();
    const prev = play.i > 0 ? play.res.steps[play.i - 1] : null;
    const f = play.t / stepMs();
    if (cur.fx && f < HIT_AT) {
      return { stack: cur.stack, foes: prev ? prev.foes : cur.foes, revealed: cur.revealed,
        mp: cur.mp, bolt: { at: f / HIT_AT, fx: cur.fx } };
    }
    return { stack: cur.stack, foes: cur.foes, revealed: cur.revealed, mp: cur.mp, bolt: null };
  }

  // 敵の揺れと白飛びは battle 側に持つ。写しには残さない
  const viewFoes = () => battle.foes;

  // ---------------------------------------------------------------- 描画
  function layout() {
    const box = cv.parentElement;
    const w = box.clientWidth, h = box.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    W = w; H = h;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function foePos(id) {
    const n = battle.foes.length;
    const i = Math.max(0, battle.foes.map((f) => f.id).indexOf(id));
    const s = Math.min(132, (W / (n + 1)) * 0.62, H * 0.36);
    return { x: W * (i + 1) / (n + 1), y: H * 0.36, s };
  }

  const stackY = () => H - 62;
  const orbR = () => Math.min(24, W * 0.035);

  function draw() {
    const v = view();
    ctx.clearRect(0, 0, W, H);
    bg();
    // 看破を授かる前は伏せない。開ける手が無いのに ？ を出しても迷うだけ
    const open = v.revealed || !unlocked().cmds.scan;
    battle.foes.forEach((f, i) => {
      const shown = v.foes[i] || f;
      drawFoe(f, shown, open);
    });
    drawStack(v.stack);
    if (v.bolt) drawBolt(v.bolt);
    drawPops();
    drawMana(v.mp);
  }

  function bg() {
    const g = ctx.createRadialGradient(W / 2, H * 0.34, 10, W / 2, H * 0.34, Math.max(W, H) * 0.7);
    g.addColorStop(0, '#262041');
    g.addColorStop(1, '#171227');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(168,132,255,.09)';
    ctx.lineWidth = 1;
    const r = Math.min(W, H) * 0.3;
    ctx.beginPath(); ctx.arc(W / 2, H * 0.36, r, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H * 0.36, r * 0.72, 0, 7); ctx.stroke();
  }

  function drawFoe(f, shown, revealed) {
    const p = foePos(f.id);
    const dead = shown.hp <= 0;
    ctx.save();
    if (dead) ctx.globalAlpha = 0.22;
    A.drawFoe(ctx, f.art, p.x, p.y, p.s, time, f.hurt);
    ctx.restore();

    const w = p.s * 1.4, x = p.x - w / 2, y = p.y + p.s * 0.72;
    ctx.fillStyle = '#e6e0f5';
    ctx.font = '600 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(f.name, p.x, y);

    ctx.fillStyle = 'rgba(0,0,0,.35)';
    A.roundRect(ctx, x, y + 7, w, 9, 4.5); ctx.fill();
    ctx.fillStyle = dead ? '#5b5375' : '#e0655f';
    A.roundRect(ctx, x, y + 7, Math.max(0, w * shown.hp / f.max), 9, 4.5); ctx.fill();

    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#c6bde4';
    ctx.fillText(shown.hp + ' / ' + f.max, p.x, y + 30);

    const g = revealed ? String(f.guard) : '？';
    const wk = revealed ? (f.weak ? ELEMS[f.weak].name : 'なし') : '？';
    ctx.font = '11px sans-serif';
    ctx.fillStyle = revealed ? '#9d93bd' : '#6d6394';
    ctx.fillText('防壁 ' + g + '　弱点 ' + wk, p.x, y + 47);

    ctx.fillStyle = '#7d74a3';
    ctx.font = '11px "Consolas",monospace';
    ctx.fillText(f.id, p.x, y + 63);
  }

  function drawStack(stack) {
    const r = orbR(), y = stackY();
    ctx.fillStyle = '#7d74a3';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('手元の魔素', 16, y - r - 10);
    if (!stack.length) {
      ctx.fillStyle = '#4e456e';
      ctx.font = '12px sans-serif';
      ctx.fillText('（空）', 16, y + 4);
      return;
    }
    stack.forEach((o, i) => {
      A.drawOrb(ctx, o, 16 + r + i * (r * 2.3), y, r, time, ELEMS);
    });
  }

  function drawBolt(b) {
    const from = { x: 16 + orbR(), y: stackY() };
    const to = foePos(b.fx.to);
    const t = b.at;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * H * 0.12;
    A.drawBolt(ctx, b.fx.orb, x, y, orbR() * 0.9, time, ELEMS);
  }

  function drawPops() {
    ctx.textAlign = 'center';
    pops.forEach((p) => {
      const f = p.t / 800;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - f);
      ctx.fillStyle = p.weak ? '#ffd76a' : '#ff9a8d';
      ctx.font = '700 ' + (p.weak ? 26 : 22) + 'px sans-serif';
      ctx.fillText('-' + p.dmg, p.x, p.y - f * 34);
      ctx.restore();
    });
  }

  function drawMana(mp) {
    el('mpNow').textContent = mp;
    el('mpMax').textContent = '/ ' + battle.mpMax;
    el('mpFill').style.width = (mp / battle.mpMax * 100) + '%';
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!last) last = now;
    const dt = Math.min(120, now - last);
    last = now;
    time += dt / 1000;
    // 隠れている間に開かれると大きさが取れていない。変わっていたら取り直す
    const box = cv.parentElement;
    if (box.clientWidth !== W || box.clientHeight !== H) layout();
    battle.foes.forEach((f) => { if (f.hurt > 0) f.hurt = Math.max(0, f.hurt - dt / 260); });
    pops.forEach((p) => { p.t += dt; });
    pops = pops.filter((p) => p.t < 800);
    if (play) advancePlay(dt);
    draw();
  }

  // ---------------------------------------------------------------- 呪文の欄
  function renderLines() {
    const n = el('code').value.split('\n').length;
    const box = el('lines');
    if (box.childElementCount !== n) {
      box.innerHTML = '';
      for (let i = 1; i <= n; i++) {
        const d = document.createElement('div');
        d.textContent = i;
        box.appendChild(d);
      }
    }
    box.scrollTop = el('code').scrollTop;
  }

  function markLines(lines, cls) {
    const box = el('lines');
    [].forEach.call(box.children, (d, i) => {
      d.className = lines.indexOf(i + 1) >= 0 ? cls : '';
    });
  }

  // 書いている途中でも、いくら使うかが見えるようにする
  function updateCost() {
    const { prog, errs } = parse(el('code').value);
    const sum = prog.reduce((a, n) => a + costOf(n), 0);
    const box = el('cost');
    box.textContent = errs.length ? '書き間違いが ' + errs.length + ' 行' : '消費 ' + sum + ' / ' + battle.mpMax;
    box.className = 'sp-cost' + ((errs.length || sum > battle.mpMax) ? ' over' : '');
  }

  function onEdit() {
    renderLines();
    updateCost();
    updateComp();
  }

  // ---------------------------------------------------------------- 補完
  let comp = null;

  function wordAt() {
    const ta = el('code');
    const head = ta.value.slice(0, ta.selectionStart);
    const line = head.slice(head.lastIndexOf('\n') + 1);
    const m = /([A-Za-z]*)$/.exec(line);
    return { word: m ? m[1] : '', first: /^\s*[A-Za-z]*$/.test(line) };
  }

  function updateComp() {
    const box = el('comp');
    if (document.activeElement !== el('code')) { hideComp(); return; }   // 書いている最中だけ
    const { word, first } = wordAt();
    const u = unlocked();
    let list = [];
    if (word) {
      list = first
        ? CMDS.filter((c) => u.cmds[c.key] && c.key.indexOf(word) === 0)
          .map((c) => ({ text: c.key, note: c.name }))
        : Object.keys(ELEMS).filter((k) => u.elems[k] && k.indexOf(word) === 0)
          .map((k) => ({ text: k, note: ELEMS[k].name }))
          .concat(targets().filter((t) => t.indexOf(word) === 0).map((t) => ({ text: t, note: '的' })));
    }
    // 書き終わった語にひとつだけ出しても邪魔になる
    if (!list.length || (list.length === 1 && list[0].text === word)) { hideComp(); return; }
    comp = { list, word, sel: 0 };
    box.innerHTML = '';
    list.forEach((c, i) => {
      const b = document.createElement('b');
      if (i === 0) b.className = 'on';
      b.innerHTML = c.text + '<i>' + c.note + '</i>';
      b.onmousedown = (e) => { e.preventDefault(); comp.sel = i; takeComp(); };
      box.appendChild(b);
    });
    box.hidden = false;
  }

  function hideComp() { comp = null; el('comp').hidden = true; }

  function takeComp() {
    if (!comp) return false;
    const ta = el('code');
    const c = comp.list[comp.sel];
    const at = ta.selectionStart;
    const head = ta.value.slice(0, at - comp.word.length);
    const tail = ta.value.slice(at);
    ta.value = head + c.text + ' ' + tail;
    const pos = head.length + c.text.length + 1;
    ta.setSelectionRange(pos, pos);
    hideComp();
    onEdit();
    return true;
  }

  // ---------------------------------------------------------------- 命令の札
  function buildCmds() {
    const box = el('cmds');
    box.innerHTML = '';
    const u = unlocked();
    CMDS.filter((c) => u.cmds[c.key]).forEach((c) => {
      const b = document.createElement('button');
      b.className = 'sp-cmd ' + c.kind;
      b.innerHTML = '<b>' + c.key + '</b><i>' + c.name + '</i>';
      b.onclick = () => insert(c);
      b.onmouseenter = () => showTip(b, cmdLines(c));
      b.onmouseleave = hideTip;
      box.appendChild(b);
    });
    // いま引ける属性も札にする。draw に続けて書く語が見えないと分からない
    const es = Object.keys(ELEMS).filter((k) => u.elems[k]);
    if (u.cmds.draw && es.length) {
      es.forEach((k) => {
        const e = ELEMS[k];
        const b = document.createElement('button');
        b.className = 'sp-cmd in';
        b.innerHTML = '<b>draw ' + k + ' 1</b><i>' + e.name + '</i>';
        b.onclick = () => insertText('draw ' + k + ' 1');
        b.onmouseenter = () => showTip(b, [
          [e.name + 'の魔素を引く。数を変えれば威力が変わる', ''],
          ['コストは 量 + ' + e.add, 'dim'],
        ]);
        b.onmouseleave = hideTip;
        box.appendChild(b);
      });
    }
  }

  function cmdLines(c) {
    const out = [[c.usage, 'mono'], [c.desc, '']];
    if (c.note) out.push([c.note, 'dim']);
    out.push([c.key === 'draw' ? 'コスト … 引く量ぶん' : 'コスト ' + c.cost, 'dim']);
    return out;
  }

  const insert = (c) => insertText(c.key === 'draw' ? 'draw mana 1'
    : c.args.length ? c.key + ' ' + targets()[0] : c.key);

  // いまの行が空ならそこへ、何か書いてあれば次の行へ足す
  function insertText(text) {
    const ta = el('code');
    const at = ta.selectionStart;
    const head = ta.value.slice(0, at), tail = ta.value.slice(at);
    const line = head.slice(head.lastIndexOf('\n') + 1);
    const add = line.trim() ? '\n' + text : text;
    ta.value = head + add + tail;
    const pos = head.length + add.length;
    ta.focus();
    ta.setSelectionRange(pos, pos);
    onEdit();
  }

  // ---------------------------------------------------------------- 記録
  function addLog(text, cls) {
    const box = el('log');
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = text;
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
  }

  function clearLog() { el('log').innerHTML = ''; }

  // ---------------------------------------------------------------- 説明の吹き出し
  function showTip(anchor, lines) {
    const t = el('tip');
    t.innerHTML = '';
    lines.forEach(([txt, cls]) => {
      const s = document.createElement('span');
      s.textContent = txt;
      if (cls) s.className = cls;
      t.appendChild(s);
    });
    t.hidden = false;
    const a = anchor.getBoundingClientRect();
    const r = t.getBoundingClientRect();
    let y = a.top - r.height - 8;
    if (y < 8) y = a.bottom + 8;
    t.style.left = Math.max(8, Math.min(a.left, window.innerWidth - r.width - 8)) + 'px';
    t.style.top = y + 'px';
  }

  function hideTip() { el('tip').hidden = true; }

  // ---------------------------------------------------------------- 画面の出入り
  function openStage(i) {
    st.at = i;
    save();
    battle = newBattle(i);
    play = null; pops = [];
    const s = STAGES[i];
    el('chapter').textContent = TEXT.chapter;
    el('stageName').textContent = s.title;
    el('code').value = st.scripts[s.key] || '';
    el('code').readOnly = false;
    el('result').hidden = true;
    el('btnRun').hidden = false;
    el('btnStop').hidden = true;
    document.querySelector('.sp-ed').classList.remove('run');
    clearLog();
    addLog('［' + s.title + '］' + battle.foes.map((f) => f.name).join('・'));
    addLog('　' + s.hint);
    buildCmds();
    layout();
    onEdit();
    markLines([], 'on');
    draw();                                // 裏で開かれても帯の数字が合うようにする
  }

  function showWord() {
    const s = STAGES[st.at];
    el('wordHead').textContent = s.title;
    const b = el('wordBody');
    b.innerHTML = '';
    s.word.forEach((line) => {
      const p = document.createElement('p');
      p.textContent = line;
      b.appendChild(p);
    });
    const u = s.unlock;
    const got = (u.cmds || []).concat((u.elems || []).map((k) => ELEMS[k].name));
    if (got.length) {
      const p = document.createElement('p');
      p.className = 'sp-dim';
      p.textContent = '授かった：' + got.join('　');
      b.appendChild(p);
    }
    el('word').hidden = false;
  }

  function next() {
    if (STAGES[battle.i + 1]) {
      openStage(battle.i + 1);
      showWord();
    } else {
      const b = el('finBody');
      b.innerHTML = '';
      TEXT.clear.forEach((line) => {
        const p = document.createElement('p');
        p.textContent = line;
        b.appendChild(p);
      });
      el('fin').hidden = false;
    }
  }

  // ---------------------------------------------------------------- 配線
  function init() {
    if (!load()) st = blank();
    openStage(st.at);

    el('code').addEventListener('input', onEdit);
    el('code').addEventListener('scroll', renderLines);
    el('code').addEventListener('blur', hideComp);
    el('code').addEventListener('keydown', (e) => {
      if (e.key === 'Tab') { e.preventDefault(); if (!takeComp()) insertText(''); return; }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); startRun(); return; }
      if (e.key === 'Escape') { hideComp(); return; }
      if (comp && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        comp.sel = (comp.sel + (e.key === 'ArrowDown' ? 1 : comp.list.length - 1)) % comp.list.length;
        [].forEach.call(el('comp').children, (d, i) => { d.className = i === comp.sel ? 'on' : ''; });
      }
    });

    el('btnRun').onclick = startRun;
    el('btnStop').onclick = () => stopRun();
    el('btnRetry').onclick = () => { el('result').hidden = true; el('code').focus(); };
    el('btnNext').onclick = next;
    el('btnWord').onclick = showWord;
    el('btnWordClose').onclick = () => { el('word').hidden = true; el('code').focus(); };
    el('btnHelp').onclick = () => { el('help').hidden = false; };
    el('btnHelpClose').onclick = () => { el('help').hidden = true; };
    el('btnOpt').onclick = () => { el('opt').hidden = false; };
    el('btnOptClose').onclick = () => { el('opt').hidden = true; };
    el('btnFinClose').onclick = () => { el('fin').hidden = true; };
    el('btnReset').onclick = () => {
      if (!confirm('最初からやり直します。書いた呪文も消えます。よろしいですか？')) return;
      st = blank();
      save();
      el('opt').hidden = true;
      openStage(0);
      showWord();
    };

    window.addEventListener('resize', layout);
    layout();
    requestAnimationFrame(frame);
    if (!st.cleared[STAGES[st.at].key]) showWord();
  }

  // 中身をブラウザから覗くための口。想定解の確認に使う
  window.__sp = {
    st: () => st,
    battle: () => battle,
    parse: (text) => parse(text),
    // その試しを立て直して、呪文を最後まで走らせた結果だけ返す（絵は動かさない）
    dry: (i, text) => {
      const b = newBattle(i);
      const keep = battle, keepAt = st.at;
      battle = b; st.at = i;
      const p = parse(text === undefined ? STAGES[i].solve : text);
      const res = p.errs.length ? { errs: p.errs } : run(p.prog, b);
      battle = keep; st.at = keepAt;
      return res;
    },
    // 時間を渡せば再生が進む。絵が止まる場所でも同じ道筋で確かめられるようにする
    tick: (ms, step) => {
      const d = step || 40;
      for (let t = 0; t < ms; t += d) {
        time += d / 1000;
        battle.foes.forEach((f) => { if (f.hurt > 0) f.hurt = Math.max(0, f.hurt - d / 260); });
        pops.forEach((p) => { p.t += d; });
        pops = pops.filter((p) => p.t < 800);
        if (play) advancePlay(d);
      }
      draw();
    },
    solveAll: () => STAGES.map((s, i) => {
      const r = window.__sp.dry(i);
      return { stage: s.key, ok: !!r.win, used: r.used, mp: s.mp,
        err: r.err ? r.err.msg : (r.errs ? r.errs[0].msg : null) };
    }),
    open: (i) => openStage(i),
  };

  init();
})();
