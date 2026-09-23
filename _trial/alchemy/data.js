// 錬金工場と魔法のお店 のデータ。
//
// 品目とレシピは MindMap の「錬金工場と魔法のお店.json」から起こしたもの。
// 材料と生成物の向きは、盤面のx座標（左が材料・右が生成物）で決めた。
// 数値はすべて仮。バランス調整はこのファイルだけを触って済ませる。
// レシピを1行足せば、錬成陣のカードもお店のカードも図鑑も自動で増える。
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- 品目
  // tier は錬成の段。price は売値。「1つ作るのに要る原料の数 × 段」に比例させた仮値。
  // shape / mark は art.js の描き分け。色だけに頼らず、形か中の印が必ず違う。
  const ITEMS = {
    // ---- 原料
    magicore:      { name: '魔鉱石', tier: 0, price: 2, color: '#b07ce8', shape: 'oregem' },
    herb:          { name: '深緑の野草', tier: 0, price: 2, color: '#6fc36a', shape: 'herb' },
    volcano:       { name: '火山の力', tier: 0, price: 2, color: '#e8703f', shape: 'volcano' },
    pearl:         { name: '深海の真珠', tier: 0, price: 2, color: '#7fd8e8', shape: 'pearl' },
    slough:        { name: '大蛇の抜け殻', tier: 0, price: 2, color: '#c2a86a', shape: 'slough' },
    // ---- 一次
    earth:         { name: '土の魔力', tier: 1, price: 3, color: '#c08b4a', shape: 'rune', mark: 'earth' },
    anima_life:    { name: '生命のアニマ', tier: 1, price: 3, color: '#e8899a', shape: 'anima', mark: 'life' },
    water:         { name: '水の魔力', tier: 1, price: 3, color: '#4fb8e8', shape: 'rune', mark: 'water' },
    magicstone:    { name: '魔石', tier: 1, price: 3, color: '#a98fd8', shape: 'magicstone' },
    fire:          { name: '火の魔力', tier: 1, price: 3, color: '#f2703c', shape: 'rune', mark: 'fire' },
    anima_gem:     { name: '宝石のアニマ', tier: 1, price: 3, color: '#6fd0d8', shape: 'anima', mark: 'gem' },
    anima_plant:   { name: '植物のアニマ', tier: 1, price: 3, color: '#7cc46f', shape: 'anima', mark: 'plant' },
    wind:          { name: '風の魔力', tier: 1, price: 3, color: '#7fd8a8', shape: 'rune', mark: 'wind' },
    anima_ore:     { name: '鉱石のアニマ', tier: 1, price: 3, color: '#9aa7b4', shape: 'anima', mark: 'ore' },
    anima_energy:  { name: 'エナジーのアニマ', tier: 1, price: 3, color: '#f0b448', shape: 'anima', mark: 'energy' },
    // ---- 二次
    ring:          { name: '流水の指輪', tier: 2, price: 7, color: '#5bc8e8', shape: 'ring' },
    lifecrystal:   { name: '生命の結晶', tier: 2, price: 7, color: '#f07fa0', shape: 'lifecrystal' },
    dark:          { name: '闇の魔力', tier: 2, price: 7, color: '#9166c9', shape: 'rune', mark: 'dark' },
    light:         { name: '光の魔力', tier: 2, price: 7, color: '#f7e07a', shape: 'rune', mark: 'light' },
    shield:        { name: '大地の盾', tier: 2, price: 7, color: '#c08b4a', shape: 'shield' },
    potion:        { name: '魔法水', tier: 2, price: 7, color: '#56b8e0', shape: 'potion' },
    cloak:         { name: '突風のマント', tier: 2, price: 7, color: '#7fd8a8', shape: 'cloak' },
    firesword:     { name: '火の剣', tier: 2, price: 7, color: '#f2703c', shape: 'firesword' },
    darkorb:       { name: '闇の水晶', tier: 2, price: 10, color: '#8f63c4', shape: 'darkorb' },
    lantern:       { name: '無限のランタン', tier: 2, price: 10, color: '#f7dc6a', shape: 'lantern' },
    compass:       { name: '人探しのコンパス', tier: 2, price: 10, color: '#d8a24a', shape: 'compass' },
    seed:          { name: '魔法の種子', tier: 2, price: 7, color: '#8fd06a', shape: 'seed' },
    bean:          { name: '満腹の豆', tier: 2, price: 10, color: '#d8c06a', shape: 'bean' },
    glass:         { name: '魔法のガラス', tier: 2, price: 7, color: '#a6d8e8', shape: 'glass' },
    cloth:         { name: '魔法の布', tier: 2, price: 7, color: '#e07fb0', shape: 'cloth' },
    bomb:          { name: '爆裂石', tier: 2, price: 7, color: '#e0603c', shape: 'bomb' },
    phantomglass:  { name: '夢幻のガラス', tier: 2, price: 20, color: '#b8e0f0', shape: 'phantomglass' },
    // ---- 三次
    holysword:     { name: '天光の剣', tier: 3, price: 25, color: '#f7e8a0', shape: 'holysword' },
    eartharmor:    { name: '大地の鎧', tier: 3, price: 25, color: '#b08040', shape: 'armor' },
    tent:          { name: '魔法のテント', tier: 3, price: 29, color: '#d09060', shape: 'tent' },
    hellwind:      { name: '魔界の風', tier: 3, price: 16, color: '#9166c9', shape: 'swirl' },
    heavensoil:    { name: '天界の土', tier: 3, price: 16, color: '#f0d090', shape: 'soil' },
    worldseed:     { name: '世界樹の種', tier: 3, price: 25, color: '#6fc36a', shape: 'worldseed' },
    machine:       { name: '魔導機', tier: 3, price: 12, color: '#8fa0c0', shape: 'machine' },
    hollow:        { name: '世界樹の洞（うろ）', tier: 3, price: 78, color: '#7fa860', shape: 'hollow' },
    gallian:       { name: '罪人の剣《ガリアンソード》', tier: 3, price: 20, color: '#c05050', shape: 'whipsword' },
    manjimaru:     { name: '卍卍丸（まんじまんじまる）', tier: 3, price: 57, color: '#e8e0d0', shape: 'katana' },
    homunculus:    { name: 'ホムンクルス', tier: 3, price: 57, color: '#f0c0b0', shape: 'homunculus' },
    crystal:       { name: 'クリスタル', tier: 3, price: 57, color: '#c0a8e8', shape: 'crystal' },
    crystal_light: { name: '光のクリスタル', tier: 3, price: 66, color: '#f7e07a', shape: 'crystal', mark: 'light' },
    crystal_water: { name: '水のクリスタル', tier: 3, price: 61, color: '#4fb8e8', shape: 'crystal', mark: 'water' },
    crystal_fire:  { name: '火のクリスタル', tier: 3, price: 61, color: '#f2703c', shape: 'crystal', mark: 'fire' },
    fairy:         { name: '道しるべの妖精', tier: 3, price: 82, color: '#f0a0d8', shape: 'fairy' },
    warrior:       { name: '魔装兵', tier: 3, price: 107, color: '#a0b0c8', shape: 'warrior' },
    beanstalk:     { name: '天空の豆の木', tier: 3, price: 29, color: '#5fb85f', shape: 'beanstalk' },
    emblem:        { name: '炎の紋章', tier: 3, price: 25, color: '#e87040', shape: 'emblem' },
    crystal_wind:  { name: '風のクリスタル', tier: 3, price: 61, color: '#7fd8a8', shape: 'crystal', mark: 'wind' },
    crystal_earth: { name: '土のクリスタル', tier: 3, price: 61, color: '#c08b4a', shape: 'crystal', mark: 'earth' },
    crystal_dark:  { name: '闇のクリスタル', tier: 3, price: 66, color: '#9166c9', shape: 'crystal', mark: 'dark' },
    guardian:      { name: '主守', tier: 3, price: 242, color: '#c8b060', shape: 'guardian' },
    magicarmor:    { name: '魔導鎧', tier: 3, price: 184, color: '#7f8fd0', shape: 'magicarmor' },
    necklace:      { name: '聖女の首飾り', tier: 3, price: 90, color: '#f0d8f0', shape: 'necklace' },
    egg:           { name: '冥王の卵', tier: 3, price: 160, color: '#8060a0', shape: 'egg' },
    eye:           { name: '水晶の瞳', tier: 3, price: 98, color: '#a0e0f0', shape: 'eye' },
    philosopher:   { name: '賢者の石', tier: 3, price: 189, color: '#f05070', shape: 'philosopher' },
    elixir:        { name: 'エリクサー', tier: 3, price: 189, color: '#f0e060', shape: 'elixir' },
    dragon:        { name: '竜戦士《ドラゴンウォリアー》', tier: 3, price: 332, color: '#e05030', shape: 'dragon' },
    tablet:        { name: '魔法のガラス板', tier: 3, price: 98, color: '#90d0f0', shape: 'tablet' },
    savecircle:    { name: '星影歩《セイブ》の魔法陣', tier: 3, price: 189, color: '#c0a0f0', shape: 'savecircle' },
    paradise:      { name: '王道楽土', tier: 3, price: 66, color: '#8fd870', shape: 'paradise' },
    flamesword:    { name: '炎の剣', tier: 3, price: 144, color: '#ff8030', shape: 'flamesword' },
    wing:          { name: '冥王の翼', tier: 3, price: 537, color: '#7040a0', shape: 'wing' },
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
  const RECIPES = [
    // ---- 一次
    { key: 'f_earth', make: 'earth', in: ['slough'], secs: 1.4, cost: 46 },
    { key: 'f_anima_life', make: 'anima_life', in: ['slough'], secs: 1.4, cost: 46 },
    { key: 'f_water', make: 'water', in: ['pearl'], secs: 1.4, cost: 46 },
    { key: 'f_magicstone', make: 'magicstone', in: ['magicore'], secs: 1.4, cost: 46 },
    { key: 'f_fire', make: 'fire', in: ['volcano'], secs: 1.4, cost: 46 },
    { key: 'f_anima_gem', make: 'anima_gem', in: ['pearl'], secs: 1.4, cost: 46 },
    { key: 'f_anima_plant', make: 'anima_plant', in: ['herb'], secs: 1.4, cost: 46 },
    { key: 'f_wind', make: 'wind', in: ['herb'], secs: 1.4, cost: 46 },
    { key: 'f_anima_ore', make: 'anima_ore', in: ['magicore'], secs: 1.4, cost: 46 },
    { key: 'f_anima_energy', make: 'anima_energy', in: ['volcano'], secs: 1.4, cost: 46 },
    // ---- 二次
    { key: 'f_ring', make: 'ring', in: ['water', 'anima_gem'], secs: 1.8, cost: 54 },
    { key: 'f_lifecrystal', make: 'lifecrystal', in: ['anima_energy', 'anima_life'], secs: 1.8, cost: 54 },
    { key: 'f_dark', make: 'dark', in: ['earth', 'fire'], secs: 1.8, cost: 54 },
    { key: 'f_light', make: 'light', in: ['wind', 'water'], secs: 1.8, cost: 54 },
    { key: 'f_shield', make: 'shield', in: ['earth', 'anima_plant'], secs: 1.8, cost: 54 },
    { key: 'f_potion', make: 'potion', in: ['water', 'anima_energy'], secs: 1.8, cost: 54 },
    { key: 'f_cloak', make: 'cloak', in: ['wind', 'anima_life'], secs: 1.8, cost: 54 },
    { key: 'f_firesword', make: 'firesword', in: ['anima_ore', 'fire'], secs: 1.8, cost: 54 },
    { key: 'f_darkorb', make: 'darkorb', in: ['dark', 'magicstone'], secs: 1.8, cost: 60 },
    { key: 'f_lantern', make: 'lantern', in: ['light', 'anima_ore'], secs: 1.8, cost: 60 },
    { key: 'f_compass', make: 'compass', in: ['cloak', 'magicstone'], secs: 1.8, cost: 60 },
    { key: 'f_seed', make: 'seed', in: ['anima_plant', 'anima_gem'], secs: 1.8, cost: 54 },
    { key: 'f_bean', make: 'bean', in: ['anima_plant', 'light'], secs: 1.8, cost: 60 },
    { key: 'f_glass', make: 'glass', in: ['magicstone', 'anima_energy'], secs: 1.8, cost: 54 },
    { key: 'f_cloth', make: 'cloth', in: ['anima_life', 'anima_plant'], secs: 1.8, cost: 54 },
    { key: 'f_bomb', make: 'bomb', in: ['anima_ore', 'fire'], secs: 1.8, cost: 54 },
    { key: 'f_phantomglass', make: 'phantomglass', in: ['darkorb', 'lantern'], secs: 1.8, cost: 80 },
    // ---- 三次
    { key: 'f_holysword', make: 'holysword', in: ['firesword', 'ring', 'bomb'], secs: 2.4, cost: 90 },
    { key: 'f_eartharmor', make: 'eartharmor', in: ['shield', 'cloak', 'lifecrystal'], secs: 2.4, cost: 90 },
    { key: 'f_tent', make: 'tent', in: ['cloth', 'glass', 'lantern'], secs: 2.4, cost: 98 },
    { key: 'f_hellwind', make: 'hellwind', in: ['wind', 'dark', 'water'], secs: 2.4, cost: 72 },
    { key: 'f_heavensoil', make: 'heavensoil', in: ['light', 'earth', 'fire'], secs: 2.4, cost: 72 },
    { key: 'f_worldseed', make: 'worldseed', in: ['seed', 'potion', 'lifecrystal'], secs: 2.4, cost: 90 },
    { key: 'f_machine', make: 'machine', in: ['magicstone', 'anima_gem', 'anima_ore'], secs: 2.4, cost: 64 },
    { key: 'f_hollow', make: 'hollow', in: ['worldseed', 'tent', 'eartharmor'], secs: 2.4, cost: 196 },
    { key: 'f_gallian', make: 'gallian', in: ['firesword', 'machine'], secs: 2.4, cost: 80 },
    { key: 'f_manjimaru', make: 'manjimaru', in: ['holysword', 'phantomglass', 'bomb'], secs: 2.4, cost: 154 },
    { key: 'f_homunculus', make: 'homunculus', in: ['heavensoil', 'worldseed', 'hellwind'], secs: 2.4, cost: 154 },
    { key: 'f_crystal', make: 'crystal', in: ['hellwind', 'heavensoil', 'phantomglass'], secs: 2.4, cost: 154 },
    { key: 'f_crystal_light', make: 'crystal_light', in: ['crystal', 'light'], secs: 2.4, cost: 172 },
    { key: 'f_crystal_water', make: 'crystal_water', in: ['crystal', 'water'], secs: 2.4, cost: 162 },
    { key: 'f_crystal_fire', make: 'crystal_fire', in: ['crystal', 'fire'], secs: 2.4, cost: 162 },
    { key: 'f_fairy', make: 'fairy', in: ['homunculus', 'compass', 'bean'], secs: 2.4, cost: 204 },
    { key: 'f_warrior', make: 'warrior', in: ['homunculus', 'eartharmor', 'holysword'], secs: 2.4, cost: 254 },
    { key: 'f_beanstalk', make: 'beanstalk', in: ['bean', 'seed', 'cloth'], secs: 2.4, cost: 98 },
    { key: 'f_emblem', make: 'emblem', in: ['shield', 'ring', 'firesword'], secs: 2.4, cost: 90 },
    { key: 'f_crystal_wind', make: 'crystal_wind', in: ['crystal', 'wind'], secs: 2.4, cost: 162 },
    { key: 'f_crystal_earth', make: 'crystal_earth', in: ['crystal', 'earth'], secs: 2.4, cost: 162 },
    { key: 'f_crystal_dark', make: 'crystal_dark', in: ['crystal', 'dark'], secs: 2.4, cost: 172 },
    { key: 'f_guardian', make: 'guardian', in: ['warrior', 'hollow', 'manjimaru'], secs: 2.4, cost: 524 },
    { key: 'f_magicarmor', make: 'magicarmor', in: ['warrior', 'crystal_dark', 'machine'], secs: 2.4, cost: 408 },
    { key: 'f_necklace', make: 'necklace', in: ['crystal_water', 'emblem', 'anima_gem'], secs: 2.4, cost: 220 },
    { key: 'f_egg', make: 'egg', in: ['emblem', 'homunculus', 'hollow'], secs: 2.4, cost: 360 },
    { key: 'f_eye', make: 'eye', in: ['glass', 'fairy', 'potion'], secs: 2.4, cost: 236 },
    { key: 'f_philosopher', make: 'philosopher', in: ['crystal_light', 'crystal_fire', 'crystal_earth'], secs: 2.4, cost: 418 },
    { key: 'f_elixir', make: 'elixir', in: ['crystal_wind', 'crystal_dark', 'crystal_water'], secs: 2.4, cost: 418 },
    { key: 'f_dragon', make: 'dragon', in: ['fairy', 'magicarmor', 'crystal_light'], secs: 2.4, cost: 704 },
    { key: 'f_tablet', make: 'tablet', in: ['crystal_wind', 'machine', 'phantomglass'], secs: 2.4, cost: 236 },
    { key: 'f_savecircle', make: 'savecircle', in: ['crystal_earth', 'beanstalk', 'eye'], secs: 2.4, cost: 418 },
    { key: 'f_paradise', make: 'paradise', in: ['heavensoil', 'gallian', 'tent'], secs: 2.4, cost: 172 },
    { key: 'f_flamesword', make: 'flamesword', in: ['emblem', 'crystal_fire', 'manjimaru'], secs: 2.4, cost: 328 },
    { key: 'f_wing', make: 'wing', in: ['elixir', 'philosopher', 'egg'], secs: 2.4, cost: 1114 },
  ];
  // ---------------------------------------------------------------- 物流
  const LOGI = [
    { key: 'split', name: '分配陣', cost: 60 },
    { key: 'store', name: '保管庫', cost: 90, hold: 8 },
  ];

  // ---------------------------------------------------------------- お店
  // 品目ごとに別の売り場。錬成できるようになった品の店が自動で並ぶ。
  const SHOP = { baseCost: 30, costPerPrice: 4, secs: 1.2 };

  // ---------------------------------------------------------------- 研究
  // tier は店の格。その格に届くまで、見えてはいるが買えない。
  const RESEARCH = [
    // 錬成
    { key: 'r_stone',    p: 'prod', tier: 0, cost: 60,    name: '魔石の錬成',
      unlock: ['f_magicstone', 'f_anima_ore'] },
    { key: 'r_herb',     p: 'prod', tier: 0, cost: 130,   name: '深緑の野草',
      unlock: ['src_herb', 'f_wind', 'f_anima_plant'] },
    { key: 'r_pearl',    p: 'prod', tier: 1, cost: 260,   name: '深海の真珠',
      unlock: ['src_pearl', 'f_water', 'f_anima_gem'] },
    { key: 'r_slough',   p: 'prod', tier: 1, cost: 380,   name: '大蛇の抜け殻',
      unlock: ['src_slough', 'f_earth', 'f_anima_life'] },
    { key: 'r_volcano',  p: 'prod', tier: 1, cost: 520,   name: '火山の力',
      unlock: ['src_volcano', 'f_fire', 'f_anima_energy'] },
    { key: 'r_lightdark', p: 'prod', tier: 1, cost: 700,  name: '光と闇',
      unlock: ['f_light', 'f_dark'] },
    { key: 'r_craft',    p: 'prod', tier: 2, cost: 1400,  name: '工房の技',
      unlock: ['f_glass', 'f_cloth', 'f_bomb'] },
    { key: 'r_tools',    p: 'prod', tier: 2, cost: 1800,  name: '装いの錬成',
      unlock: ['f_ring', 'f_shield', 'f_cloak', 'f_firesword'] },
    { key: 'r_life',     p: 'prod', tier: 2, cost: 1800,  name: '暮らしの錬成',
      unlock: ['f_potion', 'f_lifecrystal', 'f_seed', 'f_bean'] },
    { key: 'r_mystic',   p: 'prod', tier: 2, cost: 2600,  name: '神秘の錬成',
      unlock: ['f_lantern', 'f_darkorb', 'f_compass', 'f_phantomglass', 'f_tent'] },
    { key: 'r_elem3',    p: 'prod', tier: 2, cost: 3200,  name: '天界と魔界',
      unlock: ['f_heavensoil', 'f_hellwind'] },
    { key: 'r_crystal',  p: 'prod', tier: 3, cost: 8000,  name: 'クリスタル',
      unlock: ['f_crystal', 'f_crystal_light', 'f_crystal_water', 'f_crystal_fire',
        'f_crystal_wind', 'f_crystal_earth', 'f_crystal_dark'] },
    { key: 'r_armory',   p: 'prod', tier: 3, cost: 7000,  name: '武具の錬成',
      unlock: ['f_eartharmor', 'f_holysword', 'f_machine', 'f_gallian'] },
    { key: 'r_garden',   p: 'prod', tier: 3, cost: 7000,  name: '世界樹',
      unlock: ['f_worldseed', 'f_hollow', 'f_beanstalk', 'f_paradise'] },
    { key: 'r_relic',    p: 'prod', tier: 4, cost: 22000, name: '秘宝の錬成',
      unlock: ['f_necklace', 'f_eye', 'f_tablet', 'f_savecircle', 'f_magicarmor'] },
    { key: 'r_life3',    p: 'prod', tier: 4, cost: 26000, name: '人造の生命',
      unlock: ['f_homunculus', 'f_fairy', 'f_warrior', 'f_guardian'] },
    { key: 'r_blade',    p: 'prod', tier: 4, cost: 30000, name: '伝説の刃',
      unlock: ['f_manjimaru', 'f_emblem', 'f_flamesword', 'f_dragon'] },
    { key: 'r_forbidden', p: 'prod', tier: 4, cost: 45000, name: '禁断の錬成',
      unlock: ['f_philosopher', 'f_elixir', 'f_egg', 'f_wing'] },

    // 物流
    { key: 'r_split',  p: 'logi', tier: 1, cost: 300,   name: '分配陣',        unlock: ['split'] },
    { key: 'r_belt1',  p: 'logi', tier: 1, cost: 500,   name: '送り道の強化',  belt: 1 },
    { key: 'r_store',  p: 'logi', tier: 2, cost: 700,   name: '保管庫',        unlock: ['store'] },
    { key: 'r_bridge', p: 'logi', tier: 2, cost: 1600,  name: '渡し橋',        unlock: ['bridge'] },
    { key: 'r_belt2',  p: 'logi', tier: 3, cost: 4000,  name: '送り道の強化2', belt: 1 },

    // 販売
    { key: 'r_sell1',  p: 'sell', tier: 1, cost: 350,   name: '評判',          sellRate: 0.25 },
    { key: 'r_price1', p: 'sell', tier: 2, cost: 1800,  name: '値付けの妙',    price: 0.15 },
    { key: 'r_sell2',  p: 'sell', tier: 3, cost: 4500,  name: '評判2',         sellRate: 0.25 },
    { key: 'r_price2', p: 'sell', tier: 4, cost: 12000, name: '値付けの妙2',   price: 0.15 },

    // 敷地
    { key: 'r_land1',  p: 'land', tier: 1, cost: 400,   name: '敷地の交渉',    land: 0.25 },
    { key: 'r_rubble', p: 'land', tier: 1, cost: 250,   name: '瓦礫の撤去',    rock: 0.5 },
    { key: 'r_land2',  p: 'land', tier: 3, cost: 3500,  name: '敷地の交渉2',   land: 0.25 },
  ];

  const PILLARS = [
    { key: 'prod', name: '錬成' },
    { key: 'logi', name: '物流' },
    { key: 'sell', name: '販売' },
    { key: 'land', name: '敷地' },
  ];

  // ---------------------------------------------------------------- 店の格
  // 累計売上で上がる。上がると師匠から手紙が届き、次の格の研究が買えるようになる。
  const TIERS = [
    { need: 0,       name: '露店',
      msg: ['よく来た。ここがお前の店だ。', '……小さいだろう。私も最初はここからだった。',
        '掘って、錬成して、売れ。それだけだ。'] },
    { need: 600,     name: '小さなお店',
      msg: ['看板を出せるようになったな。', '素材を掘って売るだけでは、いつまでも露店のままだ。',
        '錬成しろ。手を加えた分だけ値が付く。'] },
    { need: 5000,    name: '街の工房',
      msg: ['街の連中がお前の名を口にし始めた。', '工房を名乗っていい。',
        '棚に並ぶ品が増えるほど、客は遠くから来る。'] },
    { need: 40000,   name: '王都の名店',
      msg: ['王都から使いが来た。出店の許しが下りたぞ。', 'ここから先は、素材の数ではなく深さで決まる。',
        'クリスタルを扱える者は、この大陸に数えるほどしかいない。'] },
    { need: 300000,  name: '大陸一の商会',
      msg: ['大陸一だ。もう私が教えることはない。', '……ひとつだけ言っておく。',
        '禁断とされる錬成がある。やるかどうかはお前が決めろ。'] },
    { need: 2000000, name: '世界一の魔法のお店',
      msg: ['世界一だ。', 'お前の店の名は、この星のどこでも通じる。',
        '……店番を代わってくれないか。私はもう疲れた。'] },
  ];

  // ---------------------------------------------------------------- 敷地
  const BOARD = {
    w: 9, h: 7, maxW: 22, maxH: 15,
    landBase: 90, landStep: 1.32,   // 1区画買うたびに値段が上がる
    rockCost: 60, rockRate: 0.14,
    startMoney: 60,
  };

  // 設備のレベル。速さが上がる。
  const LEVEL = { max: 5, costMul: 1.8, speedMul: 0.78 };

  // 初期解放。魔鉱石の採取地1と魔鉱石屋1だけ置いてある状態から始まる。
  const START_UNLOCK = ['src_magicore'];

  global.ALCHEMY = {
    ITEMS, SOURCES, RECIPES, LOGI, SHOP, RESEARCH, PILLARS,
    TIERS, BOARD, LEVEL, START_UNLOCK,
  };
})(window);
