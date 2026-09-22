// ワンストローク・コロニー のデータ。
//
// 数値はすべて仮。バランス調整はこのファイルだけを触って済ませる。
// レシピを1行足せば、工場カードも販売所カードも図鑑も自動で増える。
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- 品目
  // tier は加工の段。price は売値。shape は art.js の描き分け。
  const ITEMS = {
    ore:      { name: '鉄鉱石',     tier: 0, price: 2,  color: '#9aa7b4', shape: 'ore' },
    coal:     { name: '石炭',       tier: 0, price: 2,  color: '#6d7480', shape: 'coal' },
    water:    { name: '水',         tier: 0, price: 1,  color: '#54b6e0', shape: 'drop' },
    oil:      { name: '原油',       tier: 0, price: 3,  color: '#8d6bd0', shape: 'oil' },
    grain:    { name: '穀物',       tier: 0, price: 2,  color: '#d9b45a', shape: 'grain' },
    wood:     { name: '木材',       tier: 0, price: 2,  color: '#a8764a', shape: 'log' },
    cattle:   { name: '家畜',       tier: 0, price: 4,  color: '#d59b86', shape: 'cattle' },

    plate:    { name: '鉄板',       tier: 1, price: 8,  color: '#93a9c0', shape: 'plate' },
    plastic:  { name: 'プラスチック', tier: 1, price: 9,  color: '#b08cf0', shape: 'pellet' },
    charcoal: { name: '木炭',       tier: 1, price: 6,  color: '#8c7a6a', shape: 'chunk' },
    flour:    { name: '小麦粉',     tier: 1, price: 6,  color: '#e6d6a8', shape: 'bag' },
    meat:     { name: '肉',         tier: 1, price: 10, color: '#e0736b', shape: 'meat' },
    hide:     { name: '皮',         tier: 1, price: 9,  color: '#c59a6a', shape: 'hide' },

    can:      { name: '缶',         tier: 2, price: 18, color: '#b8c6d4', shape: 'can' },
    bolt:     { name: 'ネジ',       tier: 2, price: 18, color: '#e2a33c', shape: 'hex' },
    vessel:   { name: '容器',       tier: 2, price: 20, color: '#7fd4c4', shape: 'bottle' },
    battery:  { name: '電池',       tier: 2, price: 26, color: '#bcd94f', shape: 'battery' },
    bread:    { name: 'パン',       tier: 2, price: 16, color: '#d9a05a', shape: 'bread' },
    leather:  { name: '革製品',     tier: 2, price: 22, color: '#a06a40', shape: 'bagpack' },

    canned:   { name: '缶詰',       tier: 3, price: 48, color: '#f0a05a', shape: 'canned' },
    drink:    { name: '飲料水',     tier: 3, price: 46, color: '#5ad0e6', shape: 'filled' },
    part:     { name: '機械部品',   tier: 3, price: 52, color: '#3fc0b6', shape: 'gear' },
    tool:     { name: '電動工具',   tier: 3, price: 64, color: '#f2c94c', shape: 'drill' },
    ration:   { name: '携行食',     tier: 3, price: 50, color: '#8fd06a', shape: 'ration' },
  };

  // ---------------------------------------------------------------- 生産所
  // 原料の入口。ここは4種類のまま増やさない（産出違いでカードは分ける）。
  const SOURCES = [
    { key: 'src_ore',    name: '鉄鉱石',item: 'ore',    secs: 1.8, cost: 40 },
    { key: 'src_coal',   name: '石炭',  item: 'coal',   secs: 1.8, cost: 40 },
    { key: 'src_water',  name: '水',    item: 'water',  secs: 1.4, cost: 40 },
    { key: 'src_oil',    name: '原油',  item: 'oil',    secs: 2.2, cost: 60 },
    { key: 'src_grain',  name: '穀物',  item: 'grain',  secs: 1.8, cost: 40 },
    { key: 'src_wood',   name: '木材',  item: 'wood',   secs: 1.8, cost: 40 },
    { key: 'src_cattle', name: '家畜',  item: 'cattle', secs: 2.6, cost: 90 },
  ];

  // ---------------------------------------------------------------- 工場
  // in が1つなら加工機、2つなら工場。3つは将来（入力ポートは2〜3で可変）。
  const RECIPES = [
    { key: 'f_plate',    make: 'plate',    in: ['ore', 'coal'],     secs: 1.6, cost: 70 },
    { key: 'f_plastic',  make: 'plastic',  in: ['oil'],             secs: 1.6, cost: 70 },
    { key: 'f_charcoal', make: 'charcoal', in: ['wood'],            secs: 1.4, cost: 60 },
    { key: 'f_flour',    make: 'flour',    in: ['grain'],           secs: 1.4, cost: 60 },
    { key: 'f_meat',     make: 'meat',     in: ['cattle'],          secs: 1.8, cost: 80 },
    { key: 'f_hide',     make: 'hide',     in: ['cattle'],          secs: 1.8, cost: 80 },

    { key: 'f_can',      make: 'can',      in: ['plate'],           secs: 1.6, cost: 120 },
    { key: 'f_bolt',     make: 'bolt',     in: ['plate'],           secs: 1.6, cost: 120 },
    { key: 'f_vessel',   make: 'vessel',   in: ['plastic'],         secs: 1.6, cost: 120 },
    { key: 'f_battery',  make: 'battery',  in: ['plastic', 'coal'], secs: 2.2, cost: 260 },
    { key: 'f_bread',    make: 'bread',    in: ['flour', 'water'],  secs: 2.0, cost: 160 },
    { key: 'f_leather',  make: 'leather',  in: ['hide'],            secs: 1.8, cost: 160 },

    { key: 'f_canned',   make: 'canned',   in: ['can', 'meat'],     secs: 2.6, cost: 420 },
    { key: 'f_drink',    make: 'drink',    in: ['vessel', 'water'], secs: 2.4, cost: 400 },
    { key: 'f_part',     make: 'part',     in: ['bolt', 'plate'],   secs: 2.6, cost: 460 },
    { key: 'f_tool',     make: 'tool',     in: ['bolt', 'battery'], secs: 3.0, cost: 900 },
    { key: 'f_ration',   make: 'ration',   in: ['bread', 'meat'],   secs: 2.6, cost: 440 },
  ];

  // ---------------------------------------------------------------- 物流
  const LOGI = [
    { key: 'split', name: '分配機', cost: 60 },
    { key: 'store', name: '倉庫',   cost: 90, hold: 8 },
  ];

  // ---------------------------------------------------------------- 販売所
  // 品目ごとに別の設備。売り先が増えると購入パレットにカードが並ぶ。
  // 作れるようになった品目の店が自動で並ぶので、ここに表は持たない。
  const SHOP = { baseCost: 30, costPerPrice: 6, secs: 1.2 };

  // ---------------------------------------------------------------- 研究
  // tier は減刑の段。その段に届くまで、見えてはいるが買えない。
  const RESEARCH = [
    // 生産
    { key: 'r_coal',   p: 'prod',  tier: 0, cost: 40,    name: '石炭の採掘',   unlock: ['src_coal'] },
    { key: 'r_plate',  p: 'prod',  tier: 0, cost: 90,    name: '製鉄',         unlock: ['f_plate'] },
    { key: 'r_pump',   p: 'prod',  tier: 1, cost: 220,   name: 'ポンプ',       unlock: ['src_water', 'src_oil'] },
    { key: 'r_farm',   p: 'prod',  tier: 1, cost: 220,   name: '開墾',         unlock: ['src_grain', 'src_wood'] },
    { key: 'r_basic',  p: 'prod',  tier: 1, cost: 400,   name: '基礎加工',     unlock: ['f_plastic', 'f_charcoal', 'f_flour'] },
    { key: 'r_metal',  p: 'prod',  tier: 2, cost: 900,   name: '金属加工',     unlock: ['f_can', 'f_bolt'] },
    { key: 'r_form',   p: 'prod',  tier: 2, cost: 1100,  name: '成形',         unlock: ['f_vessel', 'f_bread'] },
    { key: 'r_ranch',  p: 'prod',  tier: 2, cost: 1400,  name: '牧畜',         unlock: ['src_cattle', 'f_meat', 'f_hide', 'f_leather'] },
    { key: 'r_batt',   p: 'prod',  tier: 3, cost: 2600,  name: '電池',         unlock: ['f_battery'] },
    { key: 'r_food',   p: 'prod',  tier: 3, cost: 5000,  name: '保存食',       unlock: ['f_canned', 'f_ration'] },
    { key: 'r_fine',   p: 'prod',  tier: 3, cost: 6000,  name: '精密加工',     unlock: ['f_part', 'f_drink'] },
    { key: 'r_power',  p: 'prod',  tier: 4, cost: 16000, name: '電動化',       unlock: ['f_tool'] },

    // 物流
    { key: 'r_split',  p: 'logi',  tier: 1, cost: 300,   name: '分配機',       unlock: ['split'] },
    { key: 'r_belt1',  p: 'logi',  tier: 1, cost: 500,   name: 'ベルト強化',   belt: 1 },
    { key: 'r_store',  p: 'logi',  tier: 2, cost: 700,   name: '倉庫',         unlock: ['store'] },
    { key: 'r_bridge', p: 'logi',  tier: 2, cost: 1600,  name: '陸橋',         unlock: ['bridge'] },
    { key: 'r_belt2',  p: 'logi',  tier: 3, cost: 4000,  name: 'ベルト強化2',  belt: 1 },

    // 販売
    { key: 'r_sell1',  p: 'sell',  tier: 1, cost: 350,   name: '販路拡大',     sellRate: 0.25 },
    { key: 'r_price1', p: 'sell',  tier: 2, cost: 1800,  name: '交渉術',       price: 0.15 },
    { key: 'r_sell2',  p: 'sell',  tier: 3, cost: 4500,  name: '販路拡大2',    sellRate: 0.25 },
    { key: 'r_price2', p: 'sell',  tier: 4, cost: 12000, name: '交渉術2',      price: 0.15 },

    // 開拓
    { key: 'r_land1',  p: 'land',  tier: 1, cost: 400,   name: '測量',         land: 0.25 },
    { key: 'r_rock',   p: 'land',  tier: 1, cost: 250,   name: '発破',         rock: 0.5 },
    { key: 'r_land2',  p: 'land',  tier: 3, cost: 3500,  name: '測量2',        land: 0.25 },
  ];

  const PILLARS = [
    { key: 'prod', name: '生産' },
    { key: 'logi', name: '物流' },
    { key: 'sell', name: '販売' },
    { key: 'land', name: '開拓' },
  ];

  // ---------------------------------------------------------------- 段（減刑）
  // 累計売上で進む。届くと通信が入り、次の段の研究が買えるようになる。
  const TIERS = [
    { need: 0,      years: 40, name: '入植',
      msg: ['囚人番号 7741 へ。', '本日付で当該惑星への入植を確認した。', '生産し、売却せよ。売上は刑期から差し引く。'] },
    { need: 400,    years: 32, name: '第一次減刑',
      msg: ['減刑通知。刑期を8年短縮する。', '当局はお前の生産量を評価した。', '採掘以外の生産許可を追加する。'] },
    { need: 3000,   years: 22, name: '第二次減刑',
      msg: ['減刑通知。刑期を10年短縮する。', '本部はお前の生産効率に関心を示している。', '加工設備の使用を許可する。'] },
    { need: 20000,  years: 12, name: '第三次減刑',
      msg: ['減刑通知。刑期を10年短縮する。', '……正直に言う。私はここに40年いる看守だ。', 'お前の方が先に出るかもしれん。'] },
    { need: 90000,  years: 4,  name: '第四次減刑',
      msg: ['減刑通知。刑期を8年短縮する。', '残り4年。ここまで来た囚人は3人目だ。', '前の2人は出所後もこの星に残った。'] },
    { need: 400000, years: 0,  name: '釈放',
      msg: ['刑期満了。', '本日付で囚人番号 7741 の恩赦が成立した。', '……工場はそのままでいい。好きにしろ。'] },
  ];

  // ---------------------------------------------------------------- 盤面
  const BOARD = {
    w: 9, h: 7, maxW: 22, maxH: 15,
    landBase: 90, landStep: 1.32,   // 1本買うたびに値段が上がる
    rockCost: 60, rockRate: 0.14,
    startMoney: 60,
  };

  // 設備のレベル。速さが上がる。
  const LEVEL = { max: 5, costMul: 1.8, speedMul: 0.78 };

  // 初期解放。採掘機1と鉄鉱石屋1だけ置いてある状態から始まる。
  const START_UNLOCK = ['src_ore'];

  global.COLONY = {
    ITEMS, SOURCES, RECIPES, LOGI, SHOP, RESEARCH, PILLARS,
    TIERS, BOARD, LEVEL, START_UNLOCK,
  };
})(window);
