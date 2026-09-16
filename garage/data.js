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
     cool … 全マスの排熱の増減。幌付きは風が通り、密閉された重戦車はこもる
     ammo … 弾数のある武器の弾+。手数の多い車ほど弾を食うので、そのぶん積める
     ========================================================== */
  var chassis = [
    {
      id: 'ch_jeep', name: '幌付きジープ「サソリ」', cols: 4, rows: 3,
      cap: 28, hp: 88, def: 3, spd: 0.22, cool: 0.8, ammo: 2, color: '#b8823a',
      blocked: ['3,0'],
      note: '装甲は薄いが手数が多い。幌付きで風が通り熱に強く、荷台に弾を多く積める。'
    },
    {
      id: 'ch_apc', name: '装甲車「ハンマー」', cols: 4, rows: 4,
      cap: 30, hp: 85, def: 4, spd: 0, cool: 0, color: '#5f7a52',
      blocked: ['0,0', '3,3'],
      note: '全部そこそこ。迷ったらこれ。'
    },
    {
      id: 'ch_ogre', name: '重戦車「オーガ」', cols: 5, rows: 4,
      cap: 42, hp: 118, def: 7, spd: -0.14, cool: -0.4, color: '#6d6f7a',
      blocked: ['0,0', '4,0', '0,3'],
      note: '重い砲を積める。動きは鈍く、密閉されていて熱がこもりやすい。'
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
       heat   1発ごとの発熱。強い武器ほど熱い
     aura  … 隣接する武器へ効く。dmgPct / ammo / reload（割合）
     cool  … 隣接するマスの排熱を上げる（冷却器）

     熱について
       武器は占めるマス全部に heat/reload（毎秒）の熱を出す。
       マスの排熱は「基本 + 外気に触れている辺 + 隣接する冷却器」。
       足りないぶん（net）がそのマスの武器のリロードを伸ばす。
       → 強い武器を固めると共倒れする。詳しくは README の「熱」
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
      stats: { dmg: 13, ammo: 10, reload: 2.0, pierce: 1, heat: 5 },
      note: '威力13 / 弾10 / 2.0秒 / 貫通1' },

    { id: 'm_105', name: '105mmライフル砲', kind: 'main', shape: ['###'],
      weight: 8, price: 155, tier: 2, color: '#8e9aa6',
      stats: { dmg: 27, ammo: 5, reload: 3.2, pierce: 2, heat: 9 },
      note: '威力27 / 弾5 / 3.2秒 / 貫通2' },

    { id: 'm_how', name: '155mm榴弾砲', kind: 'main', shape: ['##', '##'],
      weight: 12, price: 215, tier: 3, color: '#7f8a96',
      stats: { dmg: 65, ammo: 3, reload: 4.6, pierce: 2, heat: 15 },
      note: '威力65 / 弾3 / 4.6秒 / 貫通2。数発で黙るが一撃が重い' },

    /* ---------- 副砲：弾無限・威力低・リロード速い ---------- */
    { id: 's_mg', name: '7.62mm機関銃', kind: 'sub', shape: ['##'],
      weight: 3, price: 50, tier: 1, color: '#6b7480',
      stats: { dmg: 5, ammo: null, reload: 0.8, heat: 1.2 },
      note: '威力5 / 弾∞ / 0.8秒' },

    { id: 's_hmg', name: '12.7mm重機関銃', kind: 'sub', shape: ['##'],
      weight: 5, price: 105, tier: 2, color: '#5d6b7c',
      stats: { dmg: 9, ammo: null, reload: 1.4, pierce: 1, heat: 2.5 },
      note: '威力9 / 弾∞ / 1.4秒 / 貫通1。主砲が尽きたあとを支える' },

    { id: 's_flame', name: '火炎放射器', kind: 'sub', shape: ['#', '#'],
      weight: 4, price: 95, tier: 2, color: '#c2612c',
      stats: { dmg: 4, ammo: null, reload: 0.55, pierce: 2, heat: 1.3 },
      note: '威力4 / 弾∞ / 0.55秒 / 貫通2' },

    /* ---------- スペシャル：弾少・威力高・リロード遅い ---------- */
    { id: 'sp_missile', name: 'ミサイルポッド', kind: 'special', shape: ['##'],
      weight: 7, price: 195, tier: 2, color: '#a44a4a',
      stats: { dmg: 75, ammo: 2, reload: 6.0, pierce: 3, heat: 20 },
      note: '威力75 / 弾2 / 6.0秒 / 貫通3。弾薬箱と組ませたい' },

    { id: 'sp_rail', name: 'レールキャノン', kind: 'special', shape: ['###'],
      weight: 11, price: 275, tier: 3, color: '#7a5ec2',
      stats: { dmg: 140, ammo: 1, reload: 9.0, pierce: 99, heat: 40 },
      note: '威力140 / 弾1 / 9.0秒 / 装甲を完全に無視。弾薬箱が要る' },

    /* ---------- 補助：隣に置いた武器へ効く ---------- */
    { id: 'u_ammo', name: '弾薬箱', kind: 'support', shape: ['#'],
      weight: 2, price: 65, tier: 1, color: '#b09030',
      aura: { ammo: 4 },
      note: '隣接する武器の弾+4。弾の少ない重い砲ほど化ける' },

    { id: 'u_cool', name: '冷却器', kind: 'support', shape: ['#'],
      weight: 2, price: 95, tier: 2, color: '#4a86b8',
      cool: 2.5,
      note: '隣接するマスの排熱+2.5。熱のこもる置き方を救う' },

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
     behavior … 戦い方を要求する挙動。乱数は入れない。
       speedUp     毎秒この割合だけ攻撃間隔が縮む（下限は元の45%）→ 速攻を要求
       dodgeEvery  この発数ごとに1発を回避する → 重い一撃ほど損。手数を要求
       armorPerHit 被弾するたび装甲+1（armorMax まで）→ 手数ほど自分で硬くする
       armorPerSec 毎秒この量だけ装甲が増える（armorMax まで）→ 瞬発力を要求
       regen       毎秒この量だけ回復する → 削り続けても追いつかない。瞬発力を要求
     bnote … その挙動の一言説明。マップ・戦闘・図鑑にそのまま出す
     ========================================================== */
  /* ==========================================================
     敵

     behavior … その敵がずっとやっていること（⑤で入れた。先に見せてよい）
     trumps   … 切り札。**戦闘ごとに1枚だけ引く**（⑨で入れた）

     切り札を入れた理由：戦闘に乱数が一つも無く、同じ構成で同じ敵と戦うと
     ボス戦10回が 27.75秒・残装甲0% で完全に同一だった。
     ノードを押した瞬間に結果が決まっていて、二度と変わらなかった。

     装甲が半分を切ったときに1回だけ発動する（短い戦闘でも必ず起きる）。
     **何を引いたかは事前に見せない。** 出してしまうと予想外でなくなる。

     effect で使えるもの（game.js の fireTrump が解釈する）
       heal      いまの最大HPに対する割合を回復
       hasten    攻撃間隔の倍率（小さいほど速い）
       atkMult   攻撃力の倍率
       armorAdd  装甲を足す
       missFor   この秒数だけ、こちらの弾が当たらない
       selfCut   自分の残りHPをこの割合だけ捨てる（特攻用）
       bigHit    その場で即座に この倍率の一撃を入れる
     ========================================================== */
  var enemies = [
    { id: 'en_drone', name: '野良ドローン', tier: 'mob',
      hp: 86, armor: 0, atk: 6, interval: 2.4, gold: 26, art: 'drone', minFloor: 0,
      behavior: { speedUp: 0.035 },
      bnote: '放っておくと加速する。長引くほど手がつけられない',
      trumps: [
        { id: 'tr_boost', name: '過給', log: 'ローターを回し切った。動きが跳ね上がる',
          effect: { hasten: 0.78 } },
        { id: 'tr_dive', name: '自爆突進', log: '機体ごと突っ込んできた',
          effect: { selfCut: 0.35, bigHit: 1.5 } },
        { id: 'tr_wing', name: '僚機を呼ぶ', log: '砂の向こうから僚機が降りてきた',
          effect: { heal: 0.18, hasten: 0.85 } }
      ] },

    { id: 'en_buggy', name: '砂賊のバギー', tier: 'mob',
      hp: 116, armor: 1, atk: 9, interval: 3.2, gold: 30, art: 'buggy', minFloor: 0,
      behavior: { dodgeEvery: 4 },
      bnote: '4発に1発を避ける。重い一撃ほど損をする',
      trumps: [
        { id: 'tr_smoke', name: '煙幕', log: '煙幕を焚いた。しばらく弾が通らない',
          effect: { missFor: 2.6 } },
        { id: 'tr_gang', name: '増援', log: '仲間のバギーが土煙を上げて合流した',
          effect: { heal: 0.18, hasten: 0.82 } },
        { id: 'tr_ram', name: '特攻', log: '車体をこちらへ向けて突っ込んできた',
          effect: { selfCut: 0.3, bigHit: 1.45 } }
      ] },

    { id: 'en_golem', name: '廃車ゴーレム', tier: 'mob',
      hp: 150, armor: 3, atk: 13, interval: 4.2, gold: 40, art: 'golem', minFloor: 4,
      behavior: { armorPerHit: 1, armorMax: 2 },
      bnote: '撃たれるたびに鉄屑を寄せて硬くなる。手数では固まるだけ',
      trumps: [
        { id: 'tr_plate', name: '装甲板を展開', log: '廃車の扉をかき集めて前面に貼りつけた',
          effect: { armorAdd: 6 } },
        { id: 'tr_eat', name: '鉄屑を取り込む', log: '足元の鉄屑を巻き込んで膨れ上がった',
          effect: { heal: 0.2 } },
        { id: 'tr_crush', name: '圧壊', log: '腕を振り上げた。一撃が重くなる',
          effect: { atkMult: 1.35 } }
      ] },

    { id: 'en_sniper', name: '自走砲スナイプ', tier: 'mob',
      hp: 172, armor: 2, atk: 17, interval: 5.5, gold: 42, art: 'sniper', minFloor: 2,
      bnote: '一撃が重い。次の攻撃までのゲージを見て、その前に倒す',
      trumps: [
        { id: 'tr_rapid', name: '速射モード', log: '砲身を下げた。連射に切り替えてきた',
          effect: { hasten: 0.6, atkMult: 0.75 } },
        { id: 'tr_he', name: '曳火弾', log: '曳火弾を装填した。次から当たりが重い',
          effect: { atkMult: 1.3 } },
        { id: 'tr_move', name: '陣地転換', log: '砂丘の陰へ下がって撃ち直してきた',
          effect: { heal: 0.16, armorAdd: 3 } }
      ] },

    { id: 'en_stag', name: '賞金首「鉄クワガタ」', tier: 'elite',
      hp: 275, armor: 4, atk: 15, interval: 3.4, gold: 110, art: 'stag',
      behavior: { armorPerSec: 0.3, armorMax: 12 },
      bnote: '時間とともに殻が厚くなる。長引くほど通らなくなる',
      trait: '装甲が厚い。貫通か、重い一発が要る',
      trumps: [
        { id: 'tr_harden', name: '甲殻硬化', log: '殻を鳴らして締め上げた',
          effect: { armorAdd: 7 } },
        { id: 'tr_molt', name: '脱皮', log: '古い殻を割って、下から新しい体が出てきた',
          effect: { heal: 0.22 } },
        { id: 'tr_charge', name: '大顎突撃', log: '大顎を広げて突っ込んできた',
          effect: { selfCut: 0.2, bigHit: 2.2 } }
      ] },

    { id: 'en_leech', name: '賞金首「砂ヒル」', tier: 'elite',
      hp: 335, armor: 1, atk: 10, interval: 1.7, gold: 120, art: 'leech',
      behavior: { regen: 4 },
      bnote: '傷がふさがる（毎秒4回復）。削り続けても追いつかない',
      trait: '手数で削ってくる。短期決戦を狙いたい',
      trumps: [
        { id: 'tr_split', name: '分裂', log: '胴が裂けて、二匹が絡まりながら立ち上がった',
          effect: { heal: 0.28 } },
        { id: 'tr_slime', name: '粘液', log: '粘液を吹きつけてきた。照準が滑る',
          effect: { missFor: 2.8 } },
        { id: 'tr_drain', name: '吸血', log: 'こちらの装甲に噛みついた',
          effect: { atkMult: 1.5, heal: 0.12 } }
      ] },

    { id: 'en_golgoda', name: '大型戦車「ゴルゴダ」', tier: 'boss',
      hp: 780, armor: 5, atk: 14, interval: 4.6, gold: 240, art: 'golgoda',
      salvo: { every: 15, mult: 1.9 },
      bnote: '15秒ごとに一斉射撃',
      trait: '15秒ごとに一斉射撃。装甲6',
      trumps: [
        { id: 'tr_reserve', name: '予備弾倉', log: '砲塔の後ろが開いた。一斉射撃が早まる',
          effect: { salvoFaster: 0.55 } },
        { id: 'tr_skirt', name: '増加装甲', log: '側面に増加装甲を降ろした',
          effect: { armorAdd: 6 } },
        { id: 'tr_swap', name: '主砲換装', log: '主砲を換装した。一撃が別物になる',
          effect: { atkMult: 1.55 } }
      ] }
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
     改造

     賞金首に勝つと3択から1つ選ぶ、車そのものへの恒久変更。
     部品ではないのでマスを使わない。1周で最大2つ（賞金首は5階と9階）。

     **すべてに代償を付ける。** 利点だけの改造を足すと、ただの強化になって
     決断が消える。ここが改造の芯なので、増やすときも必ず代償を書くこと。

     effect
       hp         最大装甲の増減
       def        被弾軽減の増減
       spd        全体速度の増減（加算。0.12 で +12%）
       cellCool   全マスの排熱の増減
       healPct    戦闘に勝ったとき最大装甲の n 割を回復
       ammoFlat   弾数有限の武器の弾 +n
       ammoPct    弾数有限の武器の弾 +n割
       openAll    塞がったマスを全部開ける
     ========================================================== */
  var mods = [
    { id: 'md_kit', name: '補修キット', art: 'tank',
      good: '戦闘に勝つたび装甲が8%回復', bad: '被弾ダメージ +2',
      note: '資材を積み込んで、戦いのあと自分で継ぐ。そのぶん装甲に隙間ができる。',
      effect: { healPct: 0.08, def: -2 } },

    { id: 'md_fin', name: '放熱板', art: 'fin',
      good: '全マスの排熱 +0.7', bad: '最大装甲 −15',
      note: '車体に熱を逃がす羽根を生やす。被弾には弱くなる。',
      effect: { cellCool: 0.7, hp: -15 } },

    { id: 'md_maga', name: '弾薬庫', art: 'maga',
      good: '弾数のある武器の弾 +50%', bad: '全マスの排熱 −0.4',
      note: '弾を詰め込む。熱の逃げ場が減る。',
      effect: { ammoPct: 0.5, cellCool: -0.4 } },

    { id: 'md_frame', name: '軽量フレーム', art: 'frame',
      good: '全装備の速度 +10%', bad: '最大装甲 −20',
      note: '骨格を削って身軽にする。そのぶん打たれ弱くなる。',
      effect: { spd: 0.10, hp: -20 } },

    { id: 'md_crew', name: '複座化', art: 'crew',
      good: '全装備の速度 +12%', bad: '全マスの排熱 −0.5',
      note: '人手を増やして手数を上げる。車内が狭くなって熱がこもる。',
      effect: { spd: 0.12, cellCool: -0.5 } },

    { id: 'md_armor', name: '増加装甲', art: 'armor',
      good: '被弾軽減 +3', bad: '速度 −10%',
      note: '鉄板を貼り増す。重くなって動きが鈍る。',
      effect: { def: 3, spd: -0.10 } },

    { id: 'md_bay', name: '拡張ベイ', art: 'bay',
      good: '塞がったマスが全部開く', bad: '全マスの排熱 −0.5',
      note: '塞いでいた鉄板を剥がす。置ける場所は増えるが、通気口も無くなる。',
      effect: { openAll: true, cellCool: -0.5 } },

    { id: 'md_spare', name: '予備弾倉', art: 'spare',
      good: '弾数のある武器の弾 +4', bad: '被弾軽減 −1',
      note: '弾の少ない砲ほど効く。積む場所を装甲から削り出す。',
      effect: { ammoFlat: 4, def: -1 } }
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
    scaleHp: 0.085,
    scaleAtk: 0.03,
    /* 中ボスは5階の数値を土台にして、そこから上でだけ強くする */
    eliteBaseFloor: 4,
    eliteScaleHp: 0.10,
    eliteScaleAtk: 0.05
  };

  /* ==========================================================
     熱の調整つまみ

     ここを全部0にすれば、熱の無い元の挙動に戻る。
     ========================================================== */
  var heat = {
    cellBase: 2.8,    // どのマスも持っている排熱
    openSide: 1.0,    // 外気に触れている辺1つあたりの排熱（車体の外周・塞がったマスに面した辺）
    spill: 0.5,       // 隣のマス（別の武器）の発熱がこちらへ回り込む割合
    perLevel: 0.5,    // 冷却器を1段強化するごとの排熱+
    softAt: 0,        // これを超えると「加熱」。リロードが伸び始める
    hardAt: 2,        // これを超えると「過熱」
    slowPer: 0.2,     // 超過1あたりリロード +20%
    slowMax: 1.5      // リロードの伸びの上限（最大2.5倍）
  };

  return { chassis: chassis, parts: parts, items: items, events: events, enemies: enemies, mods: mods, run: run, heat: heat };
})();
