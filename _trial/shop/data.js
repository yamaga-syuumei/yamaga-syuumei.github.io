/* ==========================================================
   ハンター向けのショップ：ダミーデータ

   企画書（事業計画/WebGame/WEBゲーム企画_ハンター向けのショップ.md）の
   「システムは数量を固定しない」に従い、ここの配列を増減するだけで
   素材・設計図・ダンジョン・ハンター・出来事・実績の数が変わる。

   本文（世界観・キャラの物語・出来事の中身）は後から差し替える前提の仮置き。
   ---------------------------------------------------------
   価格の持ち方
     素材   buy  = 店がハンターから買い取る値（安い）
            sell = 商人が店に売る値（高い）
     商品   price = 店が客に売る値（固定）
   ========================================================== */
window.SHOP_DATA = {

  /* ---------- 店レベル4系統 ----------
     levels[0] が初期状態。cost は「その段階へ上げるのに要る金」 */
  facilities: {
    saloon: {
      name: '酒場', icon: 'saloon',
      desc: '来る客の数が増える',
      levels: [
        { cost: 0,     hunters: 1, mobs: [2, 4] },
        { cost: 600,   hunters: 2, mobs: [3, 6] },
        { cost: 1800,  hunters: 3, mobs: [4, 8] },
        { cost: 5000,  hunters: 4, mobs: [6, 12] }
      ]
    },
    shop: {
      name: 'ショップ', icon: 'shop',
      desc: '並べられる商品数が増える',
      /* 棚の枠は1日の売上の上限そのもの。ここが狭いと何を作っても頭打ちになる */
      levels: [
        { cost: 0,     slots: 6 },
        { cost: 400,   slots: 9 },
        { cost: 1400,  slots: 12 },
        { cost: 4000,  slots: 16 }
      ]
    },
    workshop: {
      name: '工房', icon: 'workshop',
      desc: '作れる設計図のレベルが上がる',
      levels: [
        { cost: 0,     craft: 1 },
        { cost: 800,   craft: 2 },
        { cost: 2600,  craft: 3 },
        { cost: 6500,  craft: 4 }
      ]
    },
    inn: {
      name: '宿屋', icon: 'inn',
      /* rooms = グレードごとの部屋数。合計が「同時に町に滞在できる組数」になる。
         宿泊料は「何もしなくても入る日銭」。ここが薄いと、金が尽きたときに
         素材を買えず作れず売れない、という一方通行に落ちる */
      desc: '滞在できる組数・部屋の質が上がる',
      levels: [
        { cost: 0,     rooms: { poor: 1 } },
        { cost: 500,   rooms: { poor: 2, normal: 1 } },
        { cost: 1600,  rooms: { poor: 2, normal: 2, fine: 1 } },
        { cost: 4500,  rooms: { poor: 2, normal: 2, fine: 2, suite: 1 } }
      ]
    }
  },

  /* ---------- 部屋のグレード ----------
     ハンターは良い部屋から取り、余った部屋にモブが泊まる。
     良い部屋が増えるほど同じ客数でも売上が上がる */
  roomGrades: [
    { id: 'poor',   name: 'ぼろい部屋',     rate: 60 },
    { id: 'normal', name: '普通の部屋',     rate: 120 },
    { id: 'fine',   name: '高級部屋',       rate: 260 },
    { id: 'suite',  name: 'スイートルーム', rate: 520 }
  ],

  /* ---------- 作成・分解 ----------
     dismantleRate … 分解したときに戻ってくる素材の割合（切り捨て）。
                     1未満にしておかないと、作って分解するだけで素材が増えてしまう */
  craft: {
    dismantleRate: 0.5
  },

  /* ---------- 戦闘の数値 ----------
     ハンターの能力は装備から計算する（式は game.js の hunterStats）。
     ここはその係数。ダンジョンでの到達層と賞金首の討伐は、
     この数値を使って裏で実際に戦闘を回した結果で決まる */
  combat: {
    baseHp: 24,           // ハンターの素のHP
    hpPerBase: 2,         // basePower 1 につき増えるHP
    hpPerGuard: 3,        // 防具・戦車の power 1 につき増えるHP
    healRate: 0.5,        // 消耗品1個で回復する量（最大HPに対する割合）
    healAt: 0.4,          // HPがこの割合を下回ったら消耗品を使う
    floorScale: 0.12      // 1層深くなるごとに敵が強くなる割合
  },

  /* ---------- 素材 ---------- */
  materials: [
    { id: 'scrap',   name: '鉄くず',   icon: 'scrap',   buy: 12,  sell: 22,
      desc: '刃物や砲弾の材料になる、どこにでも落ちている金属くず' },
    { id: 'herb',    name: '苦草',     icon: 'herb',    buy: 8,   sell: 15,
      desc: '合成薬・携行食の材料。荒野のどこにでも生えている' },
    { id: 'oil',     name: '廃油',     icon: 'oil',     buy: 15,  sell: 28,
      desc: '燃料の材料。古い機械の中から抜き取られる' },
    { id: 'spring',  name: 'バネ',     icon: 'spring',  buy: 22,  sell: 40,
      desc: '装甲や砲弾の可動部に使う。頑丈な物ほど高く売れる' },
    { id: 'circuit', name: '回路片',   icon: 'circuit', buy: 48,  sell: 85,
      desc: '銃器・砲・機関の制御に使う。工房レベル2から需要が出る' },
    { id: 'alloy',   name: '軽合金',   icon: 'alloy',   buy: 75,  sell: 130,
      desc: '装甲や主砲の外殻に使う軽くて硬い金属' },
    { id: 'core',    name: '動力核',   icon: 'core',    buy: 210, sell: 360,
      desc: '機関・戦車の心臓部。滅多に出回らない高級素材' }
  ],

  /* ---------- 設計図 ----------
     level  … 工房レベルがこれ以上なら作れる
     price  … 商人が売る値。企画方針どおり「物による」ので個別に置く
     rare   … true の設計図は商人には並ばない。ハンターの持ち帰りでのみ手に入る
              （企画3.5「たまにレアな物を持ち帰る」。世界観：戦車はほとんど出土しない）
     slot   … 装備の枠（weapon / armor / tank / cannon / subgun / engine）
     kind   … consumable（消耗品）/ fuel（燃料・砲弾）/ equip（装備）/ tank（戦車）
     power  … 装備としての強さ
     dur    … 耐久。潜った層の数だけ減り、0で壊れて外れる。
              これがあるので装備は使い捨てになり、買い直しの需要が続く
     product.desc … 効果・役割の説明（棚・在庫・図鑑に表示） */
  blueprints: [
    { id: 'bp_potion', name: '合成薬の設計図', level: 1, price: 300,
      cost: [{ id: 'herb', n: 2 }],
      product: { id: 'potion', name: '合成薬', kind: 'consumable', icon: 'potion', price: 45,
        desc: '回転の速い消耗品。ハンターが潜り続けられるかに効く' } },

    { id: 'bp_ration', name: '携行食の設計図', level: 1, price: 240,
      cost: [{ id: 'herb', n: 1 }, { id: 'scrap', n: 1 }],
      product: { id: 'ration', name: '携行食', kind: 'consumable', icon: 'ration', price: 32,
        desc: '安価な消耗品。日銭を稼ぐための回転商品' } },

    { id: 'bp_fuel', name: '燃料の設計図', level: 1, price: 420,
      cost: [{ id: 'oil', n: 2 }],
      product: { id: 'fuel', name: '燃料', kind: 'fuel', icon: 'fuel', price: 70,
        desc: '戦車持ちのハンターが宿泊のたびに買っていく継続商材' } },

    { id: 'bp_shell', name: '砲弾の設計図', level: 2, price: 1100,
      cost: [{ id: 'scrap', n: 2 }, { id: 'spring', n: 1 }],
      product: { id: 'shell', name: '砲弾', kind: 'fuel', icon: 'shell', price: 110,
        desc: '戦車持ちのハンターが宿泊のたびに買っていく継続商材' } },

    { id: 'bp_knife', name: '鉄のナイフの設計図', level: 1, price: 500,
      cost: [{ id: 'scrap', n: 3 }],
      product: { id: 'knife', name: '鉄のナイフ', kind: 'equip', slot: 'weapon', icon: 'knife', price: 260, power: 6, dur: 12,
        desc: '最初の武器。挑めるダンジョンを引き上げる' } },

    { id: 'bp_jacket', name: '鉄板ジャケットの設計図', level: 1, price: 560,
      cost: [{ id: 'scrap', n: 2 }, { id: 'spring', n: 1 }],
      product: { id: 'jacket', name: '鉄板ジャケット', kind: 'equip', slot: 'armor', icon: 'armor', price: 300, power: 5, dur: 12,
        desc: '最初の防具。挑めるダンジョンを引き上げる' } },

    { id: 'bp_smg', name: '短機関銃の設計図', level: 2, price: 1500,
      cost: [{ id: 'scrap', n: 4 }, { id: 'spring', n: 3 }, { id: 'circuit', n: 1 }],
      product: { id: 'smg', name: '短機関銃', kind: 'equip', slot: 'weapon', icon: 'smg', price: 980, power: 17, dur: 18,
        desc: 'ナイフより攻撃力の高い武器。より深いダンジョンへ引き上げる' } },

    { id: 'bp_plate', name: '複合装甲服の設計図', level: 2, price: 1600,
      cost: [{ id: 'alloy', n: 2 }, { id: 'spring', n: 2 }],
      product: { id: 'plate', name: '複合装甲服', kind: 'equip', slot: 'armor', icon: 'plate', price: 1050, power: 15, dur: 18,
        desc: '鉄板ジャケットより硬い防具。より深いダンジョンへ引き上げる' } },

    { id: 'bp_cannon', name: '60mm速射砲の設計図', level: 3, price: 3400,
      cost: [{ id: 'alloy', n: 3 }, { id: 'circuit', n: 2 }],
      product: { id: 'cannon60', name: '60mm速射砲', kind: 'equip', slot: 'cannon', icon: 'cannon', price: 2400, power: 26, dur: 24,
        desc: '戦車の主砲。戦車を持つハンターだけが装備できる' } },

    { id: 'bp_subgun', name: '副砲の設計図', level: 2, price: 1300,
      cost: [{ id: 'scrap', n: 3 }, { id: 'spring', n: 2 }, { id: 'circuit', n: 1 }],
      product: { id: 'subgun1', name: '副砲', kind: 'equip', slot: 'subgun', icon: 'subgun', price: 1150, power: 12, dur: 20,
        desc: '戦車の副砲。主砲より安く早く積める。戦車を持つハンターだけが装備できる' } },

    { id: 'bp_engine', name: '再生機関の設計図', level: 3, price: 3100,
      cost: [{ id: 'core', n: 1 }, { id: 'circuit', n: 2 }],
      product: { id: 'engine1', name: '再生機関', kind: 'equip', slot: 'engine', icon: 'engine', price: 2200, power: 20, dur: 24,
        desc: '戦車の機関。戦車を持つハンターだけが装備できる' } },

    { id: 'bp_tank', name: '中古戦車の設計図', level: 4, price: 9000, rare: true,
      cost: [{ id: 'alloy', n: 6 }, { id: 'core', n: 2 }, { id: 'circuit', n: 4 }],
      product: { id: 'tank1', name: '中古戦車', kind: 'tank', slot: 'tank', icon: 'tank', price: 7800, power: 30, dur: 40,
        desc: '超高額・超希少。1台売ること自体が大きな達成イベント。以後、燃料・砲弾が継続的に売れるようになる' } }
  ],

  /* ---------- ダンジョン ----------
     reqPower … 挑める最低の強さ（この数字に届かないと出発しない）
     days     … 基準の攻略日数（企画方針：ダンジョンレベル ≒ 日数。強いと縮む）
     floors   … 層の数。裏で1層ずつ戦闘を回し、どこまで進めたかが「到達地点」になる
     enemies  … 各層に出る敵。hp と atk を持つ
     boss     … 最下層の賞金首。倒すと以後出なくなり、日数が1日縮む
     drops    … 持ち帰る素材。w は重み。到達層が深いほど数が増える
     bpDrops  … たまに持ち帰る設計図。chance は1回の帰還あたりの確率。
                 rare な設計図はここにしか出ないので、商人には並ばない物を置く */
  dungeons: [
    { id: 'd1', name: '崩れた高架', level: 1, reqPower: 0, days: 1, floors: 4,
      enemies: [
        { name: '野良犬', hp: 14, atk: 4 },
        { name: '錆びた自動機械', hp: 20, atk: 6 }
      ],
      drops: [{ id: 'scrap', w: 5 }, { id: 'herb', w: 4 }, { id: 'oil', w: 3 }],
      boss: { name: '錆喰いの巨腕', hp: 120, atk: 16, reward: 900 } },

    /* 苦草はどのダンジョンにも少しだけ生えている。
       深く潜るハンターしかいない状態で、消耗品の材料が完全に枯れないようにするため */
    { id: 'd2', name: '沈んだ地下街', level: 2, reqPower: 14, days: 2, floors: 6,
      enemies: [
        { name: '汚泥のねずみ', hp: 26, atk: 8 },
        { name: '徘徊する残骸', hp: 34, atk: 11 },
        { name: '影の群れ', hp: 30, atk: 13 }
      ],
      drops: [{ id: 'scrap', w: 4 }, { id: 'spring', w: 4 }, { id: 'oil', w: 3 }, { id: 'herb', w: 2 }, { id: 'circuit', w: 2 }],
      boss: { name: '影踏みの群れ', hp: 260, atk: 26, reward: 2200 } },

    { id: 'd3', name: '送電塔の残骸', level: 3, reqPower: 34, days: 3, floors: 8,
      enemies: [
        { name: '電気仕掛けの番犬', hp: 48, atk: 18 },
        { name: '高圧の腕', hp: 60, atk: 22 }
      ],
      drops: [{ id: 'spring', w: 3 }, { id: 'circuit', w: 4 }, { id: 'alloy', w: 3 }, { id: 'herb', w: 2 }, { id: 'oil', w: 2 }],
      boss: { name: '塔守', hp: 520, atk: 40, reward: 4800 } },

    { id: 'd4', name: '沈黙の立坑', level: 4, reqPower: 48, days: 4, floors: 10,
      enemies: [
        { name: '削岩ドローン', hp: 68, atk: 24 },
        { name: '崩落の看守', hp: 88, atk: 27 }
      ],
      drops: [{ id: 'alloy', w: 4 }, { id: 'circuit', w: 3 }, { id: 'core', w: 1 }, { id: 'herb', w: 1 }],
      boss: { name: '立坑の主', hp: 900, atk: 55, reward: 8000 } },

    { id: 'd5', name: '大深度シェルター', level: 5, reqPower: 64, days: 5, floors: 12,
      enemies: [
        { name: '封鎖ドローン', hp: 80, atk: 30 },
        { name: '旧世代の守衛', hp: 110, atk: 38 },
        { name: '増殖する機械', hp: 95, atk: 34 }
      ],
      drops: [{ id: 'circuit', w: 3 }, { id: 'alloy', w: 4 }, { id: 'core', w: 2 }],
      bpDrops: [{ id: 'bp_tank', chance: 0.25 }],
      boss: { name: '最後の番人', hp: 1400, atk: 70, reward: 12000 } }
  ],

  /* ---------- ハンター（組） ----------
     buys … 買い物の優先順。棚から何を先に見るかが組ごとに違う
            'consumable'（消耗品）/ 'equip'（武器・防具）/ 'tank'（戦車と戦車部品）
            先頭から順に見て、金が続く限り買う */
  hunters: [
    { id: 'h1', name: '三馬鹿', icon: 'hunter',
      intro: 'リーダーは見せかけだけだが男気はある。弱いが、なぜか生きて帰ってくる。',
      basePower: 8, income: 260, buys: ['consumable', 'equip', 'tank'] },

    { id: 'h2', name: '流れの老人', icon: 'hunter',
      intro: '有名ではない。ただ、この荒野の誰もが一度は世話になっている。',
      basePower: 15, income: 420, buys: ['equip', 'consumable', 'tank'] },

    { id: 'h3', name: '科学者と護衛', icon: 'hunter',
      intro: '本人は戦えない。持ち帰るものの目利きだけは、この街で一番。',
      basePower: 6, income: 520, buys: ['tank', 'equip', 'consumable'] },

    /* 酒場・宿屋を最大まで広げると同時に4組・7部屋まで受け入れられるようになるが、
       組の数そのものが3組では頭打ちになる。投資が空振りしないよう組数を増やしてある */
    { id: 'h4', name: '凄腕の賞金稼ぎ', icon: 'hunter',
      intro: '腕は立つが、財布の紐はもっと堅い。いい装備を見れば迷わず買う。',
      basePower: 22, income: 380, buys: ['equip', 'tank', 'consumable'] },

    { id: 'h5', name: '旅の整備士', icon: 'hunter',
      intro: '自分の身より道具を大事にする。荷物はいつも消耗品でいっぱい。',
      basePower: 10, income: 300, buys: ['consumable', 'tank', 'equip'] },

    { id: 'h6', name: '寡黙な狙撃手', icon: 'hunter',
      intro: '必要なこと以外はしゃべらない。金は貯めるだけ貯めて、ある日ふらっと使う。',
      basePower: 18, income: 340, buys: ['tank', 'consumable', 'equip'] }
  ],

  /* ---------- 図鑑にぶら下がる「出来事」 ----------
     ゲーム的な効果は持たない。集めて読むためだけのもの（企画書 3.9） */
  events: [
    { id: 'ev_potion', on: 'item', target: 'potion', cond: { type: 'soldItem', id: 'potion', n: 10 },
      title: '合成薬という呼び名',
      text: '正式な名前は誰も知らない。効くから飲む、それだけの薬に、いつのまにか名前がついていた。' },

    { id: 'ev_scrap', on: 'item', target: 'scrap', cond: { type: 'boughtMat', id: 'scrap', n: 30 },
      title: 'ねじ一本の値段',
      text: '五百年前、これは道端に落ちていたらしい。今は、これ一本で一晩泊まれる。' },

    { id: 'ev_h1', on: 'hunter', target: 'h1', cond: { type: 'intimacy', id: 'h1', n: 3000 },
      title: '三馬鹿という名前',
      text: '自分たちで名乗り始めた。曰く「先に言っておけば、誰にも言われない」。' },

    { id: 'ev_d1', on: 'dungeon', target: 'd1', cond: { type: 'bossDown', id: 'd1' },
      title: '高架の下にいたもの',
      text: '腕だけが残っていた。何の腕だったのかは、もう誰にも分からない。' },

    { id: 'ev_tank', on: 'item', target: 'tank1', cond: { type: 'soldItem', id: 'tank1', n: 1 },
      title: '戦車が一台',
      text: '売れた日のことは、店を畳むまで覚えている。そういう買い物が、たまにある。' }
  ],

  /* ---------- 実績 ----------
     条件は「回数」「所持」「組み合わせ」を書ける（企画書 3.8） */
  achievements: [
    { id: 'ac_sale1',   name: '最初の一つ',       cond: { type: 'sold', n: 1 },
      text: '何かが売れた。店が始まった。' },
    { id: 'ac_craft10', name: '工房の主',         cond: { type: 'craft', n: 10 },
      text: '10個作った。手が覚えてきた。' },
    { id: 'ac_boss1',   name: '賞金首を一体',     cond: { type: 'bossKill', n: 1 },
      text: '自分の店の商品が、賞金首を倒した。' },
    { id: 'ac_tank',    name: '戦車が一台',       cond: { type: 'soldItem', id: 'tank1', n: 1 },
      text: '戦車を売った。この街の歴史に残る。' },
    { id: 'ac_gold',    name: '荒野の商人',       cond: { type: 'earned', n: 20000 },
      text: '累計2万Gを稼いだ。' },
    { id: 'ac_inn',     name: '寝床の主',         cond: { type: 'facility', key: 'inn', level: 2 },
      text: '宿屋を広げた。泊まれる者が増えた。' }
  ],

  /* ---------- 初期状態 ---------- */
  start: {
    gold: 1200,
    materials: { scrap: 6, herb: 6, oil: 3 },
    blueprints: ['bp_potion', 'bp_knife']
  }
};
