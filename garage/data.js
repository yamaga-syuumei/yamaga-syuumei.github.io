/* ==========================================================
   ゲームデータ

   .json ではなく .js に置く。file:// で開いたときに fetch が
   通らないため（tank/ と同じ理由）。

   数値はすべて仮。遊んでから調整する前提で、一箇所にまとめてある。
   ========================================================== */
window.GAME_DATA = (function () {
  'use strict';

  /* ==========================================================
     車体（＝キャラ）
     グリッドそのもの。ここに部品を敷き詰める。
     cap  … 積載量の土台。部品の重さ合計がこれを超えると速度が落ちる
     def  … 被弾1回ごとに引く固定値
     spd  … 全体速度の補正
     ========================================================== */
  var chassis = [
    {
      id: 'ch_jeep', name: '幌付きジープ「サソリ」', cols: 4, rows: 3,
      cap: 28, hp: 88, def: 3, spd: 0.22, color: '#b8823a',
      blocked: ['3,0'],
      note: '装甲は薄いが、全武器の手数がとにかく多い。'
    },
    {
      id: 'ch_apc', name: '装甲車「ハンマー」', cols: 4, rows: 4,
      cap: 30, hp: 85, def: 4, spd: 0, color: '#5f7a52',
      blocked: ['0,0', '3,3'],
      note: '全部そこそこ。迷ったらこれ。'
    },
    {
      id: 'ch_ogre', name: '重戦車「オーガ」', cols: 5, rows: 4,
      cap: 42, hp: 118, def: 7, spd: -0.14, color: '#6d6f7a',
      blocked: ['0,0', '4,0', '0,3'],
      note: '重い砲を積める。そのぶん動きは鈍い。'
    }
  ];

  /* ==========================================================
     部品

     shape … '#' が占有マス。回転できる
     kind  … engine / cunit / main / sub / special / support
     stats
       cap    積載量+
       hp     装甲（体力）+
       spd    速度+（割合）
       dmg    威力
       ammo   弾数（null で無限）
       reload 発射間隔（秒）
       pierce 装甲貫通（相手の装甲値をこのぶん無視）
     aura  … 隣接する武器へ効く。dmg / ammo / reload（割合）
     ========================================================== */
  var parts = [
    /* ---------- エンジン：積載と装甲を生む ---------- */
    { id: 'e_v6', name: 'V6ガソリン機関', kind: 'engine', shape: ['##'],
      weight: 4, price: 60, tier: 1, color: '#7c8a99',
      stats: { cap: 12, hp: 40 },
      note: '積載+12 / 装甲+40' },

    { id: 'e_turbo', name: 'ターボディーゼル', kind: 'engine', shape: ['#', '#'],
      weight: 6, price: 120, tier: 2, color: '#6f93a8',
      stats: { cap: 18, hp: 52, spd: 0.06 },
      note: '積載+18 / 装甲+52 / 速度+6%' },

    { id: 'e_titan', name: '重機関タイタン', kind: 'engine', shape: ['##', '##'],
      weight: 10, price: 175, tier: 3, color: '#8b6f4e',
      stats: { cap: 28, hp: 105 },
      note: '積載+28 / 装甲+105。重い' },

    /* ---------- Cユニット：全体速度 ---------- */
    { id: 'c_mk1', name: 'Cユニット MkI', kind: 'cunit', shape: ['#'],
      weight: 2, price: 70, tier: 1, color: '#4f9d7a',
      stats: { spd: 0.13 },
      note: '全装備の速度+13%' },

    { id: 'c_takumi', name: 'Cユニット 匠', kind: 'cunit', shape: ['##'],
      weight: 4, price: 165, tier: 3, color: '#57c79a',
      stats: { spd: 0.28 },
      note: '全装備の速度+28%' },

    /* ---------- 主砲：弾有限・威力中・リロード中 ---------- */
    { id: 'm_76', name: '76mm速射砲', kind: 'main', shape: ['##'],
      weight: 5, price: 80, tier: 1, color: '#9aa3ad',
      stats: { dmg: 13, ammo: 20, reload: 2.0, pierce: 1 },
      note: '威力13 / 弾20 / 2.0秒 / 貫通1' },

    { id: 'm_105', name: '105mmライフル砲', kind: 'main', shape: ['###'],
      weight: 8, price: 155, tier: 2, color: '#8e9aa6',
      stats: { dmg: 27, ammo: 14, reload: 3.2, pierce: 2 },
      note: '威力27 / 弾14 / 3.2秒 / 貫通2' },

    { id: 'm_how', name: '155mm榴弾砲', kind: 'main', shape: ['##', '##'],
      weight: 12, price: 215, tier: 3, color: '#7f8a96',
      stats: { dmg: 42, ammo: 9, reload: 4.6, pierce: 2 },
      note: '威力42 / 弾9 / 4.6秒 / 貫通2' },

    /* ---------- 副砲：弾無限・威力低・リロード速い ---------- */
    { id: 's_mg', name: '7.62mm機関銃', kind: 'sub', shape: ['##'],
      weight: 3, price: 50, tier: 1, color: '#6b7480',
      stats: { dmg: 5, ammo: null, reload: 0.8 },
      note: '威力5 / 弾∞ / 0.8秒' },

    { id: 's_hmg', name: '12.7mm重機関銃', kind: 'sub', shape: ['##'],
      weight: 5, price: 105, tier: 2, color: '#5d6b7c',
      stats: { dmg: 9, ammo: null, reload: 1.4 },
      note: '威力9 / 弾∞ / 1.4秒' },

    { id: 's_flame', name: '火炎放射器', kind: 'sub', shape: ['#', '#'],
      weight: 4, price: 95, tier: 2, color: '#c2612c',
      stats: { dmg: 4, ammo: null, reload: 0.55, pierce: 2 },
      note: '威力4 / 弾∞ / 0.55秒 / 貫通2' },

    /* ---------- スペシャル：弾少・威力高・リロード遅い ---------- */
    { id: 'sp_missile', name: 'ミサイルポッド', kind: 'special', shape: ['##'],
      weight: 7, price: 195, tier: 2, color: '#a44a4a',
      stats: { dmg: 48, ammo: 5, reload: 6.0, pierce: 3 },
      note: '威力48 / 弾5 / 6.0秒 / 貫通3' },

    { id: 'sp_rail', name: 'レールキャノン', kind: 'special', shape: ['###'],
      weight: 11, price: 275, tier: 3, color: '#7a5ec2',
      stats: { dmg: 88, ammo: 3, reload: 9.0, pierce: 99 },
      note: '威力88 / 弾3 / 9.0秒 / 装甲を完全に無視' },

    /* ---------- 補助：隣に置いた武器へ効く ---------- */
    { id: 'u_ammo', name: '弾薬箱', kind: 'support', shape: ['#'],
      weight: 2, price: 65, tier: 1, color: '#b09030',
      aura: { ammo: 4 },
      note: '隣接する武器の弾+4' },

    { id: 'u_cool', name: '冷却器', kind: 'support', shape: ['#'],
      weight: 2, price: 95, tier: 2, color: '#4a86b8',
      aura: { reload: -0.18 },
      note: '隣接する武器のリロード-18%' },

    { id: 'u_sight', name: '照準装置', kind: 'support', shape: ['#'],
      weight: 2, price: 110, tier: 2, color: '#c0392b',
      aura: { dmgPct: 0.4 },
      note: '隣接する武器の威力+40%' }
  ];

  /* ==========================================================
     消耗品

     企画書の「消耗品：特殊弾 / タイルパック / 追加弾」。
     グリッドには置かず、持ち物として別に持つ。
     effect
       pierce  次の戦闘のあいだ、全武器の貫通+n
       ammo    次の戦闘のあいだ、全武器の弾+n
       tile    使うと車体の塞がったマスを1つ開ける（永続）
       repair  装甲を回復
     ========================================================== */
  var items = [
    { id: 'i_ap', name: '徹甲弾', price: 70, color: '#c0a040',
      effect: { pierce: 3 },
      note: '次の戦闘のあいだ、全武器の貫通+3' },

    { id: 'i_mag', name: '追加弾倉', price: 60, color: '#8a8f5a',
      effect: { ammo: 5 },
      note: '次の戦闘のあいだ、全武器の弾+5' },

    { id: 'i_tile', name: 'タイルパック', price: 130, color: '#5f92b8',
      effect: { tile: 1 },
      note: '車体の塞がったマスを1つ開ける（永続）' },

    { id: 'i_patch', name: '応急パッチ', price: 55, color: '#b8564a',
      effect: { repair: 0.35 },
      note: '装甲を最大値の35%回復する' }
  ];

  /* ==========================================================
     敵
     armor … 1発ごとに引く固定値。副砲だけの構成を刺しにいく数値
     ========================================================== */
  var enemies = [
    { id: 'en_drone', name: '野良ドローン', tier: 'mob',
      hp: 76, armor: 0, atk: 7, interval: 2.4, gold: 24, art: 'drone', minFloor: 0 },

    { id: 'en_buggy', name: '砂賊のバギー', tier: 'mob',
      hp: 115, armor: 1, atk: 12, interval: 3.2, gold: 28, art: 'buggy', minFloor: 0 },

    { id: 'en_golem', name: '廃車ゴーレム', tier: 'mob',
      hp: 185, armor: 4, atk: 17, interval: 4.2, gold: 36, art: 'golem', minFloor: 3 },

    { id: 'en_sniper', name: '自走砲スナイプ', tier: 'mob',
      hp: 130, armor: 2, atk: 26, interval: 5.5, gold: 38, art: 'sniper', minFloor: 2 },

    { id: 'en_stag', name: '賞金首「鉄クワガタ」', tier: 'elite',
      hp: 380, armor: 4, atk: 17, interval: 3.4, gold: 110, art: 'stag',
      trait: '装甲が厚い。貫通か、重い一発が要る' },

    { id: 'en_leech', name: '賞金首「砂ヒル」', tier: 'elite',
      hp: 460, armor: 1, atk: 11, interval: 1.7, gold: 120, art: 'leech',
      trait: '手数で削ってくる。短期決戦を狙いたい' },

    { id: 'en_golgoda', name: '大型戦車「ゴルゴダ」', tier: 'boss',
      hp: 780, armor: 6, atk: 19, interval: 4.6, gold: 240, art: 'golgoda',
      salvo: { every: 15, mult: 2.3 },
      trait: '15秒ごとに一斉射撃。装甲6' }
  ];

  /* ==========================================================
     イベント（マップの「？」）

     ストーリーは持たせない。荒野で拾う一場面と、そこで起きる損得だけ。
     opts は選択肢。effect の中身は game.js が解釈する
       gold      所持金の増減
       hp        装甲の増減（割合。maxHp に対して）
       item      消耗品を1つもらう（id または 'random'）
       part      部品を1つもらう（tier 指定で抽選）
       openCell  塞がったマスを1つ開ける
       weightCut 部品を1つ選んで軽くする
       fight     その場で戦闘（'mob' / 'elite'）
     ========================================================== */
  var events = [
    {
      id: 'ev_wreck', name: '打ち捨てられた車列',
      text: '砂に半分埋まった車列。中身はまだ生きているかもしれないが、' +
            '何かの巣になっている可能性もある。',
      opts: [
        { label: '漁る', note: '部品が手に入る。ただし無傷とは限らない',
          effect: { part: 1, hp: -0.12 } },
        { label: '燃料だけ抜く', note: '安全に少しの金', effect: { gold: 45 } },
        { label: '関わらない', note: '', effect: {} }
      ]
    },
    {
      id: 'ev_mechanic', name: '野良整備士',
      text: '道端で工具箱を広げた男。「安くしとくぜ。ただし現物は見せない」',
      opts: [
        { label: '任せる（60G）', note: '部品を1つ軽くしてもらう',
          effect: { gold: -60, weightCut: 1 } },
        { label: '穴を開けさせる（90G）', note: '車体の塞がったマスを1つ開ける',
          effect: { gold: -90, openCell: 1 } },
        { label: '断る', note: '', effect: {} }
      ]
    },
    {
      id: 'ev_shrine', name: '錆びた祠',
      text: 'ボルトと薬莢が積まれた、誰かの手作りの祠。' +
            '賽銭のつもりか、金がいくらか置いてある。',
      opts: [
        { label: '金を取る', note: '所持金が増えるが、装甲が削れる',
          effect: { gold: 110, hp: -0.18 } },
        { label: '手を合わせる', note: '装甲が回復する', effect: { hp: 0.25 } },
        { label: '通り過ぎる', note: '', effect: {} }
      ]
    },
    {
      id: 'ev_convoy', name: '隊商の落とし物',
      text: '積み荷が一つ、道に転がっている。持ち主はもう見えない。',
      opts: [
        { label: '開ける', note: '消耗品が1つ手に入る', effect: { item: 'random' } },
        { label: '売り払う', note: '中身は見ずに金に換える', effect: { gold: 70 } }
      ]
    },
    {
      id: 'ev_ambush', name: '待ち伏せ',
      text: '岩陰から視線を感じる。もう気づかれている。',
      opts: [
        { label: '迎え撃つ', note: 'その場で戦闘。勝てば戦利品', effect: { fight: 'mob' } },
        { label: '振り切る', note: '装甲を削って逃げる', effect: { hp: -0.15 } }
      ]
    },
    {
      id: 'ev_scrapyard', name: '解体屋の看板',
      text: '「不要な鉄、買い取ります」。倉庫の重りを金に換える気なら、ここだ。',
      opts: [
        { label: '積み荷を整理する', note: '倉庫の部品を全部売って金にする',
          effect: { sellStash: 1 } },
        { label: '何も売らない', note: '', effect: {} }
      ]
    }
  ];

  /* ==========================================================
     進行
     ========================================================== */
  var run = {
    floors: 12,                 // 最上階がボス
    eliteFloors: [5, 9],        // 中ボスが必ず出る階
    startGold: 90,
    /* 階が上がるごとに敵を強くする係数 */
    /* 雑魚だけ階層で強くする。中ボスとボスは固定（もともとその階向けの数値） */
    scaleHp: 0.07,
    scaleAtk: 0.03,
    /* 中ボスは5階の数値を土台にして、そこから上でだけ強くする */
    eliteBaseFloor: 4,
    eliteScaleHp: 0.09,
    eliteScaleAtk: 0.04
  };

  return { chassis: chassis, parts: parts, items: items, events: events, enemies: enemies, run: run };
})();
