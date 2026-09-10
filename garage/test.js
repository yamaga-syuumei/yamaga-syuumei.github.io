/* ==========================================================
   自動テスト（回帰チェック）

   `index.html?debug=1&test=1` で開いたときだけ動く。
   普段の起動には一切影響しない（正規表現が false を返して即 return する）。

   なぜここに置くか：
   game.js は S/B/held/OPT/META などの状態を素の変数として関数間で共有する
   作りで、自動テストが無いまま手を入れると壊れ方が画面に出ないことがある
   （企画書のD-1のメモ参照）。実際に手を動かして毎回目で確認する代わりに、
   この一式を `?debug=1&test=1` で開いて緑になることを、変更のたびに
   確認する運用にする。

   file:// でも動くように、ここでも fetch は使わない。
   window.__garage（?debug=1 で生える開発用API）だけを使って動かす。
   ========================================================== */
(function () {
  'use strict';
  if (!/[?&]test=1/.test(location.search)) return;

  var results = [];
  function ok(name, cond, detail) {
    results.push({ name: name, pass: !!cond, detail: detail || '' });
  }
  function partName(D, id) {
    var hit = D.parts.filter(function (p) { return p.id === id; })[0];
    return hit ? hit.name : null;
  }
  function weaponIn(build, name) {
    return build.weapons.filter(function (w) { return w.name === name; })[0] || null;
  }
  /* give() は自動配置なので、狙った隣接を作るために置いた後で座標を上書きする */
  function giveAt(G, pid, x, y, rot) {
    G.give(pid);
    var parts = G.state().parts;
    var inst = parts[parts.length - 1];
    inst.x = x; inst.y = y; inst.rot = rot || 0;
    return inst;
  }

  function run() {
    if (!window.__garage) {
      results.push({ name: '起動', pass: false, detail: '?debug=1 が無いと window.__garage が生えない。?debug=1&test=1 で開くこと' });
      report();
      return;
    }
    var G = window.__garage;
    var D = window.GAME_DATA;

    /* ---------- 起動直後 ---------- */
    ok('起動直後：進行中のランが無い', G.state() === null);

    /* ---------- ランの開始 ---------- */
    G.startRun('ch_jeep');
    var s = G.state();
    ok('走行開始：車体IDが一致', s.chassis === 'ch_jeep');
    ok('走行開始：所持金が初期値', s.gold === D.run.startGold, 'got=' + s.gold + ' want=' + D.run.startGold);
    ok('走行開始：初期部品3つが車体に乗っている',
      s.parts.length === 3 && s.parts.every(function (p) { return p.x != null; }),
      'count=' + s.parts.length);

    var jeepBase = D.chassis.filter(function (c) { return c.id === 'ch_jeep'; })[0];
    var e_v6 = D.parts.filter(function (p) { return p.id === 'e_v6'; })[0];
    var b0 = G.build();
    ok('build()：初期装甲＝車体＋エンジン',
      b0.maxHp === jeepBase.hp + e_v6.stats.hp,
      'got=' + b0.maxHp + ' want=' + (jeepBase.hp + e_v6.stats.hp));

    /* ---------- B-3：補助部品のオーラは「率」で乗る ---------- */
    /* 固定値加算だったころは速射武器（副砲）だけ突出していた。率なら
       どの武器にも同じ割合で効くはずで、既存の消化ログの実測（5→7 / 42→59）
       と一致することを確認する */
    G.startRun('ch_jeep');
    s = G.state();
    s.parts.forEach(function (p) { p.x = null; p.y = null; }); // 初期装備は一旦倉庫へ

    giveAt(G, 's_mg', 0, 0);
    giveAt(G, 'u_sight', 2, 0); // (1,0) の隣＝(2,0) で接する
    var bMg = G.build();
    var mg = weaponIn(bMg, partName(D, 's_mg'));
    ok('B-3：機関銃(5) + 照準装置(+40%) = 7', !!mg && mg.dmg === 7, 'got=' + (mg && mg.dmg));

    G.startRun('ch_jeep');
    s = G.state();
    s.parts.forEach(function (p) { p.x = null; p.y = null; });
    giveAt(G, 'm_how', 0, 0);    // 2x2
    giveAt(G, 'u_sight', 2, 0);  // (1,0) の隣で接する
    var bHow = G.build();
    var how = weaponIn(bHow, partName(D, 'm_how'));
    ok('B-3：榴弾砲(42) + 照準装置(+40%) = 59', !!how && how.dmg === 59, 'got=' + (how && how.dmg));

    /* ---------- 戦闘：より良い装備は同条件で上回る ----------
       敵側の乱数（どの雑魚が出るか）を消すため、戦闘開始後に
       B.foe を固定値へ直接書き換えてから同じ秒数だけ進める。
       戦闘そのもの（advance/fireGun/foeAttack）に乱数は無いので、
       これで完全に再現できる比較になる */
    function damageFracAgainstDummy(chassisId, extraParts, secs) {
      G.startRun(chassisId);
      extraParts.forEach(function (pid) { G.give(pid); });
      G.warpTo('battle');
      var B = G.battle();
      B.foe = { name: 'dummy', hp: 500, armor: 2, atk: 0, interval: 9999 };
      B.foeHp = 500; B.foeMax = 500;
      B.foeT = 0; B.salvoT = 0; B.ramT = 0;
      B.tally = { dealt: 0, blocked: 0, taken: 0, shots: 0, dryT: 0, elapsed: 0 };
      G.step(secs);
      return 1 - (G.battle().foeHp / G.battle().foeMax);
    }
    var fracWeak = damageFracAgainstDummy('ch_jeep', [], 12);
    var fracStrong = damageFracAgainstDummy('ch_jeep', ['m_105', 's_hmg', 'u_sight', 'u_cool'], 12);
    ok('戦闘：装備を足すと同じ12秒でより多く削れる',
      fracStrong > fracWeak, 'weak=' + r2(fracWeak) + ' strong=' + r2(fracStrong));

    /* ---------- 熱 ----------
       盤に斥力を作るための仕組み。ここが壊れると配置の意味が消えるので、
       ルールごとに1件ずつ押さえる */

    /* 指定した配置だけを載せた状態を作る */
    function layout(chassisId, list) {
      G.startRun(chassisId);
      G.state().parts.forEach(function (p) { p.x = null; p.y = null; });
      list.forEach(function (L) { giveAt(G, L[0], L[1], L[2], L[3] || 0); });
      return G.build();
    }
    function netOf(b, pid) {
      var w = weaponIn(b, partName(D, pid));
      return w ? w.heatNet : null;
    }

    /* 外周は外気で冷える。内側はこもる */
    var bEdge = layout('ch_ogre', [['s_hmg', 1, 3]]);
    var bMid = layout('ch_ogre', [['s_hmg', 1, 1]]);
    ok('熱：内側に置くほうが外周より熱い',
      netOf(bMid, 's_hmg') > netOf(bEdge, 's_hmg'),
      '内側=' + r2(netOf(bMid, 's_hmg')) + ' 外周=' + r2(netOf(bEdge, 's_hmg')));

    /* 武器どうしを隣接させると熱を回し合う＝斥力 */
    var bApart = layout('ch_ogre', [['m_105', 1, 1], ['m_105', 1, 3]]);
    var bNext = layout('ch_ogre', [['m_105', 1, 1], ['m_105', 1, 2]]);
    ok('熱：武器を隣接させると互いに熱くなる',
      netOf(bNext, 'm_105') > netOf(bApart, 'm_105'),
      '隣接=' + r2(netOf(bNext, 'm_105')) + ' 離す=' + r2(netOf(bApart, 'm_105')));
    ok('熱：離して置けば同じ武器でも過熱しない',
      netOf(bApart, 'm_105') <= 0 && netOf(bNext, 'm_105') > 0,
      '隣接=' + r2(netOf(bNext, 'm_105')) + ' 離す=' + r2(netOf(bApart, 'm_105')));

    /* 冷却器は隣接マスの排熱を上げる */
    var bNoCool = layout('ch_ogre', [['m_105', 1, 1]]);
    var bCool = layout('ch_ogre', [['m_105', 1, 1], ['u_cool', 1, 2]]);
    ok('熱：冷却器を隣に置くとそのマスの排熱が上がる',
      bCool.heat.cool['1,1'] > bNoCool.heat.cool['1,1'],
      '冷却あり=' + r2(bCool.heat.cool['1,1']) + ' なし=' + r2(bNoCool.heat.cool['1,1']));

    /* 塞がったマスは通気口として働く（開けると置ける代わりに排熱が減る） */
    var bVent = layout('ch_ogre', []);
    ok('熱：塞がったマスに面したマスはよく冷える',
      bVent.heat.cool['3,0'] > bVent.heat.cool['2,0'],
      '穴の隣=' + r2(bVent.heat.cool['3,0']) + ' 内寄り=' + r2(bVent.heat.cool['2,0']));

    /* 捨てきれない熱はリロードに出る。整備画面の予測と戦闘は同じ数字を使う */
    var hotW = weaponIn(bNext, partName(D, 'm_105'));
    var coolW = weaponIn(bApart, partName(D, 'm_105'));
    ok('熱：過熱した武器はリロードが伸びる',
      hotW.heatMult > 1 && hotW.reload > coolW.reload,
      'mult=' + r2(hotW.heatMult) + ' 熱=' + r2(hotW.reload) + ' 冷=' + r2(coolW.reload));
    ok('熱：余裕があるときは伸びない', coolW.heatMult === 1 && coolW.heatTier === '',
      'mult=' + coolW.heatMult + ' tier=' + coolW.heatTier);

    /* 初期装備は熱で不利にならないこと（遊び始めていきなり罰を受けない）。
       自動配置が熱を見て置くようになったので、3車体すべてで成り立つはず */
    ['ch_jeep', 'ch_apc', 'ch_ogre'].forEach(function (cid) {
      G.startRun(cid);
      var b1 = G.build();
      ok('熱：初期装備は過熱しない（' + cid + '）',
        b1.weapons.every(function (w) { return !w.heatTier; }),
        b1.weapons.map(function (w) { return w.name + '=' + r2(w.heatNet); }).join(' '));
    });

    /* ---------- ダメージの数字が出る位置 ----------
       .ss-pop の位置は「箱の高さの34%」だが、敵側の箱には次の攻撃ゲージが
       入っていて縦に長い。割合のままだと数字が敵の名前や体力に重なる。
       絵（canvas）の高さの中に収まっていることを見る */
    G.startRun('ch_jeep');
    G.warpTo('boss');
    G.step(3);
    var foeCanvas = document.getElementById('battle-foe');
    var pops = foeCanvas.parentNode.querySelectorAll('.ss-pop');
    var popTop = pops.length ? parseFloat(pops[pops.length - 1].style.top) : null;
    ok('ダメージ数字：敵側でも絵の中に出る（名前に重ならない）',
      pops.length > 0 && popTop != null && popTop < foeCanvas.offsetHeight,
      'top=' + popTop + ' canvasH=' + foeCanvas.offsetHeight + ' pops=' + pops.length);

    /* ---------- 焚き火 ----------
       できることは一つだけなので、満タンで「修理する」を選べてしまうと
       その1回を無駄に捨てることになる */
    G.startRun('ch_jeep');
    G.warpTo('rest');
    var restBtn = document.getElementById('rest-menu').children[0];
    ok('焚き火：満タンなら「修理する」は押せない', restBtn.disabled === true);

    s = G.state();
    s.hp = s.maxHp - 5;
    G.warpTo('rest');
    restBtn = document.getElementById('rest-menu').children[0];
    ok('焚き火：傷ついていれば押せる', restBtn.disabled === false);
    ok('焚き火：回復量は不足分までしか出さない',
      /装甲を 5 回復/.test(restBtn.textContent), 'text=' + restBtn.textContent);

    /* ---------- 消耗品 ---------- */
    G.startRun('ch_jeep');
    s = G.state();
    s.hp = Math.max(1, Math.round(s.maxHp * 0.3));
    var hpBefore = s.hp;
    G.addItem('i_patch');
    var idx = s.items.indexOf('i_patch');
    G.useItem(idx);
    ok('消耗品：応急パッチで装甲が回復する', s.hp > hpBefore, 'before=' + hpBefore + ' after=' + s.hp);
    ok('消耗品：使ったら持ち物から消える', s.items.indexOf('i_patch') < 0);

    /* ---------- イベント効果 ---------- */
    G.startRun('ch_jeep');
    s = G.state();
    var goldBefore = s.gold;
    G.applyEvent({ gold: 50 });
    ok('イベント：gold効果で所持金が増える', s.gold === goldBefore + 50, 'got=' + s.gold);

    G.startRun('ch_jeep');
    s = G.state();
    s.parts.forEach(function (p) { p.x = null; p.y = null; }); // 全部倉庫（＝売却対象）へ
    var stashCount = s.parts.length;
    goldBefore = s.gold;
    G.applyEvent({ sellStash: 1 });
    ok('イベント：sellStashで倉庫が空になる', s.parts.length === 0, 'left=' + s.parts.length);
    ok('イベント：sellStashで所持金が増える', s.gold > goldBefore, 'before=' + goldBefore + ' after=' + s.gold + ' sold=' + stashCount);

    /* ---------- 実績 ---------- */
    G.resetMeta();
    var meta = G.meta();
    ok('実績：resetMeta直後は未解除', !meta.unlocked.first_win);
    meta.stats.battlesWon = 1;
    G.checkAchievements();
    ok('実績：条件を満たすと解除される', !!G.meta().unlocked.first_win);

    /* ---------- 図鑑 ---------- */
    G.openCodex('title');
    var partsCount = document.getElementById('codex-parts').children.length;
    var enemiesCount = document.getElementById('codex-enemies').children.length;
    ok('図鑑：部品カード数がデータ件数と一致', partsCount === D.parts.length, 'got=' + partsCount + ' want=' + D.parts.length);
    ok('図鑑：敵カード数がデータ件数と一致', enemiesCount === D.enemies.length, 'got=' + enemiesCount + ' want=' + D.enemies.length);

    /* ---------- 保存・読み込み ---------- */
    G.startRun('ch_apc');
    s = G.state();
    s.gold = 321;
    G.save();
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem('garage-run-v1-test')); } catch (e) { /* noop */ }
    ok('保存：localStorageに書かれる', !!raw && !!raw.s);
    ok('保存：所持金が一致する', !!raw && raw.s.gold === 321, 'got=' + (raw && raw.s.gold));

    report();
  }

  function r2(n) { return Math.round(n * 100) / 100; }

  function report() {
    var pass = results.filter(function (r) { return r.pass; }).length;
    var fail = results.length - pass;
    window.__TEST_RESULTS__ = { pass: pass, fail: fail, total: results.length, results: results };

    var lines = results.map(function (r) {
      return (r.pass ? 'PASS' : 'FAIL') + '  ' + r.name + (r.detail ? '   [' + r.detail + ']' : '');
    });
    lines.push('');
    lines.push('TESTS ' + pass + '/' + results.length + ' passed' + (fail ? '  <<< ' + fail + ' FAILED' : ''));
    var text = lines.join('\n');

    if (fail) console.error(text); else console.log(text);

    var pre = document.createElement('pre');
    pre.id = 'test-results';
    pre.style.cssText = 'position:fixed;inset:0;margin:0;padding:16px;' +
      'background:#0b0e11;color:#dfe6ee;font:13px/1.6 monospace;' +
      'white-space:pre-wrap;overflow:auto;z-index:99999';
    pre.textContent = text;
    document.body.appendChild(pre);
    document.title = (fail ? 'FAIL ' : 'PASS ') + pass + '/' + results.length + ' - test';
  }

  if (document.readyState !== 'loading') run();
  else document.addEventListener('DOMContentLoaded', run);
})();
