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
  function statOf(D, id, key) {
    var p = D.parts.filter(function (x) { return x.id === id; })[0];
    return p && p.stats ? p.stats[key] : null;
  }
  function partName(D, id) {
    var hit = D.parts.filter(function (p) { return p.id === id; })[0];
    return hit ? hit.name : null;
  }
  function weaponIn(build, name) {
    return build.weapons.filter(function (w) { return w.name === name; })[0] || null;
  }
  /* 決着まで進める。敵の挙動（回復など）が入ったので
     「1秒進めれば倒せる」とは限らない */
  function finish(G, cap) {
    var t = 0;
    while (G.battle() && !G.battle().over && t < (cap || 60)) { G.step(0.5); t += 0.5; }
    return t;
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
    /* 期待値はデータから出す。武器の威力を調整するたびにテストが落ちないように
       （見ているのは「率で乗るか」であって、特定の数字ではない） */
    var mgWant = Math.round(statOf(D, 's_mg', 'dmg') * 1.4);
    ok('B-3：機関銃 + 照準装置 は威力+40%', !!mg && mg.dmg === mgWant,
      'got=' + (mg && mg.dmg) + ' want=' + mgWant);

    G.startRun('ch_jeep');
    s = G.state();
    s.parts.forEach(function (p) { p.x = null; p.y = null; });
    giveAt(G, 'm_how', 0, 0);    // 2x2
    giveAt(G, 'u_sight', 2, 0);  // (1,0) の隣で接する
    var bHow = G.build();
    var how = weaponIn(bHow, partName(D, 'm_how'));
    var howWant = Math.round(statOf(D, 'm_how', 'dmg') * 1.4);
    ok('B-3：榴弾砲 + 照準装置 も同じ率で乗る', !!how && how.dmg === howWant,
      'got=' + (how && how.dmg) + ' want=' + howWant);

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

    /* ---------- 改造 ----------
       走行の性格を決める1手。効果と代償が必ず両方乗ることと、
       カードの予告が実際の結果と食い違わないことを押さえる */

    function withMod(cid, modId, extra) {
      G.startRun(cid);
      (extra || []).forEach(function (p) { G.give(p); });
      var before = G.build();
      G.state().mods.push(modId);
      return { before: before, after: G.build() };
    }

    var mCrew = withMod('ch_apc', 'md_crew');
    ok('改造：効果が乗る（複座化の速度+12%）',
      Math.abs((mCrew.after.spd - mCrew.before.spd) - 0.12) < 0.001,
      r2(mCrew.before.spd) + ' → ' + r2(mCrew.after.spd));
    ok('改造：代償も乗る（複座化で排熱−0.5）',
      Math.abs((mCrew.after.heat.cool['1,1'] - mCrew.before.heat.cool['1,1']) + 0.5) < 0.001,
      r2(mCrew.before.heat.cool['1,1']) + ' → ' + r2(mCrew.after.heat.cool['1,1']));

    /* 効果も代償も「実際に効く資源」でなければ、選択にならない。
       積載は超過しない限り効かないので、改造の通貨には使わない */
    var usesCap = (D.mods || []).filter(function (m) {
      return m.effect.cap != null || m.effect.partWeight != null;
    });
    ok('改造：効きもしない積載・重量を通貨に使っていない', usesCap.length === 0,
      usesCap.map(function (m) { return m.name; }).join(','));

    var mFin = withMod('ch_apc', 'md_fin');
    ok('改造：放熱板で全マスの排熱が上がる',
      Math.abs((mFin.after.heat.cool['1,1'] - mFin.before.heat.cool['1,1']) - 0.7) < 0.001,
      r2(mFin.before.heat.cool['1,1']) + ' → ' + r2(mFin.after.heat.cool['1,1']));
    ok('改造：放熱板の代償で最大装甲が下がる',
      mFin.after.maxHp - mFin.before.maxHp === -15,
      mFin.before.maxHp + ' → ' + mFin.after.maxHp);

    var mBay = withMod('ch_ogre', 'md_bay');
    ok('改造：拡張ベイで塞がったマスが開く',
      Object.keys(mBay.after.heat.cool).length === 20 &&
      Object.keys(mBay.before.heat.cool).length === 17,
      Object.keys(mBay.before.heat.cool).length + ' → ' + Object.keys(mBay.after.heat.cool).length);

    /* 補修キット：勝つたびに装甲が戻る（走行を通した消耗に効く） */
    G.startRun('ch_apc');
    G.state().mods.push('md_kit');
    G.warpTo('battle');
    var kb = G.battle();
    kb.meHp = 20; kb.foeHp = 1;
    G.step(1);
    ok('改造：補修キットは戦闘に勝つと装甲を継ぐ', G.state().hp > 20, 'hp=' + G.state().hp);

    var mSpare = withMod('ch_apc', 'md_spare');
    var mgB = weaponIn(mSpare.before, partName(D, 's_mg'));
    var mgA = weaponIn(mSpare.after, partName(D, 's_mg'));
    var m76B = weaponIn(mSpare.before, partName(D, 'm_76'));
    var m76A = weaponIn(mSpare.after, partName(D, 'm_76'));
    ok('改造：弾の改造は弾数無限の副砲に効かない',
      mgB.ammo === null && mgA.ammo === null);
    ok('改造：弾数のある武器には効く（予備弾倉 +4）',
      m76A.ammo === m76B.ammo + 4, m76B.ammo + ' → ' + m76A.ammo);

    /* カードの予告と実際がずれないこと。ずれたら選べない画面になる */
    var mismatch = null;
    D.mods.forEach(function (m) {
      if (mismatch) return;
      G.startRun('ch_apc');
      G.give('m_105');
      var pv = G.modPreview(m.id);
      G.state().mods.push(m.id);
      var after = G.build();
      var real = {
        maxHp: after.maxHp, cap: after.cap, def: after.def,
        spd: Math.round(after.spd * 100),
        hot: after.weapons.filter(function (w) { return w.heatTier; }).length
      };
      pv.forEach(function (row) {
        if (mismatch || real[row.key] == null) return;
        if (real[row.key] !== row.b) {
          mismatch = m.name + ' の ' + row.key + '：予告 ' + row.b + ' / 実際 ' + real[row.key];
        }
      });
    });
    ok('改造：カードの予告と実際の結果が全改造で一致する', mismatch === null, mismatch || '8種すべて一致');

    /* 「効き目がない」は本当に効かないときだけ出す。
       走行をまたいで効く改造に出すと、良い手を捨てさせてしまう */
    G.startRun('ch_ogre');
    G.give('m_how');
    var kitPv = G.modPreview('md_kit');
    ok('改造：走行をまたぐ効果も予告に出る（補修キット）',
      kitPv.some(function (x) { return x.key === 'heal'; }) &&
      !kitPv.some(function (x) { return x.key === 'none'; }),
      kitPv.map(function (x) { return x.t; }).join(' / '));

    /* 賞金首を倒したときだけ改造を選べる */
    G.startRun('ch_apc');
    G.warpTo('elite');
    G.battle().foeHp = 1;
    G.battle().bv = {};          // 回復などの挙動を切って確実に倒す
    finish(G);
    document.getElementById('battle-next').click();
    ok('改造：賞金首に勝つと改造画面が出る', document.getElementById('sc-mod').hidden === false);

    G.startRun('ch_apc');
    G.warpTo('battle');
    G.battle().foeHp = 1;
    G.battle().bv = {};
    finish(G);
    document.getElementById('battle-next').click();
    ok('改造：雑魚戦では出ない（戦利品へ直行）',
      document.getElementById('sc-mod').hidden === true &&
      document.getElementById('sc-reward').hidden === false);

    /* 取り尽くしたら素通りする */
    G.startRun('ch_apc');
    D.mods.forEach(function (m) { G.state().mods.push(m.id); });
    G.warpTo('elite');
    G.battle().foeHp = 1;
    G.battle().bv = {};
    finish(G);
    document.getElementById('battle-next').click();
    ok('改造：全部取ったあとは改造画面を出さない',
      document.getElementById('sc-mod').hidden === true &&
      document.getElementById('sc-reward').hidden === false);

    /* ---------- マップ ----------
       一本道は「選んでいる」ように見えて選択ではない。
       種別の比率を保ったまま、分岐だけを増やしたことを押さえる */

    var oneWay = 0, steps = 0, typeTotal = {}, runs = 60, orphan = 0;
    for (var mt = 0; mt < runs; mt++) {
      G.startRun('ch_apc');
      var mm = G.state().map;
      var last = mm.floors.length - 1;
      for (var mf = 0; mf < mm.edges.length; mf++) {
        for (var mi = 0; mi < mm.edges[mf].length; mi++) {
          steps++;
          /* 最上階はボス1つなので1本で正しい */
          if (mm.edges[mf][mi].length < 2 && mf + 1 !== last) oneWay++;
        }
      }
      /* 生成した時点で、どのノードも0階から辿り着けること */
      var seen = {};
      mm.floors[0].forEach(function (_, i) { seen['0:' + i] = true; });
      for (var rf = 0; rf < mm.edges.length; rf++) {
        for (var ri = 0; ri < mm.edges[rf].length; ri++) {
          if (!seen[rf + ':' + ri]) continue;
          mm.edges[rf][ri].forEach(function (j) { seen[(rf + 1) + ':' + j] = true; });
        }
      }
      mm.floors.forEach(function (row, f) {
        row.forEach(function (_, i) { if (!seen[f + ':' + i]) orphan++; });
      });
      mm.floors.forEach(function (row) {
        row.forEach(function (n) { typeTotal[n.type] = (typeTotal[n.type] || 0) + 1; });
      });
    }
    ok('マップ：最上階以外は必ず2つ以上へ分岐する', oneWay === 0,
      '一本道 ' + oneWay + ' / ' + steps);
    ok('マップ：辿り着けないノードが生成されない', orphan === 0, 'orphan=' + orphan);

    var perRun = {};
    Object.keys(typeTotal).forEach(function (k) { perRun[k] = typeTotal[k] / runs; });
    /* 分岐を増やすと戦闘を避けて登れてしまうので、種別の比率は動かさない。
       戦闘が減ると走行が一気に楽になる（実測で欲張りに避けると 4.2戦→1.0戦 になった） */
    ok('マップ：戦闘の数が以前の水準から動いていない',
      perRun.battle > 11.5 && perRun.battle < 15,
      Object.keys(perRun).map(function (k) { return k + '=' + r2(perRun[k]); }).join(' '));
    ok('マップ：賞金首は必ず2つ', Math.abs(perRun.elite - 2) < 0.001, 'elite=' + r2(perRun.elite));

    /* マップで見せた敵と、実際に出てくる敵が同じであること。
       違う敵が出るなら、道を選んだ意味が無くなる */
    G.startRun('ch_apc');
    var mp = G.state().map;
    var shown = null, spot = null;
    for (var sf = 0; sf < mp.floors.length && !shown; sf++) {
      for (var si = 0; si < mp.floors[sf].length; si++) {
        if (mp.floors[sf][si].type === 'battle') { shown = mp.floors[sf][si].foe; spot = { f: sf, i: si }; break; }
      }
    }
    ok('マップ：戦闘ノードに相手が決めてある', !!shown, 'foe=' + shown);
    G.enterNode(spot.f, spot.i);
    ok('マップ：見せた相手がそのまま出てくる', G.battle().foe.id === shown,
      '見せた=' + shown + ' 出た=' + G.battle().foe.id);

    /* ---------- 弾 ----------
       弾は長いあいだ余りすぎていて、資源として存在していなかった
       （いちばん長いボス戦でも半分以上余っていた）。
       そこに乗っている仕組み（弾薬箱・追加弾倉・予備弾倉・弾薬庫）が
       まとめて死んでいたので、長い戦いでは必ず尽きるようにした */

    /* 長い戦いでは主砲が尽きて、副砲だけの後半になる */
    G.startRun('ch_apc');
    ['e_turbo', 'm_105', 's_hmg', 'u_sight', 'u_cool'].forEach(function (p) { G.give(p); });
    G.state().parts.forEach(function (p) { p.lvl = 3; });
    G.warpTo('boss');
    var bt = 0, dryAt = {};
    while (G.battle() && !G.battle().over && bt < 120) {
      G.step(0.5); bt += 0.5;
      G.battle().guns.forEach(function (g) {
        if (g.ammo === 0 && dryAt[g.name] == null) dryAt[g.name] = bt;
      });
    }
    ok('弾：ボス戦では主砲が尽きる', Object.keys(dryAt).length > 0,
      Object.keys(dryAt).map(function (k) { return k + '=' + dryAt[k] + '秒'; }).join(' ') || '尽きなかった');
    ok('弾：尽きても副砲は撃ち続けられる',
      G.battle().guns.some(function (g) { return g.ammo == null; }));

    /* 短い戦いは変わらない（雑魚戦まで弾切れにすると、ただ長引くだけ） */
    G.startRun('ch_apc');
    G.warpTo('battle');
    var st2 = 0;
    while (G.battle() && !G.battle().over && st2 < 120) { G.step(0.5); st2 += 0.5; }
    ok('弾：雑魚戦では尽きない',
      G.battle().guns.every(function (g) { return g.ammo == null || g.ammo > 0; }),
      G.battle().guns.map(function (g) { return g.name.slice(0, 6) + ':' + (g.ammo == null ? '∞' : g.ammo); }).join(' '));

    /* 弾薬箱が効くこと。自動配置が熱だけを見ていたころは、
       照準装置も弾薬箱も武器に接しない場所へ置かれて効果を捨てていた */
    G.startRun('ch_apc');
    G.give('m_105');
    var noBox = weaponIn(G.build(), partName(D, 'm_105')).ammo;
    G.give('u_ammo');
    var withBox = weaponIn(G.build(), partName(D, 'm_105')).ammo;
    ok('弾：弾薬箱を渡すと自動配置が武器の隣に置く', withBox > noBox,
      noBox + ' → ' + withBox);

    G.startRun('ch_apc');
    G.give('m_105');
    G.give('u_sight');
    var sighted = weaponIn(G.build(), partName(D, 'm_105'));
    ok('配置：照準装置も自動で武器の隣に置かれる', sighted.aura.list.length > 0,
      '隣接=' + (sighted.aura.list.join(',') || 'なし'));

    /* ---------- 敵の挙動 ----------
       以前は7体中6体が「N秒ごとにXダメージ」だけで、どの敵でも
       構成の優劣が入れ替わらなかった＝どの敵と戦うかが選択になっていなかった */

    /* 指定した敵と、指定した構成で戦わせる */
    function fightVs(parts, foeId, secs) {
      G.startRun('ch_apc');
      G.state().parts.forEach(function (p) { p.x = null; p.y = null; });
      parts.forEach(function (p) { G.give(p); });
      G.warpTo('battle');
      var B = G.battle();
      var base = D.enemies.filter(function (e) { return e.id === foeId; })[0];
      B.foe = JSON.parse(JSON.stringify(base));
      B.foeHp = base.hp; B.foeMax = base.hp;
      B.bv = base.behavior || {};
      B.armorAdd = 0; B.hits = 0; B.dodged = 0; B.baseInterval = base.interval;
      B.foeT = 0; B.salvoT = 0; B.ramT = 0; B.meHp = B.meMax;
      var t = 0, cap = secs || 200;
      while (G.battle() && !G.battle().over && t < cap) { G.step(0.5); t += 0.5; }
      B = G.battle();
      return { t: Math.round(t * 10) / 10, win: !!B.win, B: B };
    }

    var gl = fightVs(['s_hmg', 's_flame', 'u_sight'], 'en_golem', 12);
    ok('敵：廃車ゴーレムは撃たれるほど装甲が増える', gl.B.armorAdd > 0,
      '+' + gl.B.armorAdd);
    ok('敵：装甲の増加に上限がある',
      gl.B.armorAdd <= (gl.B.bv.armorMax || 0), gl.B.armorAdd + ' / 上限' + gl.B.bv.armorMax);

    var bg = fightVs(['s_hmg', 's_flame'], 'en_buggy', 12);
    ok('敵：砂賊のバギーは何発かに1発を避ける', bg.B.dodged > 0, '回避 ' + bg.B.dodged + ' 回');

    var dr = fightVs(['s_mg'], 'en_drone', 12);
    ok('敵：野良ドローンは時間とともに加速する',
      dr.B.foe.interval < dr.B.baseInterval,
      r2(dr.B.baseInterval) + '秒 → ' + r2(dr.B.foe.interval) + '秒');

    var sg = fightVs(['s_mg'], 'en_stag', 12);
    ok('敵：鉄クワガタは時間とともに装甲が増える', sg.B.armorAdd > 0, '+' + r2(sg.B.armorAdd));

    /* 砂ヒルは回復する。削り手が弱いと減らない */
    var lc = fightVs(['s_mg'], 'en_leech', 10);
    var lcDealt = lc.B.tally.dealt;
    ok('敵：砂ヒルは回復するので、削った量ほど減らない',
      lc.B.foeMax - lc.B.foeHp < lcDealt,
      '与えた' + Math.round(lcDealt) + ' / 実際に減った' + Math.round(lc.B.foeMax - lc.B.foeHp));

    /* これが本題。敵によって構成の優劣が入れ替わること */
    var burst = ['m_how', 'u_sight', 'u_ammo'];
    var swarm = ['s_hmg', 's_flame', 'u_sight'];
    var gBurst = fightVs(burst, 'en_golem');
    var gSwarm = fightVs(swarm, 'en_golem');
    var dBurst = fightVs(burst, 'en_drone');
    var dSwarm = fightVs(swarm, 'en_drone');
    ok('敵：廃車ゴーレムには重い一撃のほうが速い', gBurst.t < gSwarm.t,
      '重砲' + gBurst.t + '秒 / 手数' + gSwarm.t + '秒');
    ok('敵：野良ドローンには手数のほうが速い', dSwarm.t < dBurst.t,
      '手数' + dSwarm.t + '秒 / 重砲' + dBurst.t + '秒');
    ok('敵：相性が敵によって入れ替わる（どちらか一方が常に正解ではない）',
      (gBurst.t < gSwarm.t) !== (dBurst.t < dSwarm.t));

    /* 何をしてくる敵かが読めること。読めないまま負けるのがいちばん悪い */
    var noNote = D.enemies.filter(function (e) { return !e.bnote; });
    ok('敵：全ての敵に挙動の説明がある', noNote.length === 0,
      noNote.map(function (e) { return e.name; }).join(',') || 'すべてあり');

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
    var modsCount = document.getElementById('codex-mods').children.length;
    ok('図鑑：改造カード数がデータ件数と一致', modsCount === D.mods.length, 'got=' + modsCount + ' want=' + D.mods.length);

    /* ---------- 倉庫で眠る部品を起こす（入れ替え） ----------
       走行75本を測ったところ、戦利品の22〜51%が倉庫行きになり、その多くは
       「盤の1個を降ろせば載る」ものだった。入れ替えると毎秒火力が2〜3割伸びるのに、
       画面には何も出ていなかった。ここで「見えていること」を縛る */

    /* --- 置ける・置けない・1個降ろせば置ける、の3通りを見分ける --- */
    G.startRun('ch_apc');
    var st0 = G.state();
    var occ0 = G.occupancy(null);
    var some = st0.parts.filter(function (p) { return p.x != null; })[0];
    ok('入替：盤からはみ出す場所は null（どうやっても置けない）',
      G.blockersAt(some, -5, -5, occ0) === null);
    var onCell = G.blockersAt(some, some.x, some.y, G.occupancy(some.uid));
    ok('入替：自分をどけた自分の場所は空き扱い', !!onCell && onCell.length === 0);
    var overlapped = G.blockersAt(some, some.x, some.y, G.occupancy(null));
    ok('入替：埋まっているマスは邪魔者を返す',
      !!overlapped && overlapped.length === 1 && overlapped[0].uid === some.uid);

    /* --- 空きがあるうちは「そのまま載る」 --- */
    G.startRun('ch_ogre');
    G.give('u_ammo');
    var fresh = G.state().parts[G.state().parts.length - 1];
    fresh.x = null; fresh.y = null;
    ok('入替：空きがあれば そのまま載る', G.fitsAsIs(fresh) === true);

    /* --- 盤を埋めると、そのままでは載らないが入れ替えなら載る --- */
    G.startRun('ch_jeep');
    ['m_105', 's_hmg', 'u_sight', 'u_ammo', 'c_takumi'].forEach(function (p) { G.give(p); });
    var sj = G.state();
    var sleeping = sj.parts.filter(function (p) { return p.x == null; });
    ok('入替：盤が埋まると倉庫に部品が残る', sleeping.length > 0,
      sleeping.map(function (p) { return p.pid; }).join(','));
    var target = sleeping.filter(function (p) { return G.canSwapIn(p); })[0];
    ok('入替：1個降ろせば載る部品がある', !!target,
      sleeping.map(function (p) { return p.pid + ':' + G.canSwapIn(p); }).join(' '));

    if (target) {
      ok('入替：そのままでは載らない', G.fitsAsIs(target) === false);
      var plan = G.swapPlan(target);
      ok('入替：降ろす相手と、前後の性能が出る',
        !!plan && !!plan.drop && plan.before.dps > 0 && plan.after.dps > 0,
        plan ? plan.drop.pid + ' ' + r2(plan.before.dps) + '→' + r2(plan.after.dps) : 'なし');

      /* 実際に入れ替わること。降ろしたほうは倉庫へ */
      var dropUid = plan.drop.uid;
      G.applySwap(target, plan);
      ok('入替：選んだ部品が盤に載る', target.x != null);
      ok('入替：降ろした部品は倉庫へ行く',
        sj.parts.filter(function (p) { return p.uid === dropUid; })[0].x == null);
    }

    /* --- 降ろす相手を選ぶ基準に装甲が入っていること ---
       毎秒火力だけで順位を付けていたころは、火力を持たないエンジンばかり
       降ろす提案になり、実測で 火力 30.6→38.4 の裏で 装甲 128→88 まで落ちていた */
    G.startRun('ch_apc');
    var before = G.carScore();
    var eng = G.state().parts.filter(function (p) { return p.pid === 'e_v6'; })[0];
    var ex = eng.x, ey = eng.y;
    eng.x = null; eng.y = null;
    var after = G.carScore();
    eng.x = ex; eng.y = ey;
    ok('入替：エンジンを降ろすと車の評価は下がる（装甲を見ている）', after < before,
      r2(before) + ' → ' + r2(after));

    /* --- カードに「いまの車にどう載るか」が出る --- */
    G.startRun('ch_ogre');
    var fi1 = G.fitInfo('u_ammo');
    ok('入替：空きがあるときは「そのまま載る」', fi1 && fi1.kind === 'fit', fi1 && fi1.kind);

    G.startRun('ch_jeep');
    ['m_105', 's_hmg', 'u_sight', 'u_ammo', 'c_takumi'].forEach(function (p) { G.give(p); });
    var fi2 = G.fitInfo('s_flame');
    ok('入替：埋まっているときは入れ替えの案内になる',
      fi2 && (fi2.kind === 'swap' || fi2.kind === 'swapdown') && fi2.deltas && fi2.deltas.length > 0,
      fi2 && fi2.kind + ' / ' + fi2.text);
    /* 同じ部品を持っていると「自分と入れ替える」案が出る。
       それを「降ろせば載る」と書くと、勧めているように読めてしまう */
    var dup = G.fitInfo('u_ammo');
    ok('入替：強くならない案は勧める書き方をしない',
      dup && dup.kind === 'swapdown' && dup.text.indexOf('降ろせば載る') < 0,
      dup && dup.kind + ' / ' + dup.text);
    var fi3 = G.fitInfo('m_how');
    ok('入替：1個降ろしても入らない大きさは、そう書く', fi3 && fi3.kind === 'no',
      fi3 && fi3.kind + ' / ' + fi3.text);

    /* --- 整備画面に、倉庫の中身が何個載せられるか出る --- */
    G.state().map.cur = null;
    G.renderGarage();
    var sct = document.getElementById('stash-count').textContent;
    ok('入替：倉庫の見出しに「入れ替えれば載る」件数が出る',
      /入れ替えれば載る/.test(sct), sct);
    ok('入替：倉庫の部品に印が付く',
      document.querySelectorAll('#stash .ss-item.is-swappable').length > 0);

    /* --- 埋まったマスへ落とすと入れ替わる（以前は拒否音が鳴るだけだった） --- */
    var si = document.querySelector('#stash .ss-item');
    var gi = document.querySelector('#grid .ss-item');
    if (si && gi && si.getBoundingClientRect().width > 0) {
      var sr = si.getBoundingClientRect(), gr = gi.getBoundingClientRect();
      var heldPid = G.state().parts.filter(function (p) {
        return String(p.uid) === si.dataset.uid;
      })[0].pid;
      var victimUid = gi.dataset.uid;
      function pe(type, node, x, y) {
        node.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, clientX: x, clientY: y,
          pointerId: 1, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1
        }));
      }
      var sx = sr.left + sr.width / 2, sy = sr.top + sr.height / 2;
      var gx = gr.left + gr.width / 2, gy = gr.top + gr.height / 2;
      pe('pointerdown', si, sx, sy);
      pe('pointermove', document, gx, gy);
      pe('pointerup', document, gx, gy);
      var victim = G.state().parts.filter(function (p) { return String(p.uid) === victimUid; })[0];
      var moved = G.state().parts.filter(function (p) {
        return p.pid === heldPid && p.x != null;
      }).length > 0;
      ok('入替：埋まったマスへ落とすと入れ替わる', moved && victim.x == null,
        '載った=' + moved + ' 降りた=' + (victim.x == null));
    }

    /* --- 受け取った部品が入らないときは、その場で聞く --- */
    G.startRun('ch_jeep');
    ['m_105', 's_hmg', 'u_sight', 'u_ammo'].forEach(function (p) { G.give(p); });
    var n0 = G.state().parts.length;
    G.takePart('c_takumi', function () { });
    var asked = !document.getElementById('swap-ask').hidden;
    ok('入替：入らない部品を取ると、その場で入れ替えを聞く', asked);
    if (asked) {
      G.closeSwapAsk(false);
      var got = G.state().parts[G.state().parts.length - 1];
      ok('入替：「倉庫に置いておく」を選べば倉庫に残る（押しつけない）',
        got.pid === 'c_takumi' && got.x == null);
      ok('入替：聞いたあとダイアログは閉じる', document.getElementById('swap-ask').hidden);
    }
    ok('入替：取った部品はちゃんと増えている', G.state().parts.length === n0 + 1);

    /* そのまま載るときは聞かない（毎回止められると邪魔になる） */
    G.startRun('ch_ogre');
    G.takePart('u_ammo', function () { });
    ok('入替：そのまま載るときは聞かずに積む',
      document.getElementById('swap-ask').hidden &&
      G.state().parts[G.state().parts.length - 1].x != null);

    /* ---------- 組んだ車がそのまま戦う（盤を主役にする） ----------
       戦闘画面に盤が無く、武器名のリストになっていた。
       プレイヤーが作るものは盤そのものなのに、いちばん肝心な場面で消えていて、
       「自分が置いたものがこう働いた」が文字でしか返ってこなかった */

    G.startRun('ch_apc');
    ['m_105', 's_hmg', 'u_sight'].forEach(function (pp) { G.give(pp); });
    G.warpTo('battle');
    var board = document.getElementById('battle-me');
    var placedN = G.state().parts.filter(function (pp) { return pp.x != null; }).length;

    ok('盤：戦闘画面に盤が出る',
      !!board.querySelector('.ss-sgrid'));
    ok('盤：戦闘の盤に、整備で置いた部品が全部載っている',
      board.querySelectorAll('.ss-item').length === placedN,
      board.querySelectorAll('.ss-item').length + ' / ' + placedN);
    ok('盤：マスの数が車体と一致する',
      board.querySelectorAll('.ss-sgridcell').length === 4 * 4,
      String(board.querySelectorAll('.ss-sgridcell').length));

    /* 武器のマスにだけ、弾とリロードの器が付く */
    var gunNodes = board.querySelectorAll('.ss-item.ss-bgun');
    ok('盤：武器のマスだけに弾の表示が付く',
      gunNodes.length === G.battle().guns.length,
      gunNodes.length + ' / ' + G.battle().guns.length);

    G.step(0.4);
    var withRl = [].slice.call(gunNodes).filter(function (n) {
      return parseFloat(n.style.getPropertyValue('--rl')) > 0;
    });
    ok('盤：リロードの進み具合が盤の上で動く', withRl.length > 0,
      [].slice.call(gunNodes).map(function (n) {
        return r2(parseFloat(n.style.getPropertyValue('--rl')) || 0);
      }).join(' '));

    /* 弾が減るのが盤の上で見える。これが見えるので「弾」の案内を消せた */
    var ammoTags = board.querySelectorAll('.ss-bammo');
    ok('盤：残弾が盤の上に出る', ammoTags.length > 0 &&
      [].slice.call(ammoTags).some(function (t) { return /^[0-9]+$/.test(t.textContent); }),
      [].slice.call(ammoTags).map(function (t) { return t.textContent; }).join(' '));

    /* 撃った部品が名指しで光る */
    var fired = false, ft = 0;
    while (G.battle() && !G.battle().over && ft < 20 && !fired) {
      G.step(0.25); ft += 0.25;
      fired = !!document.querySelector('#battle-me .ss-item.is-firing');
    }
    ok('盤：撃った部品が盤の上で光る', fired, ft + '秒まで進めた');

    /* 尽きた武器は盤の上で分かる */
    G.startRun('ch_apc');
    ['e_turbo', 'm_105', 's_hmg'].forEach(function (pp) { G.give(pp); });
    G.warpTo('boss');
    var sawDry = false, dt2 = 0;
    while (G.battle() && !G.battle().over && dt2 < 120 && !sawDry) {
      G.step(0.5); dt2 += 0.5;
      sawDry = !!document.querySelector('#battle-me .ss-item.is-dry');
    }
    ok('盤：弾が尽きた武器が盤の上で分かる（案内を消せた根拠）', sawDry, dt2 + '秒まで進めた');

    /* 熱は整備画面と同じ見え方にする。別の絵にすると結びつかない */
    G.startRun('ch_jeep');
    ['m_105', 'm_how', 's_hmg', 'e_turbo'].forEach(function (pp) { G.give(pp); });
    var hotInGarage = G.build().weapons.filter(function (w) { return w.heatTier; }).length;
    G.warpTo('battle');
    var hotOnBoard = document.querySelectorAll('#battle-me .ss-item.is-warm, #battle-me .ss-item.is-hot').length;
    ok('盤：熱の色が戦闘の盤にも出る（整備と同じ見え方）',
      hotInGarage === 0 || hotOnBoard > 0, '整備=' + hotInGarage + ' 戦闘=' + hotOnBoard);

    /* 車体選択で「盤の形」が見える。これが見えるので「塞がったマス」の案内を消せた */
    G.renderPick();
    var picks = document.querySelectorAll('#pick-list .ss-sgrid');
    ok('盤：車体選択に盤の形が出る', picks.length === D.chassis.length,
      picks.length + ' / ' + D.chassis.length);
    ok('盤：車体選択で塞がったマスも見える（案内を消せた根拠）',
      document.querySelectorAll('#pick-list .ss-sgridcell.is-blocked').length > 0,
      String(document.querySelectorAll('#pick-list .ss-sgridcell.is-blocked').length));

    /* 盤がはみ出すとページ全体に横スクロールが出る。実際に重戦車で出した */
    G.startRun('ch_ogre');
    G.state().map.cur = null;
    G.renderGarage();
    ok('盤：整備の盤が横スクロールを起こさない',
      document.documentElement.scrollWidth <= window.innerWidth + 1,
      document.documentElement.scrollWidth + ' / ' + window.innerWidth);
    G.warpTo('boss');
    ok('盤：戦闘の盤が横スクロールを起こさない',
      document.documentElement.scrollWidth <= window.innerWidth + 1,
      document.documentElement.scrollWidth + ' / ' + window.innerWidth);
    finish(G);

    /* ---------- 遊びの中で教える案内 ----------
       画面はv5.9まで積み上げたのに、教える場面は初版の2つ（整備・戦闘）のまま
       だった。足りないぶんを説明文へ逃がした結果、タイトルに5行・あそびかたに
       22見出し＝1,573字になり、読まない人には何も伝わっていなかった。
       文面と条件を1か所（TIPS / TIP_ORDER）に集めたので、ここで縛る */

    var tutBak = JSON.parse(JSON.stringify(G.meta().tut || {}));
    function clearTut() {
      var t = G.meta().tut;
      Object.keys(t).forEach(function (k) { if (k.indexOf('tip_') === 0) delete t[k]; });
    }
    var tipKeys = Object.keys(G.tips);

    ok('案内：文面が全部そろっている',
      tipKeys.every(function (k) {
        var t = G.tips[k];
        return t && t.text && t.text.length > 10 && /^(garage|map|log)$/.test(t.at);
      }),
      tipKeys.join(','));

    /* 順番表から漏れた帯の案内は、条件を満たしても永久に出ない */
    ok('案内：帯に出るものは全部 TIP_ORDER に載っている',
      tipKeys.filter(function (k) { return G.tips[k].at !== 'log'; })
        .every(function (k) { return G.tipOrder.indexOf(k) >= 0; }),
      G.tipOrder.join(','));

    ok('案内：戦闘中のものはログに出す（画面を止めない）',
      tipKeys.filter(function (k) { return G.tips[k].at === 'log'; }).length >= 1 &&
      !document.getElementById('log-tip'));

    /* 案内は減らす方向で維持する。⑧で盤を戦闘に出したことで、
       弾（dry）と塞がったマス（blocked）は遊べば分かるようになったので消した。
       増え直したら気づけるように上限を縛る */
    ok('案内：案内の数を増やさない（4つまで）', tipKeys.length <= 4, tipKeys.join(','));
    ok('案内：弾と塞がったマスの案内は消したまま',
      !G.tips.dry && !G.tips.blocked, tipKeys.join(','));

    clearTut();
    ok('案内：条件を満たしていないものは出ない',
      G.pickTip('garage', { heat: false }) === null);

    /* 同時に満たしても1つだけ。並べて出すと読まれない */
    var first = G.pickTip('map', { map: true, elite: true });
    ok('案内：同時に条件を満たしても1つしか選ばれない', first === 'map', 'got=' + first);

    G.meta().tut.tip_map = true;
    ok('案内：閉じたものは二度と選ばれない（次の案内に進む）',
      G.pickTip('map', { map: true, elite: true }) === 'elite');
    G.meta().tut.tip_elite = true;
    ok('案内：全部見たあとは何も出ない',
      G.pickTip('map', { map: true, elite: true }) === null);

    /* 最初の案内（ドラッグの説明）と重ねない */
    clearTut();
    ok('案内：最初の案内が出ている間は帯を出さない',
      G.renderTip('garage', null) === null &&
      document.getElementById('garage-tip').hidden);

    clearTut();
    ok('案内：マップを開いたら道の見方を出す',
      G.pickTip('map', { map: true, elite: true }) === 'map');
    G.meta().tut.tip_map = true;
    ok('案内：賞金首が見えたら改造のことを出す',
      G.pickTip('map', { map: true, elite: true }) === 'elite');

    /* ログの案内は1度きり。毎回繰り返されると邪魔になる */
    clearTut();
    G.startRun('ch_apc');
    G.warpTo('battle');
    ok('案内：ログの案内は1度だけ',
      G.tipLog('behavior') === true && G.tipLog('behavior') === false);

    /* 敵の挙動は、発動した瞬間に1度だけ */
    clearTut();
    G.startRun('ch_apc');
    G.warpTo('battle');
    G.battle().bv = { armorPerHit: 1, armorMax: 9 };
    var bt3 = 0;
    while (G.battle() && !G.battle().over && bt3 < 60 && !G.meta().tut.tip_behavior) {
      G.step(0.5); bt3 += 0.5;
    }
    ok('案内：敵が独自の動きをしたら教える', !!G.meta().tut.tip_behavior, bt3 + '秒まで進めた');

    /* 読ませる側を減らしたことの確認。増やし直すと静かに元へ戻るので縛る */
    ok('案内：タイトルに読ませる箇条書きを置かない',
      !document.querySelector('#sc-title .ss-rules'));

    G.meta().tut = tutBak;

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
