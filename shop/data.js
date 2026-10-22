/* ==========================================================
   ハンター向けのショップ：データ

   ここの配列を増減するだけで、素材・設計図・ダンジョン・ハンター・出来事・実績の数が変わる。
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
        { cost: 0,     hunters: 3, mobs: [2, 4] },
        { cost: 1800,  hunters: 4, mobs: [3, 6] },
        { cost: 5400,  hunters: 5, mobs: [4, 8] },
        { cost: 15000, hunters: 6, mobs: [6, 12] }
      ]
    },
    shop: {
      name: 'ショップ', icon: 'shop',
      desc: '並べられる商品数が増える',
      /* 棚の枠は1日の売上の上限そのもの。ここが狭いと何を作っても頭打ちになる */
      levels: [
        { cost: 0,     slots: 6 },
        { cost: 1200,  slots: 9 },
        { cost: 4200,  slots: 12 },
        { cost: 12000, slots: 16 }
      ]
    },
    workshop: {
      name: '工房', icon: 'workshop',
      desc: '作れる設計図のレベルが上がる',
      levels: [
        { cost: 0,     craft: 1 },
        { cost: 2400,  craft: 2 },
        { cost: 7800,  craft: 3 },
        { cost: 19500, craft: 4 }
      ]
    },
    inn: {
      name: '宿屋', icon: 'inn',
      /* rooms = グレードごとの部屋数。合計が「同時に町に滞在できる組数」になる。
         宿泊料は「何もしなくても入る日銭」。ここが薄いと、金が尽きたときに
         素材を買えず作れず売れない、という一方通行に落ちる */
      desc: '滞在できる組数・部屋の質が上がる',
      levels: [
        { cost: 0,     rooms: { poor: 2 } },
        { cost: 1500,  rooms: { poor: 2, normal: 1 } },
        { cost: 4800,  rooms: { poor: 2, normal: 2, fine: 1 } },
        { cost: 13500, rooms: { poor: 2, normal: 2, fine: 2, suite: 1 } }
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
      desc: 'どこにでも落ちている金属くず。刃物にも鎧にも砲弾にもなる、この街の土台' },
    { id: 'herb',    name: '苦草',     icon: 'herb',    buy: 8,   sell: 15,
      desc: '荒野のどこにでも生える苦い草。煮詰めると薬に、干すと食べ物になる' },
    { id: 'oil',     name: '廃油',     icon: 'oil',     buy: 15,  sell: 28,
      desc: '古い機械から抜き取った黒い油。漉せば燃料になる' },
    { id: 'spring',  name: 'バネ',     icon: 'spring',  buy: 22,  sell: 40,
      desc: '巻いた鋼。今の技術では作れないので、拾ったものを使い回す' },
    { id: 'circuit', name: '回路片',   icon: 'circuit', buy: 48,  sell: 85,
      desc: '細かい文字の刻まれた板。銃の連射や砲の照準を受け持つ' },
    { id: 'alloy',   name: '軽合金',   icon: 'alloy',   buy: 75,  sell: 130,
      desc: '軽くて硬い旧文明の金属。良い鎧と砲身はみなこれでできている' },
    { id: 'core',    name: '動力核',   icon: 'core',    buy: 210, sell: 360,
      desc: '旧文明の機械の心臓。止まっていても、ほんのり温かい' },
    { id: 'memory',  name: '記録媒体', icon: 'memory',  buy: 160, sell: 280,
      desc: '五百年前の歌や映画が入っているらしい薄い板。照準の計算にも使える' }
  ],

  /* ---------- 設計図 ----------
     level  … 工房レベルがこれ以上なら作れる
     price  … 商人が売る値。物によるので個別に置く
     rare   … true の設計図は商人には並ばない。ハンターの持ち帰りでのみ手に入る
     slot   … 装備の枠（weapon / armor / tank / cannon / subgun / engine）
     kind   … consumable（消耗品）/ fuel（燃料・砲弾）/ equip（装備）/ tank（戦車）
     power  … 装備としての強さ
     dur    … 耐久。潜った層の数だけ減り、0で壊れて外れる。
              これがあるので装備は使い捨てになり、買い直しの需要が続く
     product.desc … 棚・在庫・図鑑に出る説明 */
  blueprints: [
    { id: 'bp_potion', name: '合成薬の設計図', level: 1, price: 300,
      cost: [{ id: 'herb', n: 2 }],
      product: { id: 'potion', name: '合成薬', kind: 'consumable', icon: 'potion', price: 45,
        desc: '苦草を煮詰めた回復薬。効く。苦い。ハンターが潜り続けられるかを左右する' } },

    { id: 'bp_ration', name: '携行食の設計図', level: 1, price: 240,
      cost: [{ id: 'herb', n: 1 }, { id: 'scrap', n: 1 }],
      product: { id: 'ration', name: '携行食', kind: 'consumable', icon: 'ration', price: 32,
        desc: '鉄の缶に詰めた干し草の保存食。安くてよく売れる。モブも買っていく' } },

    { id: 'bp_fuel', name: '燃料の設計図', level: 1, price: 420,
      cost: [{ id: 'oil', n: 2 }],
      product: { id: 'fuel', name: '燃料', kind: 'fuel', icon: 'fuel', price: 70,
        desc: '廃油を漉した燃料。戦車持ちのハンターが、泊まるたびに買っていく' } },

    { id: 'bp_shell', name: '砲弾の設計図', level: 2, price: 1100,
      cost: [{ id: 'scrap', n: 2 }, { id: 'spring', n: 1 }],
      product: { id: 'shell', name: '砲弾', kind: 'fuel', icon: 'shell', price: 110,
        desc: '戦車の砲弾。戦車持ちのハンターが、泊まるたびに買っていく' } },

    { id: 'bp_knife', name: '鉄のナイフの設計図', level: 1, price: 500,
      cost: [{ id: 'scrap', n: 3 }],
      product: { id: 'knife', name: '鉄のナイフ', kind: 'equip', slot: 'weapon', icon: 'knife', price: 210, power: 6, dur: 12,
        desc: '鉄くずを叩いて研いだ刃物。初めて荒野に出る者の、最初の一本' } },

    { id: 'bp_jacket', name: '鉄板ジャケットの設計図', level: 1, price: 560,
      cost: [{ id: 'scrap', n: 2 }, { id: 'spring', n: 1 }],
      product: { id: 'jacket', name: '鉄板ジャケット', kind: 'equip', slot: 'armor', icon: 'armor', price: 240, power: 5, dur: 12,
        desc: 'バネで鉄板を綴じた防具。重いが、無いよりずっといい' } },

    { id: 'bp_smg', name: '短機関銃の設計図', level: 2, price: 1500,
      cost: [{ id: 'scrap', n: 4 }, { id: 'spring', n: 3 }, { id: 'circuit', n: 1 }],
      product: { id: 'smg', name: '短機関銃', kind: 'equip', slot: 'weapon', icon: 'smg', price: 780, power: 17, dur: 18,
        desc: '回路で連射を制御する銃。地下街の群れを相手にできる' } },

    { id: 'bp_plate', name: '複合装甲服の設計図', level: 2, price: 1600,
      cost: [{ id: 'alloy', n: 2 }, { id: 'spring', n: 2 }],
      product: { id: 'plate', name: '複合装甲服', kind: 'equip', slot: 'armor', icon: 'plate', price: 840, power: 15, dur: 18,
        desc: '軽合金の板を重ねて縫った防具。送電塔の電撃にも耐える' } },

    { id: 'bp_rifle', name: '対物狙撃銃の設計図', level: 3, price: 3000,
      cost: [{ id: 'alloy', n: 2 }, { id: 'spring', n: 2 }, { id: 'circuit', n: 2 }],
      product: { id: 'rifle', name: '対物狙撃銃', kind: 'equip', slot: 'weapon', icon: 'rifle', price: 1680, power: 28, dur: 22,
        desc: '遠くから一撃で仕留める大きな銃。深い層の硬い敵に効く' } },

    { id: 'bp_exo', name: '外骨格フレームの設計図', level: 3, price: 3200,
      cost: [{ id: 'alloy', n: 3 }, { id: 'spring', n: 3 }, { id: 'circuit', n: 1 }],
      product: { id: 'exo', name: '外骨格フレーム', kind: 'equip', slot: 'armor', icon: 'exo', price: 1840, power: 25, dur: 22,
        desc: '体の動きを支える骨組みの防具。重い装甲を着たまま走れる' } },

    { id: 'bp_rail', name: '携行レールガンの設計図', level: 4, price: 7200,
      cost: [{ id: 'alloy', n: 3 }, { id: 'circuit', n: 3 }, { id: 'core', n: 1 }, { id: 'memory', n: 1 }],
      product: { id: 'rail', name: '携行レールガン', kind: 'equip', slot: 'weapon', icon: 'rail', price: 4160, power: 42, dur: 28,
        desc: '動力核で弾を撃ち出す銃。旧文明の兵器を、人が持てる大きさにした' } },

    { id: 'bp_husk', name: '番人の外殻の設計図', level: 4, price: 7600,
      cost: [{ id: 'alloy', n: 5 }, { id: 'core', n: 1 }, { id: 'memory', n: 1 }],
      product: { id: 'husk', name: '番人の外殻', kind: 'equip', slot: 'armor', icon: 'husk', price: 4320, power: 38, dur: 28,
        desc: '封鎖ドローンの装甲を、人が着られる形に打ち直した防具。この店で作れる一番硬い服' } },

    { id: 'bp_cannon', name: '60mm速射砲の設計図', level: 3, price: 3400,
      cost: [{ id: 'alloy', n: 3 }, { id: 'circuit', n: 2 }],
      product: { id: 'cannon60', name: '60mm速射砲', kind: 'equip', slot: 'cannon', icon: 'cannon', price: 1920, power: 26, dur: 24,
        desc: '戦車の主砲。戦車を持つハンターだけが積める' } },

    { id: 'bp_subgun', name: '副砲の設計図', level: 2, price: 1300,
      cost: [{ id: 'scrap', n: 3 }, { id: 'spring', n: 2 }, { id: 'circuit', n: 1 }],
      product: { id: 'subgun1', name: '副砲', kind: 'equip', slot: 'subgun', icon: 'subgun', price: 920, power: 12, dur: 20,
        desc: '戦車の副砲。主砲より安く早く積める。戦車を持つハンターだけが積める' } },

    { id: 'bp_engine', name: '再生機関の設計図', level: 3, price: 3100,
      cost: [{ id: 'core', n: 1 }, { id: 'circuit', n: 2 }],
      product: { id: 'engine1', name: '再生機関', kind: 'equip', slot: 'engine', icon: 'engine', price: 1760, power: 20, dur: 24,
        desc: '止まっても、しばらくするとまた動き出す機関。戦車を持つハンターだけが積める' } },

    { id: 'bp_cannon120', name: '120mm滑腔砲の設計図', level: 4, price: 9800, rare: true,
      cost: [{ id: 'alloy', n: 4 }, { id: 'circuit', n: 3 }, { id: 'core', n: 1 }],
      product: { id: 'cannon120', name: '120mm滑腔砲', kind: 'equip', slot: 'cannon', icon: 'bigcannon', price: 4960, power: 44, dur: 30,
        desc: '大深度で見つかった図面から作る大砲。撃つたびに戦車ごと後ろへ下がる。戦車持ち専用' } },

    { id: 'bp_tank', name: '中古戦車の設計図', level: 4, price: 9000, rare: true,
      cost: [{ id: 'alloy', n: 6 }, { id: 'core', n: 2 }, { id: 'circuit', n: 4 }],
      product: { id: 'tank1', name: '中古戦車', kind: 'tank', slot: 'tank', icon: 'tank', price: 6240, power: 30, dur: 40,
        desc: '五百年前の戦車を直したもの。1台売れば、以後ずっと燃料と砲弾が売れる' } }
  ],

  /* ---------- ダンジョン ----------
     reqPower … 挑める最低の強さ（この数字に届かないと出発しない）
     days     … 基準の攻略日数（ダンジョンレベル ≒ 日数。強いと縮む）
     floors   … 層の数。裏で1層ずつ戦闘を回し、どこまで進めたかが「到達地点」になる
     enemies  … 各層に出る敵。hp と atk を持つ
     boss     … 最下層の賞金首。倒すと以後出なくなり、日数が1日縮む
     drops    … 持ち帰る素材。w は重み。到達層が深いほど数が増える
     bpDrops  … たまに持ち帰る設計図。chance は1回の帰還あたりの確率。
                 rare な設計図はここにしか出ないので、商人には並ばない物を置く */
  dungeons: [
    { id: 'd1', name: '崩れた高架', level: 1, reqPower: 0, days: 1, floors: 4, pay: 120,
      desc: '街から半日。崩れた鉄道の高架。駆け出しが最初に潜る場所',
      enemies: [
        { name: '野良犬', hp: 14, atk: 4 },
        { name: '錆びた自動機械', hp: 20, atk: 6 }
      ],
      drops: [{ id: 'scrap', w: 5 }, { id: 'herb', w: 4 }, { id: 'oil', w: 3 }],
      boss: { name: '錆喰いの巨腕', hp: 120, atk: 16, reward: 900 } },

    /* 苦草はどのダンジョンにも少しだけ生えている。
       深く潜るハンターしかいない状態で、消耗品の材料が完全に枯れないようにするため */
    { id: 'd2', name: '沈んだ地下街', level: 2, reqPower: 14, days: 2, floors: 6, pay: 320,
      desc: '水に沈んだ地下の商店街。暗がりから、群れで来る',
      enemies: [
        { name: '汚泥のねずみ', hp: 26, atk: 8 },
        { name: '徘徊する残骸', hp: 34, atk: 11 },
        { name: '影の群れ', hp: 30, atk: 13 }
      ],
      drops: [{ id: 'scrap', w: 4 }, { id: 'spring', w: 4 }, { id: 'oil', w: 3 }, { id: 'herb', w: 2 }, { id: 'circuit', w: 2 }],
      boss: { name: '影踏みの群れ', hp: 260, atk: 26, reward: 2200 } },

    { id: 'd3', name: '送電塔の残骸', level: 3, reqPower: 34, days: 3, floors: 8, pay: 600,
      desc: '倒れた送電塔の根元に開いた穴。まだ電気が生きている',
      enemies: [
        { name: '電気仕掛けの番犬', hp: 48, atk: 18 },
        { name: '高圧の腕', hp: 60, atk: 22 }
      ],
      drops: [{ id: 'spring', w: 3 }, { id: 'circuit', w: 4 }, { id: 'alloy', w: 3 }, { id: 'herb', w: 2 }, { id: 'oil', w: 2 }],
      boss: { name: '塔守', hp: 520, atk: 40, reward: 4800 } },

    { id: 'd4', name: '沈黙の立坑', level: 4, reqPower: 48, days: 4, floors: 10, pay: 1000,
      desc: '地の底まで掘られた縦穴。掘るための機械が、今も掘り続けている',
      enemies: [
        { name: '削岩ドローン', hp: 68, atk: 24 },
        { name: '崩落の看守', hp: 88, atk: 27 }
      ],
      drops: [{ id: 'alloy', w: 4 }, { id: 'circuit', w: 3 }, { id: 'core', w: 1 }, { id: 'memory', w: 1 }, { id: 'herb', w: 1 }],
      bpDrops: [{ id: 'bp_tank', chance: 0.12 }],
      boss: { name: '立坑の主', hp: 900, atk: 55, reward: 8000 } },

    { id: 'd5', name: '大深度シェルター', level: 5, reqPower: 64, days: 5, floors: 12, pay: 1600,
      desc: '旧文明の避難所。最下層の扉の前に、番人が立っている',
      enemies: [
        { name: '封鎖ドローン', hp: 80, atk: 30 },
        { name: '旧世代の守衛', hp: 110, atk: 38 },
        { name: '増殖する機械', hp: 95, atk: 34 }
      ],
      drops: [{ id: 'circuit', w: 3 }, { id: 'alloy', w: 4 }, { id: 'core', w: 2 }, { id: 'memory', w: 2 }, { id: 'herb', w: 1 }],
      bpDrops: [{ id: 'bp_tank', chance: 0.25 }, { id: 'bp_cannon120', chance: 0.2 }],
      boss: { name: '最後の番人', hp: 1400, atk: 70, reward: 12000 } }
  ],

  /* ---------- ハンター（組） ----------
     buys … 買い物の優先順。棚から何を先に見るかが組ごとに違う
            'consumable'（消耗品）/ 'equip'（武器・防具）/ 'tank'（戦車と戦車部品）
            先頭から順に見て、金が続く限り買う
     talk … 台詞を組ごとに差し替える（キーは下の talk と同じ） */
  hunters: [
    { id: 'h1', name: '三馬鹿', icon: 'h1',
      intro: '見張り役のリーダーと、腕の立つ二人目と、頭の回る三人目。弱いが、なぜか生きて帰ってくる。',
      basePower: 8, income: 520, buys: ['consumable', 'equip', 'tank'],
      talk: {
        first:   'おう店主、俺たち三人の伝説はここから始まる。まずは{slot}だ。……いちばん安いやつで頼む',
        broke:   '{item}が壊れた。俺じゃない、二人目が振り回したんだ。代わりの{slot}を頼む',
        pushed:  '{floor}層の{enemy}に……戦略的撤退だ。もっといい{slot}があれば勝ってた',
        dry:     '薬が切れた。三人いると三倍減るんだよ。多めに頼む',
        boss:    '{boss}か。今回は顔見せだ。{slot}がよけりゃ次は勝つ',
        next:    '{dungeon}に行くって決めた。決めたのは俺だ。{slot}を頼む',
        supply:  '装備は足りてる。あとは薬と食い物だな。三人分な',
        thanks:  '{item}、受け取った！ 三人分の礼は無理だが、一人分は置いてく',
        short:   '棚の{item}……今日は見逃してやる。金がないからじゃないぞ',
        missing: '頼んでた{req}は、まだか。まあいい、俺たちは待てる男だ'
      } },

    { id: 'h2', name: '流れの老人', icon: 'h2',
      intro: '有名ではない。ただ、この荒野の誰もが一度は世話になっている。名前は誰も知らない。',
      basePower: 15, income: 840, buys: ['equip', 'consumable', 'tank'],
      talk: {
        first:   'よい店だ。若い頃によく通った店に似ておる。{slot}をひとつ見せてくれんか',
        broke:   '{item}がな、役目を終えた。よく働いてくれた。次の{slot}を頼もう',
        pushed:  '{floor}層で{enemy}に道を譲った。年寄りは無理をせんのだ。{slot}がよければ、もう少し行ける',
        dry:     '薬が尽きてな。引き返すのも勇気じゃ。次は多めに持っていく',
        boss:    '{boss}は、まだ早かった。{slot}を替えれば、届くかもしれん',
        next:    '{dungeon}を見ておきたい。死ぬ前にな。{slot}が頼りじゃ',
        supply:  '道具はこれで足りておる。薬だけ、切らさんでくれ',
        thanks:  '{item}、たしかに。ありがたく使わせてもらうよ',
        short:   '棚の{item}、よい品じゃ。年寄りの財布には、ちと重い',
        missing: '頼んでおいた{req}は、まだのようじゃな。急がんでよい'
      } },

    { id: 'h3', name: '科学者と護衛', icon: 'h3',
      intro: '本人は戦えない。持ち帰るものの目利きだけは、この街で一番。護衛は一言もしゃべらない。',
      basePower: 6, income: 1040, buys: ['tank', 'equip', 'consumable'],
      talk: {
        first:   '護衛の{slot}を探しています。私は戦いませんので、私のぶんは要りません',
        broke:   '{item}は耐久の限界を迎えました。実に興味深い壊れ方です。新しい{slot}を',
        pushed:  '{floor}層の{enemy}、あれは記録にない個体です。護衛の{slot}を強化したい',
        dry:     '薬の消費量の計算を誤りました。三割増しでお願いします',
        boss:    '{boss}の外殻、採取したかったのですが。{slot}次第で可能になります',
        next:    '{dungeon}の地層には仮説があるのです。{slot}があれば検証できます',
        supply:  '装備の数値は十分です。消耗品だけ補充を',
        thanks:  '{item}、受領しました。護衛も、たぶん喜んでいます',
        short:   '{item}の価格は妥当です。予算が妥当ではありませんでした',
        missing: '頼んでいた{req}は未着ですね。出発時刻は動かせないので、行ってきます'
      } },

    { id: 'h4', name: '凄腕の賞金稼ぎ', icon: 'h4',
      intro: '腕は立つが、財布の紐はもっと堅い。ただし、命を預ける物だけは値切らない。',
      basePower: 22, income: 760, buys: ['equip', 'tank', 'consumable'],
      talk: {
        first:   '{slot}だ。安物はいらない。使える物だけ置いてくれ',
        broke:   '{item}が死んだ。代わりの{slot}がいる',
        pushed:  '{floor}層、{enemy}。押し負けた。{slot}が足りない',
        dry:     '薬が切れた。次は切らさない',
        boss:    '{boss}の首は俺がもらう。{slot}を用意しておけ',
        next:    '{dungeon}に首がある。{slot}が要る',
        supply:  '装備はいい。薬を置いておけ',
        thanks:  '{item}、悪くない',
        short:   '{item}か。……今は持ち合わせがない',
        missing: '{req}は無かったな。次は頼む'
      } },

    { id: 'h5', name: '旅の整備士', icon: 'h5',
      intro: '自分の身より道具を大事にする。工具の一本一本に名前がある。荷物はいつも消耗品でいっぱい。',
      basePower: 10, income: 600, buys: ['consumable', 'tank', 'equip'],
      talk: {
        first:   'いい工房だね。ここの品なら手入れのしがいがある。{slot}をひとつ',
        broke:   '{item}、直せなかった。直せない物は、そうないんだけどね。新しい{slot}を頼むよ',
        pushed:  '{floor}層の{enemy}、関節が硬くてさ。{slot}がもう一段いい物なら抜けられた',
        dry:     '薬が切れちゃって。工具は無事だよ。薬を多めに頼む',
        boss:    '{boss}の駆動音、きれいだったなあ。{slot}があれば、近くで聞ける',
        next:    '{dungeon}には古い機械が眠ってるって。{slot}を頼むよ',
        supply:  '装備の調子はいいよ。消耗品だけお願い',
        fuel:    '戦車の腹が減ってる。燃料と砲弾、どっちでもいい',
        thanks:  '{item}、いい仕事してるね。大事に使うよ',
        short:   '{item}、いいなあ。今日は工具を一本買っちゃってさ',
        missing: '{req}、まだだったね。次の帰りに期待してる'
      } },

    { id: 'h6', name: '寡黙な狙撃手', icon: 'h6',
      intro: '必要なこと以外はしゃべらない。金は貯めるだけ貯めて、ある日ふらっと使う。',
      basePower: 18, income: 680, buys: ['tank', 'consumable', 'equip'],
      talk: {
        first:   '……{slot}',
        broke:   '{item}、折れた。{slot}',
        pushed:  '{floor}層。{enemy}。{slot}',
        dry:     '薬',
        boss:    '{boss}。{slot}',
        next:    '{dungeon}。{slot}',
        supply:  '薬だけ',
        fuel:    '燃料',
        thanks:  '……助かる',
        short:   '……また来る',
        missing: '……{req}'
      } }
  ],

  /* ---------- 図鑑にぶら下がる「出来事」 ----------
     ゲーム的な効果は持たない。集めて読むためだけのもの。
     on は item / hunter / dungeon。target はその id */
  events: [
    /* 素材 */
    { id: 'ev_scrap', on: 'item', target: 'scrap', cond: { type: 'boughtMat', id: 'scrap', n: 30 },
      title: 'ねじ一本の値段',
      text: '五百年前、これは道端に落ちていたらしい。今は、これ一本で一晩泊まれる。' },
    { id: 'ev_herb', on: 'item', target: 'herb', cond: { type: 'boughtMat', id: 'herb', n: 20 },
      title: '苦草はなぜ苦い',
      text: '昔の誰かが「食べられないように」と苦く作り変えたらしい。おかげで今も、荒野で最後まで残っている。' },
    { id: 'ev_oil', on: 'item', target: 'oil', cond: { type: 'boughtMat', id: 'oil', n: 20 },
      title: '黒い血',
      text: '機械から油を抜くとき、ハンターは少しだけ手を合わせる。誰に教わったわけでもない。' },
    { id: 'ev_spring', on: 'item', target: 'spring', cond: { type: 'boughtMat', id: 'spring', n: 15 },
      title: 'バネの数え方',
      text: '一本、二本ではなく「一巻き」と数える。巻き数で値が決まるので、伸ばして売る悪い商人もいる。' },
    { id: 'ev_circuit', on: 'item', target: 'circuit', cond: { type: 'boughtMat', id: 'circuit', n: 10 },
      title: '読めない文字',
      text: '回路片には細かい文字が刻まれている。読める者はいない。読めても、もう意味はないのだろう。' },
    { id: 'ev_alloy', on: 'item', target: 'alloy', cond: { type: 'boughtMat', id: 'alloy', n: 10 },
      title: '軽すぎる金属',
      text: '持ち上げると、思ったより軽くて手が泳ぐ。昔の人は、空を飛ぶものをこれで作っていたという。' },
    { id: 'ev_core', on: 'item', target: 'core', cond: { type: 'boughtMat', id: 'core', n: 3 },
      title: '動力核は温かい',
      text: '止まっているはずなのに、手のひらに置くとほんのり温かい。理由は誰も知らないし、誰も確かめたがらない。' },
    { id: 'ev_memory', on: 'item', target: 'memory', cond: { type: 'boughtMat', id: 'memory', n: 3 },
      title: '再生できない歌',
      text: '五百年前の歌が入っているらしい。再生する機械が無いので、この街の誰も聞いたことがない。それでも高く売れる。' },

    /* 商品 */
    { id: 'ev_potion', on: 'item', target: 'potion', cond: { type: 'soldItem', id: 'potion', n: 10 },
      title: '合成薬という呼び名',
      text: '正式な名前は誰も知らない。効くから飲む、それだけの薬に、いつのまにか名前がついていた。' },
    { id: 'ev_ration', on: 'item', target: 'ration', cond: { type: 'soldItem', id: 'ration', n: 20 },
      title: '携行食の味',
      text: '味は三種類ある。苦い、とても苦い、昨日より苦い。' },
    { id: 'ev_fuel', on: 'item', target: 'fuel', cond: { type: 'soldItem', id: 'fuel', n: 10 },
      title: '燃料の匂い',
      text: '戦車乗りは、燃料の匂いで店を選ぶ。混ぜ物の少ない店は、嗅げば分かるらしい。' },
    { id: 'ev_shell', on: 'item', target: 'shell', cond: { type: 'soldItem', id: 'shell', n: 10 },
      title: '砲弾に名前を書く',
      text: '狙撃手は砲弾に何も書かない。三馬鹿は全部に名前を書く。誰の名前かは、聞かないことにしている。' },
    { id: 'ev_knife', on: 'item', target: 'knife', cond: { type: 'soldItem', id: 'knife', n: 3 },
      title: '最初の一本',
      text: 'どのハンターも、最初の武器のことはよく覚えている。たいてい刃こぼれしていて、たいてい手放せない。' },
    { id: 'ev_jacket', on: 'item', target: 'jacket', cond: { type: 'soldItem', id: 'jacket', n: 3 },
      title: '鉄板の重さ',
      text: '着ると、肩が覚悟の重さを知る。脱ぐと、生きて帰ったことを知る。' },
    { id: 'ev_smg', on: 'item', target: 'smg', cond: { type: 'soldItem', id: 'smg', n: 3 },
      title: '弾は高い',
      text: '撃つより先に、弾の値段を数える癖がつく。それが長生きの秘訣だと、老人は言った。' },
    { id: 'ev_plate', on: 'item', target: 'plate', cond: { type: 'soldItem', id: 'plate', n: 3 },
      title: '縫い目の癖',
      text: '縫い目を見れば、どこの工房の品か分かる。この店の縫い目の癖は、もう荒野に知られている。' },
    { id: 'ev_rifle', on: 'item', target: 'rifle', cond: { type: 'soldItem', id: 'rifle', n: 2 },
      title: '遠くから撃つ礼儀',
      text: '遠くから撃てば、相手は怒る前に倒れる。それが礼儀なのだと、狙撃手は珍しく長くしゃべった。' },
    { id: 'ev_exo', on: 'item', target: 'exo', cond: { type: 'soldItem', id: 'exo', n: 2 },
      title: 'もう一人の自分',
      text: '外骨格は、着る者の動きを少しだけ先回りする。慣れるまでは、自分が二人いるような気がするという。' },
    { id: 'ev_rail', on: 'item', target: 'rail', cond: { type: 'soldItem', id: 'rail', n: 1 },
      title: '音より速い',
      text: '撃った音が届く前に、もう終わっている。だから、この銃で倒された相手は、驚いた顔をしていない。' },
    { id: 'ev_husk', on: 'item', target: 'husk', cond: { type: 'soldItem', id: 'husk', n: 1 },
      title: '前の持ち主',
      text: '打ち直した外殻の内側には、前の持ち主がつけた傷がまだ残っている。それを見て、着る者は少しだけ優しくなる。' },
    { id: 'ev_cannon60', on: 'item', target: 'cannon60', cond: { type: 'soldItem', id: 'cannon60', n: 1 },
      title: '60という数字',
      text: '口径が60ミリあるらしい。ミリという長さを正確に知っているのは、この街では科学者だけだ。' },
    { id: 'ev_subgun', on: 'item', target: 'subgun1', cond: { type: 'soldItem', id: 'subgun1', n: 2 },
      title: '副砲は脇役',
      text: '主砲が仕留め、副砲が守る。戦車乗りは副砲を「女房」と呼ぶが、本物の女房の前では呼ばない。' },
    { id: 'ev_engine', on: 'item', target: 'engine1', cond: { type: 'soldItem', id: 'engine1', n: 1 },
      title: '勝手に治る',
      text: '止まっても、しばらくするとまた動き出す。直したわけではない。勝手に治るのだ。整備士はそれが少し悔しい。' },
    { id: 'ev_cannon120', on: 'item', target: 'cannon120', cond: { type: 'soldItem', id: 'cannon120', n: 1 },
      title: '大きすぎる砲',
      text: '試し撃ちで、戦車ごと宿の壁まで下がった。壁の穴は、今も「記念」として塞いでいない。' },
    { id: 'ev_tank', on: 'item', target: 'tank1', cond: { type: 'soldItem', id: 'tank1', n: 1 },
      title: '戦車が一台',
      text: '売れた日のことは、店を畳むまで覚えている。そういう買い物が、たまにある。' },

    /* ハンター（親密度は店で使った金の累計） */
    { id: 'ev_h1a', on: 'hunter', target: 'h1', cond: { type: 'intimacy', id: 'h1', n: 1500 },
      title: '三馬鹿という名前',
      text: '自分たちで名乗り始めた。曰く「先に言っておけば、誰にも言われない」。' },
    { id: 'ev_h1b', on: 'hunter', target: 'h1', cond: { type: 'intimacy', id: 'h1', n: 6000 },
      title: '三人の持ち場',
      text: 'リーダーは見張り、二人目は戦い、三人目は考える。見張りが一番安全だと二人とも気づいているが、黙っている。' },
    { id: 'ev_h2a', on: 'hunter', target: 'h2', cond: { type: 'intimacy', id: 'h2', n: 2000 },
      title: '老人の地図',
      text: '老人の地図には、ダンジョンの入り口ではなく、湧き水の場所が書いてある。「潜る前に、帰り道を覚えろ」。' },
    { id: 'ev_h2b', on: 'hunter', target: 'h2', cond: { type: 'intimacy', id: 'h2', n: 8000 },
      title: '名前のない人',
      text: 'この街の誰もが、老人に一度は助けられている。名前を知っている者はいない。本人も、もう忘れたと言って笑う。' },
    { id: 'ev_h3a', on: 'hunter', target: 'h3', cond: { type: 'intimacy', id: 'h3', n: 2000 },
      title: '目利き',
      text: '科学者は、素材を舐めて産地を当てる。護衛は毎回それを止めようとして、毎回間に合わない。' },
    { id: 'ev_h3b', on: 'hunter', target: 'h3', cond: { type: 'intimacy', id: 'h3', n: 8000 },
      title: '護衛の昔',
      text: '護衛は昔、科学者の作った機械だったという噂がある。二人は笑って否定する。否定の仕方が、少し似ている。' },
    { id: 'ev_h4a', on: 'hunter', target: 'h4', cond: { type: 'intimacy', id: 'h4', n: 2000 },
      title: '値切らない理由',
      text: '賞金稼ぎは、命を預ける物を値切らない。財布の紐が堅いのは、それ以外の物に対してだけだ。' },
    { id: 'ev_h4b', on: 'hunter', target: 'h4', cond: { type: 'intimacy', id: 'h4', n: 8000 },
      title: '古い手配書',
      text: '賞金稼ぎの荷物には、もう誰も追っていない古い手配書が一枚だけ入っている。誰の首なのかは、聞いても答えない。' },
    { id: 'ev_h5a', on: 'hunter', target: 'h5', cond: { type: 'intimacy', id: 'h5', n: 2000 },
      title: '工具の名前',
      text: '整備士は工具の一本一本に名前をつけている。一番古いスパナは「師匠」と呼ばれている。' },
    { id: 'ev_h5b', on: 'hunter', target: 'h5', cond: { type: 'intimacy', id: 'h5', n: 8000 },
      title: '直せないもの',
      text: '「直せない物はない」が口癖だった。ある晩、宿で古い音楽の機械をいじりながら、初めて「これは無理だ」と言った。' },
    { id: 'ev_h6a', on: 'hunter', target: 'h6', cond: { type: 'intimacy', id: 'h6', n: 2000 },
      title: '十日ぶりの一言',
      text: '十日ぶりに口をきいたと思ったら「この店の薬は、苦い」だった。翌日、薬を三つ買っていった。' },
    { id: 'ev_h6b', on: 'hunter', target: 'h6', cond: { type: 'intimacy', id: 'h6', n: 8000 },
      title: '貯めた金の行き先',
      text: '狙撃手の貯めた金は、街外れの孤児の家に届いているらしい。本人に聞くと、黙って銃の手入れを始める。' },

    /* ダンジョン */
    { id: 'ev_d1a', on: 'dungeon', target: 'd1', cond: { type: 'visit', id: 'd1', n: 3 },
      title: '高架の上の線路',
      text: '昔は高架の上を鉄の箱が走っていたらしい。毎朝同じ時間に、同じ人が乗っていたという。何が楽しかったのかは分からない。' },
    { id: 'ev_d1', on: 'dungeon', target: 'd1', cond: { type: 'bossDown', id: 'd1' },
      title: '高架の下にいたもの',
      text: '腕だけが残っていた。何の腕だったのかは、もう誰にも分からない。' },
    { id: 'ev_d2a', on: 'dungeon', target: 'd2', cond: { type: 'visit', id: 'd2', n: 3 },
      title: '地下街の看板',
      text: '割れた看板には「いらっしゃいませ」と書いてある。読める者が読み上げると、ハンターたちはなぜか少し笑う。' },
    { id: 'ev_d2b', on: 'dungeon', target: 'd2', cond: { type: 'bossDown', id: 'd2' },
      title: '影の正体',
      text: '影踏みの群れは、群れではなかった。ひとつの大きな影が、たくさんの足で歩いていただけだった。' },
    { id: 'ev_d3a', on: 'dungeon', target: 'd3', cond: { type: 'visit', id: 'd3', n: 3 },
      title: '送電塔は歌う',
      text: '風の強い日、送電塔の残骸は低い音で鳴る。古い歌に似ていると老人は言う。その歌を知っているのは、老人だけだ。' },
    { id: 'ev_d3b', on: 'dungeon', target: 'd3', cond: { type: 'bossDown', id: 'd3' },
      title: '塔守の仕事',
      text: '塔守は、誰もいなくなったあとも五百年、塔を守っていた。仕留めたハンターは、帰り道でずっと黙っていた。' },
    { id: 'ev_d4a', on: 'dungeon', target: 'd4', cond: { type: 'visit', id: 'd4', n: 2 },
      title: '底の明かり',
      text: '立坑の底には、まだ点いている電灯がある。誰が電球を替えているのかは、考えないほうがいい。' },
    { id: 'ev_d4b', on: 'dungeon', target: 'd4', cond: { type: 'bossDown', id: 'd4' },
      title: '掘り続けたもの',
      text: '立坑の主は、掘るために作られた機械だった。掘る先がなくなっても、掘るのを止められなかった。' },
    { id: 'ev_d5a', on: 'dungeon', target: 'd5', cond: { type: 'visit', id: 'd5', n: 1 },
      title: '扉の注意書き',
      text: '扉には「全員が戻るまで開けないこと」と書いてあった。扉は、内側から開いていた。' },
    { id: 'ev_d5b', on: 'dungeon', target: 'd5', cond: { type: 'bossDown', id: 'd5' },
      title: '番人の部屋',
      text: '番人が守っていた部屋には、種の入った箱が並んでいた。ラベルの半分は、もう誰も知らない植物の名前だった。' }
  ],

  /* ---------- 実績 ----------
     条件は「回数」「所持」「組み合わせ」を書ける（書ける種類は game.js の condMet） */
  achievements: [
    { id: 'ac_sale1',   name: '最初の一つ',     cond: { type: 'sold', n: 1 },
      text: '何かが売れた。店が始まった。' },
    { id: 'ac_req1',    name: '常連の頼み',     cond: { type: 'request', n: 1 },
      text: '頼まれた品を、頼まれたとおりに渡した。' },
    { id: 'ac_req20',   name: '頼れる店',       cond: { type: 'request', n: 20 },
      text: '二十回、頼みに応えた。ハンターは、まずこの店を覗くようになった。' },
    { id: 'ac_craft10', name: '工房の主',       cond: { type: 'craft', n: 10 },
      text: '10個作った。手が覚えてきた。' },
    { id: 'ac_craft100', name: '目をつぶっても', cond: { type: 'craft', n: 100 },
      text: '100個作った。ナイフくらいなら、目をつぶっても作れる。' },
    { id: 'ac_dismantle', name: 'ねじ一本も',   cond: { type: 'dismantle', n: 10 },
      text: '売れ残りを10回分解した。この店は何も捨てない。' },
    { id: 'ac_boss1',   name: 'この店の一撃',   cond: { type: 'bossByShop', n: 1 },
      text: '賞金首にとどめを刺したのは、この店の武器だった。' },
    { id: 'ac_upset',   name: '番狂わせ',       cond: { type: 'upset', n: 1 },
      text: '分の悪い見込みを、ハンターが覆した。持たせた品が効いた。' },
    { id: 'ac_kills',   name: '名のある一本',   cond: { type: 'maxKills', n: 20 },
      text: 'ひとつの武器が20体を倒した。その品には、もう来歴と呼べるものがある。' },
    { id: 'ac_tank',    name: '戦車が一台',     cond: { type: 'soldItem', id: 'tank1', n: 1 },
      text: '戦車を売った。この街の歴史に残る。' },
    { id: 'ac_fulltank', name: '全部この店の品', cond: { type: 'fullTank' },
      text: '主砲も副砲も機関も、この店の品で揃えた戦車が荒野を走っている。' },
    { id: 'ac_hunters', name: '顔なじみ',       cond: { type: 'hunterAll' },
      text: '荒野のハンターが、みんなこの店の客になった。' },
    { id: 'ac_inn',     name: '寝床の主',       cond: { type: 'facility', key: 'inn', level: 2 },
      text: '宿屋を広げた。泊まれる者が増えた。' },
    { id: 'ac_facall',  name: '店が仕上がった', cond: { type: 'facAll' },
      text: '酒場も棚も工房も宿屋も、これ以上は広げられない。' },
    { id: 'ac_gold',    name: '荒野の商人',     cond: { type: 'earned', n: 20000 },
      text: '累計2万Gを稼いだ。' },
    { id: 'ac_gold2',   name: '街一番の店',     cond: { type: 'earned', n: 200000 },
      text: '累計20万Gを稼いだ。この街で、この店を知らない者はいない。' },
    { id: 'ac_bossall', name: '荒野の掃除屋',   cond: { type: 'bossKill', n: 5 },
      text: '荒野の賞金首を、すべて仕留めさせた。' }
  ],

  /* ---------- 頼みごと ----------
     ハンターは帰還のたびに、潜った結果から「次に欲しい物」を1つ頼む。
     頼まれた品が棚にあれば最優先で買い、tip（価格に対する割合）をお礼に置いていく。
     頼みは次に発つ日まで。間に合わなければ、頼みは消えて次の帰還でまた出る */
  request: { tip: 0.2, consumables: 3 },

  /* ---------- ハンターの台詞・品の物語 ----------
     {x} は差し込み。hunters[].talk に同じキーを書くと、その組だけ差し替わる */
  talk: {
    first:   '手ぶらじゃ荒野は歩けねえ。{slot}をひとつ頼む',
    broke:   '{item}が壊れちまった。代わりの{slot}を置いといてくれ',
    pushed:  '{floor}層の{enemy}に押し返された。もっといい{slot}が要る',
    dry:     '薬が切れて引き返した。消耗品を多めに頼む',
    boss:    '{boss}には歯が立たなかった。{slot}次第でなんとかなる',
    next:    '次は{dungeon}に行きたい。{slot}が良ければ届く',
    supply:  '今の装備に文句はない。消耗品だけ切らさないでくれ',
    fuel:    '戦車の腹が減ってる。燃料か砲弾を頼む',
    thanks:  '頼んでた{item}、ありがたく使わせてもらう',
    short:   '棚の{item}、欲しかったが手が出なかった',
    missing: '頼んでた{req}は、まだ棚に無かったな。行ってくる'
  },
  story: {
    kills:   '{item}で{n}体を倒した',
    finish:  '{boss}にとどめを刺したのは、この店の{item}だった',
    saved:   '{floors}層で{item}を飲んで持ち直した',
    guarded: '{item}が{n}回の攻撃を受け止めた',
    broke:   '{item}が壊れた。{made}に作り、{sold}に渡した品。{deeds}'
  },

  /* ---------- 初期状態 ---------- */
  start: {
    gold: 1200,
    materials: { scrap: 6, herb: 6, oil: 3 },
    blueprints: ['bp_potion', 'bp_knife']
  }
};
