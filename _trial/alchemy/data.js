// 錬金工場と魔法のお店 のデータ。
//
// 品目とレシピは MindMap の「錬金工場と魔法のお店.json」から起こしたもの。
// 材料と生成物の向きは、盤面のx座標（左が材料・右が生成物）で決めた。
// 数値はすべて仮。バランス調整はこのファイルだけを触って済ませる。
// レシピを1行足せば、錬成陣のカードもお店のカードも図鑑も自動で増える。
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- 品目
  // tier は錬成の段。price は売値。
  // 売値は1品ずつ決めない。**抽出（材料1口）は材料×4、合成（材料2〜3口）は材料の合計×2**。
  // 合成は材料を2〜3口食って1個しか出ないので、合計の2倍にしないとその場で足踏みする。
  // 原料は 魔鉱石2G、ほかは5G。読める数にするため3桁で丸めてある。
  // レシピを足したら、この規則で出した数を入れること。
  // shape / mark は art.js の描き分け。色だけに頼らず、形か中の印が必ず違う。
  const ITEMS = {
    // ---- 原料
    magicore:      { name: '魔鉱石', tier: 0, price: 2, color: '#b07ce8', shape: 'oregem' },
    herb:          { name: '深緑の野草', tier: 0, price: 5, color: '#6fc36a', shape: 'herb' },
    volcano:       { name: '火山の力', tier: 0, price: 5, color: '#e8703f', shape: 'volcano' },
    pearl:         { name: '深海の真珠', tier: 0, price: 5, color: '#7fd8e8', shape: 'pearl' },
    slough:        { name: '大蛇の抜け殻', tier: 0, price: 5, color: '#c2a86a', shape: 'slough' },
    // ---- 一次
    earth:         { name: '土の魔力', tier: 1, price: 20, color: '#c08b4a', shape: 'rune', mark: 'earth' },
    anima_life:    { name: '生命のアニマ', tier: 1, price: 20, color: '#e8899a', shape: 'anima', mark: 'life' },
    water:         { name: '水の魔力', tier: 1, price: 20, color: '#4fb8e8', shape: 'rune', mark: 'water' },
    magicstone:    { name: '魔石', tier: 1, price: 8, color: '#a98fd8', shape: 'magicstone' },
    fire:          { name: '火の魔力', tier: 1, price: 20, color: '#f2703c', shape: 'rune', mark: 'fire' },
    anima_gem:     { name: '宝石のアニマ', tier: 1, price: 20, color: '#6fd0d8', shape: 'anima', mark: 'gem' },
    anima_plant:   { name: '植物のアニマ', tier: 1, price: 20, color: '#7cc46f', shape: 'anima', mark: 'plant' },
    wind:          { name: '風の魔力', tier: 1, price: 20, color: '#7fd8a8', shape: 'rune', mark: 'wind' },
    anima_ore:     { name: '鉱石のアニマ', tier: 1, price: 8, color: '#9aa7b4', shape: 'anima', mark: 'ore' },
    anima_energy:  { name: 'エナジーのアニマ', tier: 1, price: 20, color: '#f0b448', shape: 'anima', mark: 'energy' },
    // ---- 二次
    ring:          { name: '流水の指輪', tier: 2, price: 80, color: '#5bc8e8', shape: 'ring' },
    lifecrystal:   { name: '生命の結晶', tier: 2, price: 80, color: '#f07fa0', shape: 'lifecrystal' },
    dark:          { name: '闇の魔力', tier: 2, price: 80, color: '#9166c9', shape: 'rune', mark: 'dark' },
    light:         { name: '光の魔力', tier: 2, price: 80, color: '#f7e07a', shape: 'rune', mark: 'light' },
    shield:        { name: '大地の盾', tier: 2, price: 80, color: '#c08b4a', shape: 'shield' },
    potion:        { name: '魔法水', tier: 2, price: 80, color: '#56b8e0', shape: 'potion' },
    cloak:         { name: '突風のマント', tier: 2, price: 80, color: '#7fd8a8', shape: 'cloak' },
    firesword:     { name: '火の剣', tier: 2, price: 56, color: '#f2703c', shape: 'firesword' },
    darkorb:       { name: '闇の水晶', tier: 2, price: 176, color: '#8f63c4', shape: 'darkorb' },
    lantern:       { name: '無限のランタン', tier: 2, price: 176, color: '#f7dc6a', shape: 'lantern' },
    compass:       { name: '人探しのコンパス', tier: 2, price: 176, color: '#d8a24a', shape: 'compass' },
    seed:          { name: '魔法の種子', tier: 2, price: 80, color: '#8fd06a', shape: 'seed' },
    bean:          { name: '満腹の豆', tier: 2, price: 200, color: '#d8c06a', shape: 'bean' },
    glass:         { name: '魔法のガラス', tier: 2, price: 56, color: '#a6d8e8', shape: 'glass' },
    cloth:         { name: '魔法の布', tier: 2, price: 80, color: '#e07fb0', shape: 'cloth' },
    bomb:          { name: '爆裂石', tier: 2, price: 56, color: '#e0603c', shape: 'bomb' },
    phantomglass:  { name: '夢幻のガラス', tier: 2, price: 704, color: '#b8e0f0', shape: 'phantomglass' },
    // ---- 三次
    holysword:     { name: '天光の剣', tier: 3, price: 384, color: '#f7e8a0', shape: 'holysword' },
    eartharmor:    { name: '大地の鎧', tier: 3, price: 480, color: '#b08040', shape: 'armor' },
    tent:          { name: '魔法のテント', tier: 3, price: 624, color: '#d09060', shape: 'tent' },
    hellwind:      { name: '魔界の風', tier: 3, price: 240, color: '#9166c9', shape: 'swirl' },
    heavensoil:    { name: '天界の土', tier: 3, price: 240, color: '#f0d090', shape: 'soil' },
    worldseed:     { name: '世界樹の種', tier: 3, price: 480, color: '#6fc36a', shape: 'worldseed' },
    machine:       { name: '魔導機', tier: 3, price: 72, color: '#8fa0c0', shape: 'machine' },
    hollow:        { name: '世界樹の洞（うろ）', tier: 3, price: 3170, color: '#7fa860', shape: 'hollow' },
    gallian:       { name: '罪人の剣《ガリアンソード》', tier: 3, price: 256, color: '#c05050', shape: 'whipsword' },
    manjimaru:     { name: '卍卍丸（まんじまんじまる）', tier: 3, price: 2290, color: '#e8e0d0', shape: 'katana' },
    homunculus:    { name: 'ホムンクルス', tier: 3, price: 1920, color: '#f0c0b0', shape: 'homunculus' },
    crystal:       { name: 'クリスタル', tier: 3, price: 2370, color: '#c0a8e8', shape: 'crystal' },
    crystal_light: { name: '光のクリスタル', tier: 3, price: 4900, color: '#f7e07a', shape: 'crystal', mark: 'light' },
    crystal_water: { name: '水のクリスタル', tier: 3, price: 4780, color: '#4fb8e8', shape: 'crystal', mark: 'water' },
    crystal_fire:  { name: '火のクリスタル', tier: 3, price: 4780, color: '#f2703c', shape: 'crystal', mark: 'fire' },
    fairy:         { name: '道しるべの妖精', tier: 3, price: 4590, color: '#f0a0d8', shape: 'fairy' },
    warrior:       { name: '魔装兵', tier: 3, price: 5570, color: '#a0b0c8', shape: 'warrior' },
    beanstalk:     { name: '天空の豆の木', tier: 3, price: 720, color: '#5fb85f', shape: 'beanstalk' },
    emblem:        { name: '炎の紋章', tier: 3, price: 432, color: '#e87040', shape: 'emblem' },
    crystal_wind:  { name: '風のクリスタル', tier: 3, price: 4780, color: '#7fd8a8', shape: 'crystal', mark: 'wind' },
    crystal_earth: { name: '土のクリスタル', tier: 3, price: 4780, color: '#c08b4a', shape: 'crystal', mark: 'earth' },
    crystal_dark:  { name: '闇のクリスタル', tier: 3, price: 4900, color: '#9166c9', shape: 'crystal', mark: 'dark' },
    guardian:      { name: '主守', tier: 3, price: 22000, color: '#c8b060', shape: 'guardian' },
    magicarmor:    { name: '魔導鎧', tier: 3, price: 21100, color: '#7f8fd0', shape: 'magicarmor' },
    necklace:      { name: '聖女の首飾り', tier: 3, price: 10500, color: '#f0d8f0', shape: 'necklace' },
    egg:           { name: '冥王の卵', tier: 3, price: 11000, color: '#8060a0', shape: 'egg' },
    eye:           { name: '水晶の瞳', tier: 3, price: 9460, color: '#a0e0f0', shape: 'eye' },
    philosopher:   { name: '賢者の石', tier: 3, price: 28900, color: '#f05070', shape: 'philosopher' },
    elixir:        { name: 'エリクサー', tier: 3, price: 28900, color: '#f0e060', shape: 'elixir' },
    dragon:        { name: '竜戦士《ドラゴンウォリアー》', tier: 3, price: 61100, color: '#e05030', shape: 'dragon' },
    tablet:        { name: '魔法のガラス板', tier: 3, price: 11100, color: '#90d0f0', shape: 'tablet' },
    savecircle:    { name: '星影歩《セイブ》の魔法陣', tier: 3, price: 29900, color: '#c0a0f0', shape: 'savecircle' },
    paradise:      { name: '王道楽土', tier: 3, price: 2240, color: '#8fd870', shape: 'paradise' },
    flamesword:    { name: '炎の剣', tier: 3, price: 15000, color: '#ff8030', shape: 'flamesword' },
    wing:          { name: '冥王の翼', tier: 3, price: 138000, color: '#7040a0', shape: 'wing' },
  };

  // ---------------------------------------------------------------- 採取地
  // 原料の入口。ここは5種類のまま増やさない。
  const SOURCES = [
    { key: 'src_magicore', item: 'magicore', secs: 1.8, cost: 40 },
    { key: 'src_herb', item: 'herb', secs: 1.8, cost: 40 },
    { key: 'src_volcano', item: 'volcano', secs: 1.8, cost: 40 },
    { key: 'src_pearl', item: 'pearl', secs: 1.8, cost: 40 },
    { key: 'src_slough', item: 'slough', secs: 1.8, cost: 40 },
  ];

  // ---------------------------------------------------------------- 錬成陣
  // in が1つなら抽出、2つ以上なら合成。3つまで。
  // cost は**作る品の売値 × 40**。深い品の錬成陣ほど自動で高くなる。
  // これで元が取れるまでの時間が、深さ1で約80秒、深さ8で約60分まで自然に伸びる。
  const RECIPES = [
    // ---- 一次
    { key: 'f_earth', make: 'earth', in: ['slough'], secs: 1.4, cost: 800 },
    { key: 'f_anima_life', make: 'anima_life', in: ['slough'], secs: 1.4, cost: 800 },
    { key: 'f_water', make: 'water', in: ['pearl'], secs: 1.4, cost: 800 },
    { key: 'f_magicstone', make: 'magicstone', in: ['magicore'], secs: 1.4, cost: 320 },
    { key: 'f_fire', make: 'fire', in: ['volcano'], secs: 1.4, cost: 800 },
    { key: 'f_anima_gem', make: 'anima_gem', in: ['pearl'], secs: 1.4, cost: 800 },
    { key: 'f_anima_plant', make: 'anima_plant', in: ['herb'], secs: 1.4, cost: 800 },
    { key: 'f_wind', make: 'wind', in: ['herb'], secs: 1.4, cost: 800 },
    { key: 'f_anima_ore', make: 'anima_ore', in: ['magicore'], secs: 1.4, cost: 320 },
    { key: 'f_anima_energy', make: 'anima_energy', in: ['volcano'], secs: 1.4, cost: 800 },
    // ---- 二次
    { key: 'f_ring', make: 'ring', in: ['water', 'anima_gem'], secs: 1.8, cost: 3200 },
    { key: 'f_lifecrystal', make: 'lifecrystal', in: ['anima_energy', 'anima_life'], secs: 1.8, cost: 3200 },
    { key: 'f_dark', make: 'dark', in: ['earth', 'fire'], secs: 1.8, cost: 3200 },
    { key: 'f_light', make: 'light', in: ['wind', 'water'], secs: 1.8, cost: 3200 },
    { key: 'f_shield', make: 'shield', in: ['earth', 'anima_plant'], secs: 1.8, cost: 3200 },
    { key: 'f_potion', make: 'potion', in: ['water', 'anima_energy'], secs: 1.8, cost: 3200 },
    { key: 'f_cloak', make: 'cloak', in: ['wind', 'anima_life'], secs: 1.8, cost: 3200 },
    { key: 'f_firesword', make: 'firesword', in: ['anima_ore', 'fire'], secs: 1.8, cost: 2240 },
    { key: 'f_darkorb', make: 'darkorb', in: ['dark', 'magicstone'], secs: 1.8, cost: 7040 },
    { key: 'f_lantern', make: 'lantern', in: ['light', 'anima_ore'], secs: 1.8, cost: 7040 },
    { key: 'f_compass', make: 'compass', in: ['cloak', 'magicstone'], secs: 1.8, cost: 7040 },
    { key: 'f_seed', make: 'seed', in: ['anima_plant', 'anima_gem'], secs: 1.8, cost: 3200 },
    { key: 'f_bean', make: 'bean', in: ['anima_plant', 'light'], secs: 1.8, cost: 8000 },
    { key: 'f_glass', make: 'glass', in: ['magicstone', 'anima_energy'], secs: 1.8, cost: 2240 },
    { key: 'f_cloth', make: 'cloth', in: ['anima_life', 'anima_plant'], secs: 1.8, cost: 3200 },
    { key: 'f_bomb', make: 'bomb', in: ['anima_ore', 'fire'], secs: 1.8, cost: 2240 },
    { key: 'f_phantomglass', make: 'phantomglass', in: ['darkorb', 'lantern'], secs: 1.8, cost: 28200 },
    // ---- 三次
    { key: 'f_holysword', make: 'holysword', in: ['firesword', 'ring', 'bomb'], secs: 2.4, cost: 15400 },
    { key: 'f_eartharmor', make: 'eartharmor', in: ['shield', 'cloak', 'lifecrystal'], secs: 2.4, cost: 19200 },
    { key: 'f_tent', make: 'tent', in: ['cloth', 'glass', 'lantern'], secs: 2.4, cost: 25000 },
    { key: 'f_hellwind', make: 'hellwind', in: ['wind', 'dark', 'water'], secs: 2.4, cost: 9600 },
    { key: 'f_heavensoil', make: 'heavensoil', in: ['light', 'earth', 'fire'], secs: 2.4, cost: 9600 },
    { key: 'f_worldseed', make: 'worldseed', in: ['seed', 'potion', 'lifecrystal'], secs: 2.4, cost: 19200 },
    { key: 'f_machine', make: 'machine', in: ['magicstone', 'anima_gem', 'anima_ore'], secs: 2.4, cost: 2880 },
    { key: 'f_hollow', make: 'hollow', in: ['worldseed', 'tent', 'eartharmor'], secs: 2.4, cost: 127000 },
    { key: 'f_gallian', make: 'gallian', in: ['firesword', 'machine'], secs: 2.4, cost: 10200 },
    { key: 'f_manjimaru', make: 'manjimaru', in: ['holysword', 'phantomglass', 'bomb'], secs: 2.4, cost: 91600 },
    { key: 'f_homunculus', make: 'homunculus', in: ['heavensoil', 'worldseed', 'hellwind'], secs: 2.4, cost: 76800 },
    { key: 'f_crystal', make: 'crystal', in: ['hellwind', 'heavensoil', 'phantomglass'], secs: 2.4, cost: 94800 },
    { key: 'f_crystal_light', make: 'crystal_light', in: ['crystal', 'light'], secs: 2.4, cost: 196000 },
    { key: 'f_crystal_water', make: 'crystal_water', in: ['crystal', 'water'], secs: 2.4, cost: 191000 },
    { key: 'f_crystal_fire', make: 'crystal_fire', in: ['crystal', 'fire'], secs: 2.4, cost: 191000 },
    { key: 'f_fairy', make: 'fairy', in: ['homunculus', 'compass', 'bean'], secs: 2.4, cost: 184000 },
    { key: 'f_warrior', make: 'warrior', in: ['homunculus', 'eartharmor', 'holysword'], secs: 2.4, cost: 223000 },
    { key: 'f_beanstalk', make: 'beanstalk', in: ['bean', 'seed', 'cloth'], secs: 2.4, cost: 28800 },
    { key: 'f_emblem', make: 'emblem', in: ['shield', 'ring', 'firesword'], secs: 2.4, cost: 17300 },
    { key: 'f_crystal_wind', make: 'crystal_wind', in: ['crystal', 'wind'], secs: 2.4, cost: 191000 },
    { key: 'f_crystal_earth', make: 'crystal_earth', in: ['crystal', 'earth'], secs: 2.4, cost: 191000 },
    { key: 'f_crystal_dark', make: 'crystal_dark', in: ['crystal', 'dark'], secs: 2.4, cost: 196000 },
    { key: 'f_guardian', make: 'guardian', in: ['warrior', 'hollow', 'manjimaru'], secs: 2.4, cost: 880000 },
    { key: 'f_magicarmor', make: 'magicarmor', in: ['warrior', 'crystal_dark', 'machine'], secs: 2.4, cost: 844000 },
    { key: 'f_necklace', make: 'necklace', in: ['crystal_water', 'emblem', 'anima_gem'], secs: 2.4, cost: 420000 },
    { key: 'f_egg', make: 'egg', in: ['emblem', 'homunculus', 'hollow'], secs: 2.4, cost: 440000 },
    { key: 'f_eye', make: 'eye', in: ['glass', 'fairy', 'potion'], secs: 2.4, cost: 378000 },
    { key: 'f_philosopher', make: 'philosopher', in: ['crystal_light', 'crystal_fire', 'crystal_earth'], secs: 2.4, cost: 1160000 },
    { key: 'f_elixir', make: 'elixir', in: ['crystal_wind', 'crystal_dark', 'crystal_water'], secs: 2.4, cost: 1160000 },
    { key: 'f_dragon', make: 'dragon', in: ['fairy', 'magicarmor', 'crystal_light'], secs: 2.4, cost: 2440000 },
    { key: 'f_tablet', make: 'tablet', in: ['crystal_wind', 'machine', 'phantomglass'], secs: 2.4, cost: 444000 },
    { key: 'f_savecircle', make: 'savecircle', in: ['crystal_earth', 'beanstalk', 'eye'], secs: 2.4, cost: 1200000 },
    { key: 'f_paradise', make: 'paradise', in: ['heavensoil', 'gallian', 'tent'], secs: 2.4, cost: 89600 },
    { key: 'f_flamesword', make: 'flamesword', in: ['emblem', 'crystal_fire', 'manjimaru'], secs: 2.4, cost: 600000 },
    { key: 'f_wing', make: 'wing', in: ['elixir', 'philosopher', 'egg'], secs: 2.4, cost: 5520000 },
  ];
  // ---------------------------------------------------------------- 一言
  // 図鑑に出す説明。MindMap の「錬金工場と魔法のお店.json」の detail をそのまま持ってきたもの。
  // 品目を足したらここにも1行足す。空なら図鑑には何も出ない。
  const FLAVOR = {
    magicore:        '魔力を増やしたり溜める効果のある鉱石',
    herb:            '風の力や自然の力を持つ野草。薬草や香辛料などにもなる',
    volcano:         '火の力をため込んだ力その物。',
    pearl:           '水の力を持つ宝石。',
    slough:          '大地の力をため込んだ大蛇の脱皮した後。生命力が強い',
    earth:           '大地の力。守りを与えてくれる',
    anima_life:      '生き物の存在そのものを抽出した物',
    water:           '癒しの力を持つ水の力',
    magicstone:      '魔法を封じ込められる石。ただし、その保持力は弱い',
    fire:            '火の力を与えてくれる。強力なエネルギーになる。',
    anima_gem:       '魔法を封じ込めたる力を持つ宝石の存在そのものを抽出した物',
    anima_plant:     '植物の存在そのものを抽出した物',
    wind:            '力を増強させる効果のある風の力',
    anima_ore:       '強靭な金属の力そのもの',
    anima_energy:    'エネルギーの存在そのものを抽出した物',
    ring:            '魔法をかき消し耐火の力を持つ指輪',
    lifecrystal:     '体力を回復する不思議な結晶',
    dark:            'すべてを覆いつくす闇の力',
    light:           '破邪の力を持つ光の力',
    shield:          '土の加護により衝撃が吸収される盾',
    potion:          '魔力を回復する水',
    cloak:           '矢を防ぎ高くジャンプできるようになるマント',
    firesword:       '火を発する剣で回復を阻止する剣。防寒の効果もある。',
    darkorb:         '闇を見通し見えない物を見えるようにする',
    lantern:         'いつまでも光が無くなることのない魔法のランタン',
    compass:         '物を入れると所持者の位置を指し示すコンパス',
    seed:            'どんな植物が育つかわからない種子。自然界に存在しない植物が育つ',
    bean:            '一つ食べるだけで数日は食事をしなくてもよくなる魔法の豆',
    glass:           '魔力が含まれたガラス。強い光を遮り闇では発光する',
    cloth:           '魔力が込められた布。寒い時には暖かくなり、暑いときには冷たくなる。',
    bomb:            '炸裂する石。鉱山などで使われる。',
    phantomglass:    '透明なそれは精霊界に実態が存在するため幻の様なガラスである。',
    holysword:       '勇者が魔王と戦った時に使ったとされる剣。どんな闇も祓いすべてを切り裂く',
    eartharmor:      '勇者が魔王と叩くときにつけていたとされる鎧。無限の生命力を与えてくれる。',
    tent:            'ここに住んでも問題ないぐらい丈夫で快適なテント',
    hellwind:        '異界に吹く風。それを浴びただけで体力が大きく奪われる。',
    heavensoil:      '天界の光が封じ込められた土。どんな植物も育つ',
    worldseed:       '世界樹に育つと言われる種。生命力を増やす効果がある',
    machine:         '魔法により作られた機械。様々な種類がある',
    hollow:          'そこにいるだけで魔物から守り生命力を回復される。',
    gallian:         '伝説の王子が愛用した蛇腹剣',
    manjimaru:       '伝説の剣をさらに鍛えぬいた最強の刀',
    homunculus:      '人工生命体',
    crystal:         '大量の魔力を封じ込められるクリスタル',
    crystal_light:   '自然の光を宿したクリスタル',
    crystal_water:   '自然の水を宿したクリスタル',
    crystal_fire:    '自然の炎を宿したクリスタル',
    fairy:           '人を導く妖精。あなたにとって必要な場所に導いてくれる妖精',
    warrior:         '夢幻の体力を持ちビームを放つ不老不死の兵士',
    beanstalk:       '植えて水を上げればたちまち天までとどく巨大な目の木が萌える',
    emblem:          '紋章と言いながら盾なのである',
    crystal_wind:    '自然の風を宿したクリスタル',
    crystal_earth:   '自然の土を宿したクリスタル',
    crystal_dark:    '自然の闇を宿したクリスタル',
    guardian:        '主を守るガーディアン兵。口から大地を沸騰させるレーザーを放つ。',
    magicarmor:      '魔法と科学の結晶の鎧。鎧とは言っても強化外骨格の様な物である。',
    necklace:        '聖女の祈りが封じ込められた首飾り。どんな呪いも解除する',
    egg:             '冥王の生まれ変わりの証である卵の形をした宝珠',
    eye:             '魔法の言葉「とくれせんたぼーび」',
    philosopher:     '不老不死の効果があると言われる伝説の石',
    elixir:          'どんな病も直し永遠の健康が与えるとされる霊薬',
    dragon:          '巨大な竜の顔をした鎧。鎧というかもはやロボットである',
    tablet:          'いろいろな情報が表示される便利な魔法の板。これを持っている物はガラス太郎の称号がもらえる。',
    savecircle:      '今までのあなたの歩みを保存してくれる魔法陣。その星のアカシックレコードに刻まれる。',
    paradise:        '理想郷を作るための土。どんな植物も育つ大地を作る',
    flamesword:      '炎の魔人イーフリートが変身して剣の形になった',
    wing:            '強大な力と不老不死と病気にならない無敵の力を得られる。その代わり冥界の王として人とは違うものとなってしまう。',
  };

  // ---------------------------------------------------------------- 物流
  const LOGI = [
    { key: 'split', name: '分配陣', cost: 300 },
    { key: 'store', name: '保管庫', cost: 1500, hold: 8 },
  ];

  // ---------------------------------------------------------------- お店
  // お店は品目を持たない。繋いだ送り道から流れてきた物を、その品の値段で売る。
  // 売り先を替えるのに建て直さなくていいので、レベルが無駄にならない。
  // 値段は二段。**easy 軒目までは stepEasy 倍ずつ、そこから先は stepHard 倍ずつ**。
  // 序盤は気軽に増やせて、終盤ほど1軒が重い。最後の20軒目で終盤の稼ぎの10分ぶんになる。
  const SHOP = { baseCost: 60, easy: 5, stepEasy: 1.5, stepHard: 1.55, secs: 1.2 };

  // ---------------------------------------------------------------- 研究
  // tier は店の格。その格に届くまで、見えてはいるが買えない。
  //  unlock を持つもの … 一度きり。設備やレシピが並ぶようになる。
  //  stat を持つもの   … 何度でも上げられる。1レベルにつき per だけ効き、max まで。
  //                      値段は costMul でレベルごとに上がる。
  const RESEARCH = [
    // 錬成
    // 流れは「採取を解放 → 錬成を解放」。採取は4つまとめて1つにする。
    { key: 'r_gather',  p: 'prod', tier: 0, cost: 200,    name: '野と海と山',
      unlock: ['src_herb', 'src_pearl', 'src_slough', 'src_volcano'] },
    { key: 'r_extract', p: 'prod', tier: 0, cost: 400,    name: '抽出の術',
      unlock: ['f_magicstone', 'f_anima_ore', 'f_anima_plant', 'f_anima_gem',
        'f_anima_life', 'f_anima_energy', 'f_wind', 'f_water', 'f_earth', 'f_fire'] },
    { key: 'r_lightdark', p: 'prod', tier: 1, cost: 5000, name: '光と闇',
      unlock: ['f_light', 'f_dark'] },
    { key: 'r_craft',   p: 'prod', tier: 1, cost: 12000,   name: '工房の技',
      unlock: ['f_glass', 'f_cloth', 'f_bomb'] },
    { key: 'r_tools',   p: 'prod', tier: 2, cost: 30000, name: '装いの錬成',
      unlock: ['f_ring', 'f_shield', 'f_cloak', 'f_firesword'] },
    { key: 'r_life',    p: 'prod', tier: 2, cost: 30000, name: '暮らしの錬成',
      unlock: ['f_potion', 'f_lifecrystal', 'f_seed', 'f_bean'] },
    { key: 'r_mystic',  p: 'prod', tier: 2, cost: 80000, name: '神秘の錬成',
      unlock: ['f_lantern', 'f_darkorb', 'f_compass', 'f_phantomglass', 'f_tent'] },
    { key: 'r_elem3',   p: 'prod', tier: 2, cost: 90000, name: '天界と魔界',
      unlock: ['f_heavensoil', 'f_hellwind'] },
    { key: 'r_crystal', p: 'prod', tier: 3, cost: 100000, name: 'クリスタル',
      unlock: ['f_crystal', 'f_crystal_light', 'f_crystal_water', 'f_crystal_fire',
        'f_crystal_wind', 'f_crystal_earth', 'f_crystal_dark'] },
    { key: 'r_armory',  p: 'prod', tier: 3, cost: 200000, name: '武具の錬成',
      unlock: ['f_eartharmor', 'f_holysword', 'f_machine', 'f_gallian'] },
    { key: 'r_garden',  p: 'prod', tier: 3, cost: 200000, name: '世界樹',
      unlock: ['f_worldseed', 'f_hollow', 'f_beanstalk', 'f_paradise'] },
    { key: 'r_relic',   p: 'prod', tier: 4, cost: 400000, name: '秘宝の錬成',
      unlock: ['f_necklace', 'f_eye', 'f_tablet', 'f_savecircle', 'f_magicarmor'] },
    { key: 'r_life3',   p: 'prod', tier: 4, cost: 500000, name: '人造の生命',
      unlock: ['f_homunculus', 'f_fairy', 'f_warrior', 'f_guardian'] },
    { key: 'r_blade',   p: 'prod', tier: 4, cost: 700000, name: '伝説の刃',
      unlock: ['f_manjimaru', 'f_emblem', 'f_flamesword', 'f_dragon'] },
    { key: 'r_forbidden', p: 'prod', tier: 4, cost: 1500000, name: '禁断の錬成',
      unlock: ['f_philosopher', 'f_elixir', 'f_egg', 'f_wing'] },

    // 物流（お店まわりもここ）
    { key: 'r_split',  p: 'logi', tier: 1, cost: 2000,  name: '分配陣',   unlock: ['split'] },
    { key: 'r_store',  p: 'logi', tier: 2, cost: 20000, name: '保管庫',   unlock: ['store'] },
    { key: 'r_bridge', p: 'logi', tier: 2, cost: 35000,  name: '渡し橋',  unlock: ['bridge'] },
    { key: 'r_belt',   p: 'logi', tier: 1, cost: 2000,  name: '送り道の強化',
      stat: 'belt', per: 0.25, max: 8, costMul: 1.4 },

    { key: 'r_sell',   p: 'logi', tier: 1, cost: 1500,  name: '店の評判',
      stat: 'sellRate', per: 0.02, max: 20, costMul: 1.25 },
    { key: 'r_price',  p: 'logi', tier: 2, cost: 20000, name: '値付けの妙',
      stat: 'price', per: 0.02, max: 20, costMul: 1.24 },

    // 敷地
    { key: 'r_land',   p: 'land', tier: 1, cost: 1200,  name: '敷地の交渉',
      stat: 'land', per: 0.02, max: 20, costMul: 1.28 },
    { key: 'r_rubble', p: 'land', tier: 1, cost: 1000,   name: '瓦礫の撤去',
      stat: 'rock', per: 0.02, max: 20, costMul: 1.26 },
  ];

  const PILLARS = [
    { key: 'prod', name: '錬成' },
    { key: 'logi', name: '物流' },
    { key: 'land', name: '敷地' },
  ];

  // ---------------------------------------------------------------- 店の格
  // 累計売上で上がる。上がると師匠から手紙が届き、次の格の研究が買えるようになる。
  const TIERS = [
    { need: 0,       name: '露店',
      msg: ['よく来た。ここがお前の店だ。', '……小さいだろう。私も最初はここからだった。',
        '掘って、錬成して、売れ。それだけだ。'] },
    { need: 500,           name: '小さなお店',
      msg: ['看板を出せるようになったな。', '素材を掘って売るだけでは、いつまでも露店のままだ。',
        '錬成しろ。手を加えた分だけ値が付く。'] },
    { need: 15000,         name: '街の工房',
      msg: ['街の連中がお前の名を口にし始めた。', '工房を名乗っていい。',
        '棚に並ぶ品が増えるほど、客は遠くから来る。'] },
    { need: 300000,        name: '王都の名店',
      msg: ['王都から使いが来た。出店の許しが下りたぞ。', 'ここから先は、素材の数ではなく深さで決まる。',
        'クリスタルを扱える者は、この大陸に数えるほどしかいない。'] },
    { need: 1500000,       name: '大陸一の商会',
      msg: ['大陸一だ。もう私が教えることはない。', '……ひとつだけ言っておく。',
        '禁断とされる錬成がある。やるかどうかはお前が決めろ。'] },
    { need: 15000000,      name: '世界一の魔法のお店',
      msg: ['世界一だ。', 'お前の店の名は、この星のどこでも通じる。',
        '……店番を代わってくれないか。私はもう疲れた。'] },
  ];


  // ---------------------------------------------------------------- 風の便り
  // 店の品を買った誰かの噂が、風に乗って届く。
  //  hero  … 高い品が売れるほど先へ進む、ひと続きの物語。need は「その値段以上の品を売る」。
  //  rumor … その品を初めて売ったときに届く一報。全部の品に付ける必要はない。
  const LOG = {
    hero: [
      { key: 'h_start', need: 0,
        text: '勇者が旅立った。', note: '城で剣を授かった若者が、今朝ここを通っていった。' },
      { key: 'h_party', need: 20,
        text: '仲間が加わった。', note: '酒場で意気投合したらしい。三人になって旅を続けている。' },
      { key: 'h_key1', need: 56,
        text: '魔法の鍵を手に入れた。', note: 'どこの鍵屋にも作れない鍵だそうだ。開かない扉が、この国から少し減った。' },
      { key: 'h_ship', need: 80,
        text: '船を手に入れた。', note: '港で朽ちていた船が、なぜか動いたそうだ。' },
      { key: 'h_general', need: 176,
        text: '四天王の一人を倒した。', note: '西の塔から煙が上がった。あれで一人目だ。' },
      { key: 'h_continent', need: 256,
        text: '爆弾で洞窟の壁を破壊し、別の大陸に渡った。', note: '地鳴りがした。壁の向こうに、誰も知らない大陸があったらしい。' },
      { key: 'h_key2', need: 432,
        text: '神秘の鍵を手に入れた。', note: '二本目だ。今度は鍵屋ではなく、遺跡の底から出てきたという。' },
      { key: 'h_princess', need: 624,
        text: 'お姫様を助けた。', note: '王都は三日三晩の祝いだという。' },
      { key: 'h_seal', need: 720,
        text: '二人目の四天王の封印に成功した。', note: '倒せなかったので封じたそうだ。……封じた、で済むのか。' },
      { key: 'h_underworld', need: 1920,
        text: '地下世界に入った。', note: '井戸の底から風が吹いていると、井戸掘りが騒いでいる。下にも世界があるらしい。' },
      { key: 'h_emperor', need: 2370,
        text: '帝国の王に化けた三人目の四天王を倒した。', note: '帝国の王が四天王だった。道理で税が重かったわけだ。' },
      { key: 'h_key3', need: 3170,
        text: '最後の鍵を手に入れた。', note: '三本目で最後だという。これで開かない扉は無くなった。' },
      { key: 'h_airship', need: 4780,
        text: '飛行船を手に入れた。', note: '空を横切る影を見た、という客が今日だけで五人来た。' },
      { key: 'h_sky', need: 5570,
        text: 'ダーマの塔の頂上に行き、天空城に到達した。', note: '塔のてっぺんから空へ乗り換えたそうだ。城が浮いているという話は本当だった。' },
      { key: 'h_ally', need: 9460,
        text: '四人目の四天王が仲間になった。', note: '四天王が一人、こちら側に来たらしい。客として来たら、売っていいものか。' },
      { key: 'h_goddess', need: 11100,
        text: '女神の加護を受けた。', note: '祭壇の火が、あの一行が通ったあと三日燃え続けている。' },
      { key: 'h_ziz', need: 15000,
        text: '召喚獣ジズを手に入れた。', note: '大きな鳥だ。羽ばたいたとき、うちの看板が二度落ちた。' },
      { key: 'h_ultima', need: 29900,
        text: '最強魔法を手に入れた。', note: '唱えた場所から、山がひとつ無くなったという。' },
      { key: 'h_demon', need: 61100,
        text: '魔王を倒した。', note: '……うちの品が、どこまで行ったのか分からなくなってきたな。' },
    ],
    rumor: [
      { item: 'lantern',       text: '暗がりに明かりが灯った。', note: '誰も戻らなかった洞窟の奥から、人が出てきた。' },
      { item: 'bean',          text: '宿屋が困っている。', note: '旅人が食事をしなくなった。豆ひとつで足りるらしい。' },
      { item: 'compass',       text: '行方知れずの隊商が見つかった。', note: '砂漠の真ん中で、全員無事だった。' },
      { item: 'worldseed',     text: '枯れた大地に芽が出た。', note: '世界樹だ、と老人たちが言い張っている。' },
      { item: 'holysword',     text: '勇者が伝説の剣を抜いた。', note: '台座から抜けたのではない。買ったのだ。' },
      { item: 'eartharmor',    text: '鎧が一撃を受け止めた。', note: '着ていた男は、傷ひとつ無かったという。' },
      { item: 'manjimaru',     text: '名も知らぬ剣士が山賊団を斬り伏せた。', note: '一夜で、ひとりで。' },
      { item: 'fairy',         text: '精霊を解放した。', note: '長く封じられていた道案内の精霊が、空へ還っていった。' },
      { item: 'homunculus',    text: '人ならぬ者が街を歩いている。', note: '礼儀正しい、と評判は悪くない。' },
      { item: 'crystal_fire',  text: '火のクリスタルが復活した。', note: '火山のほとりの祭壇に、炎が戻った。' },
      { item: 'crystal_water', text: '水のクリスタルが復活した。', note: '涸れた泉が、ひと晩で満ちた。' },
      { item: 'crystal_wind',  text: '風のクリスタルが復活した。', note: '止まっていた風車が、一斉に回り出した。' },
      { item: 'crystal_earth', text: '土のクリスタルが復活した。', note: '地震が止んだ。もう半年も揺れていない。' },
      { item: 'crystal_light', text: '光のクリスタルが復活した。', note: '夜が、少しだけ短くなった気がする。' },
      { item: 'crystal_dark',  text: '闇のクリスタルが復活した。', note: '……これは、戻してよかったのだろうか。' },
      { item: 'tablet',        text: 'ガラス太郎を名乗る男が現れた。', note: '板を掲げて何か読み上げている。本人は得意げだ。' },
      { item: 'savecircle',    text: '死んでも戻れる、と言い出す者が増えた。', note: '試した者はまだ帰ってきていない。' },
      { item: 'paradise',      text: '荒れ地に村ができた。', note: '土がいい、と皆が口を揃える。' },
      { item: 'elixir',        text: '死んだはずの騎士が歩いている。', note: '本人は何も覚えていないらしい。' },
      { item: 'philosopher',   text: '錬金術師たちが色めき立っている。', note: 'うちの店の前に列ができた。売り物はもう無い。' },
      { item: 'guardian',      text: '城門の前に動く石像が立った。', note: '王は満足げだが、門番たちは職を失った。' },
      { item: 'dragon',        text: '竜の姿をした鎧が戦場をひとりで片付けた。', note: '中に誰が入っているのか、誰も知らない。' },
      { item: 'egg',           text: '地の底で何かが脈打っている。', note: '卵だ、と言った者がいる。何の卵かは言わなかった。' },
      { item: 'wing',          text: '冥王が目を覚ました。', note: '……お前、あれを売ったのか。' },
    ],
  };

  // ---------------------------------------------------------------- 敷地
  const BOARD = {
    w: 9, h: 7, maxW: 22, maxH: 15,
    landBase: 300, landStep: 1.45,  // 1区画買うたびに値段が上がる
    // 岩は1つ壊すたびに次が高くなる。序盤は手が出ず、中盤に「どうしても邪魔な1つ」を買い、
    // 終盤はまた手が出なくなる。研究の「瓦礫の撤去」はこの値段を下げる。
    rockCost: 1000, rockStep: 1.16, rockRate: 0.14,
    startMoney: 300,
  };

  // 設備のレベル。速さが上がる。
  const LEVEL = { max: 5, costMul: 1.8, speedMul: 0.78 };

  // 初期解放。魔鉱石の採取地1と魔鉱石屋1だけ置いてある状態から始まる。
  const START_UNLOCK = ['src_magicore', 'shop'];

  global.ALCHEMY = {
    ITEMS, SOURCES, RECIPES, FLAVOR, LOGI, SHOP, RESEARCH, PILLARS,
    TIERS, LOG, BOARD, LEVEL, START_UNLOCK,
  };
})(window);
