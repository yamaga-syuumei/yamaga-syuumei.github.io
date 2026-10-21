# 勇者の一行・敵・てびきのフェアリーのドット絵を作り、sprites.js に書き出す。
#
#   python _sprites.py           … sprites.js と、確認用の _sprites_preview.png を書き出す
#
# 人（勇者・魔法使い・僧侶・骸骨）とフェアリーは 28×24 の2頭身。1ドットずつ置いた部品を
# コマごとにずらして組み、最後に濃い輪郭で縁取る（F:\30_Program\Prototype\goblin の作りに合わせた）。
# スライム・コウモリ・幽霊・ドラゴンは形（円・多角形）で組み、左上から光が当たるとして3段の陰影を付ける。
# 色は文字1つで書き出すので、ゲーム側で色だけ差し替えられる（ランクで服や剣の色が変わる）。
import os, struct, zlib, math

OUT = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- 材質
# 名前 → 明・中・暗の3色。'=名前' は別の材質と同じ色を使う。sep は手前の部品で、
# 奥の部品との境目を自分の暗い色で縁取って分ける（形で組む敵だけが使う）
MAT = {
    'skin':   ['#ffe2c4', '#f0b892', '#bd7a5c'],
    'hair':   ['#e0904a', '#a85a28', '#663014'],
    'tunic':  ['#7ab4ff', '#3a72d8', '#22408a'],
    'sleeve': ['=tunic', 'sep'],
    'arm':    ['=skin', 'sep'],
    'cape':   ['#ff7a6a', '#d23c3c', '#7e1e2a'],
    'belt':   ['#c88a46', '#8e5626', '#5a3214'],
    'pants':  ['#7a6aa8', '#544684', '#342a58'],
    'boots':  ['#a8743e', '#6e4420', '#43260e'],
    'blade':  ['#ffffff', '#cfd8e6', '#8a96b0'],
    'hilt':   ['#ffe27a', '#d8a028', '#8a5a10'],
    'trim':   ['=hilt'],
    'robe':   ['#b58cf0', '#7a4ac8', '#43246e'],
    'hat':    ['#9a6ae0', '#6a3aa8', '#38185e'],
    'beard':  ['#ffffff', '#d8d8e8', '#9a9ab4'],
    'wood':   ['#c8925a', '#8e5a2a', '#5a3414'],
    'gem':    ['#c8ffff', '#7ff0ff', '#2ab0d8'],
    'white':  ['#ffffff', '#e8eaf8', '#aeb0d0'],
    'blond':  ['#fff2b0', '#f0c450', '#b07a20'],
    'slime':  ['#b4ffa6', '#4cc85a', '#24803a'],
    'batb':   ['#b89ae4', '#6a4aa8', '#3a2468'],
    'batw':   ['#7a5ab8', '#4a2e82', '#24123e'],
    'bone':   ['#ffffff', '#e2dcc8', '#a89c84'],
    'ghost':  ['#ffffff', '#c8d8ff', '#7a8ad8'],
    'scale':  ['#ff8a6a', '#d0443a', '#7a1e26'],
    'belly':  ['#ffe0a0', '#e8b060', '#a8742a'],
    'wingm':  ['#e86a7a', '#a8344a', '#5a1428'],
    'horn':   ['=bone'],
    'rust':   ['#d8b088', '#9a6a44', '#5a3a22'],
}
FLAT = {   # 陰影を付けない1色の部品
    'eye': '#2a1a3a', 'eyew': '#ffffff', 'red': '#ff4040', 'yel': '#ffe040',
    'mouth': '#b0405a', 'blush': '#ff9ab0', 'glow': '#ffffff', 'fire': '#ffb040', 'smear': None,
}
OUTLINE = ('K', '#1c1226')

# てびきのフェアリーの色。参考の絵と同じ。羽は半透明
FAIRY_PAL = {
    'K': (70, 44, 80), 'q': (120, 170, 220, 200), 'a': (196, 236, 255, 140), 'A': (236, 250, 255, 220),
    'y': (250, 210, 104), 'Y': (255, 242, 176), 'o': (214, 146, 70),
    's': (255, 222, 192), 'z': (238, 178, 158), 'p': (255, 148, 160), 'r': (196, 76, 96),
    'E': (72, 50, 96), 'W': (255, 255, 255), 'F': (255, 120, 170),
    'd': (255, 180, 214), 'D': (232, 118, 170), 'w': (255, 255, 255),
    'x': (255, 236, 130), 'X': (255, 255, 255), 'c': (255, 150, 200), 'b': (170, 230, 255),
}

# 文字を材質ごとに配る。'.' は透明、K は輪郭、* は剣の残像、+ は光
POOL = [c for c in 'ABCDEFGHIJLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?#%&@<>{}[]^~=:;,_$/()|'
        'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん']
LET, PAL = {}, {OUTLINE[0]: OUTLINE[1]}
_i = 0
for _name, _v in MAT.items():
    if _v[0].startswith('='):
        continue
    LET[_name] = POOL[_i:_i + 3]
    for _k in range(3):
        PAL[POOL[_i + _k]] = _v[_k]
    _i += 3
for _name, _v in MAT.items():
    if _v[0].startswith('='):
        LET[_name] = LET[_v[0][1:]]
FLET = {}
for _name, _col in FLAT.items():
    if _name == 'smear':
        FLET[_name] = '*'
    elif _name == 'glow':
        FLET[_name] = '+'
    else:
        FLET[_name] = POOL[_i]; PAL[POOL[_i]] = _col; _i += 1
FAIRY_LET = {}
for _k, _v in FAIRY_PAL.items():
    FAIRY_LET[_k] = POOL[_i]
    PAL[POOL[_i]] = ('#%02x%02x%02x' % _v[:3]) if len(_v) == 3 else 'rgba(%d,%d,%d,%.3f)' % (_v[0], _v[1], _v[2], _v[3] / 255)
    _i += 1
assert _i <= len(POOL)


def palette():
    return dict(PAL)


def code_map(spec):
    # 部品の中で使う短い記号 → 書き出す文字。値は (材質, 明0/中1/暗2) か 1色の部品の名前
    return {k: (FLET[v] if isinstance(v, str) else LET[v[0]][v[1]]) for k, v in spec.items()}


# ---------------------------------------------------------------- 1ドットずつ置く絵
FW, FH = 28, 24


class Pix:
    def __init__(self, cmap, w=FW, h=FH):
        self.w, self.h, self.c = w, h, cmap
        self.g = [['.'] * w for _ in range(h)]

    def put(self, x, y, code):
        if code == '.':
            return
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            self.g[y][x] = self.c[code]

    def rows(self, rows, dx=0, dy=0):
        for y, spans in rows:
            for x0, s in spans.items():
                for i, ch in enumerate(s):
                    self.put(x0 + i + dx, y + dy, ch)

    def pts(self, pts, dx=0, dy=0):
        for x, y, ch in pts:
            self.put(x + dx, y + dy, ch)

    def line(self, x0, y0, x1, y1, code):
        n = max(abs(x1 - x0), abs(y1 - y0))
        for i in range(n + 1):
            t = i / n if n else 0
            self.put(round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t), code)

    def done(self, smear=(), glow=()):
        # 輪郭を引いてから、縁取らない残像と光を置く
        g = self.g
        out = [r[:] for r in g]
        for y in range(self.h):
            for x in range(self.w):
                if g[y][x] != '.':
                    continue
                for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + ox, y + oy
                    if 0 <= nx < self.w and 0 <= ny < self.h and g[ny][nx] not in '.*+':
                        out[y][x] = OUTLINE[0]
                        break
        for x, y in smear:
            if 0 <= x < self.w and 0 <= y < self.h and out[y][x] == '.':
                out[y][x] = '*'
        for x, y in glow:
            if 0 <= x < self.w and 0 <= y < self.h and out[y][x] in '.' + OUTLINE[0]:
                out[y][x] = '+'
        return [''.join(r) for r in out]


# 脚。(股から足首までの点, (つま先の x, 足の段, 足の長さ))。足は前（右）へ伸びる
LEGS_STAND = {'back': ([(10, 18), (10, 19), (10, 20)], (10, 21, 3)),
              'front': ([(13, 18), (13, 19), (14, 20)], (14, 21, 3))}
LEGS_STRIDE_A = {'back': ([(10, 18), (9, 19), (8, 20)], (7, 21, 3)),
                 'front': ([(13, 18), (14, 19), (15, 20)], (15, 21, 3))}
LEGS_STRIDE_B = {'back': ([(13, 18), (14, 19), (15, 20)], (15, 21, 3)),
                 'front': ([(10, 18), (9, 19), (8, 20)], (7, 21, 3))}
LEGS_PASS_A = {'back': ([(11, 18), (11, 19), (11, 20)], (10, 20, 3)),
               'front': ([(12, 18), (12, 19), (12, 20)], (12, 21, 3))}
LEGS_PASS_B = {'back': ([(12, 18), (12, 19), (12, 20)], (12, 21, 3)),
               'front': ([(11, 18), (11, 19), (11, 20)], (10, 20, 3))}
WALK_LEGS = [LEGS_STRIDE_A, LEGS_PASS_A, LEGS_STRIDE_B, LEGS_PASS_B]


def leg(p, pts, foot, lc, fc, dx=0, thin=False):
    for x, y in pts:
        p.put(x + dx, y, lc)
        if not thin:
            p.put(x + 1 + dx, y, lc)
    fx, fy, n = foot
    for i in range(n):
        p.put(fx + i + dx, fy, fc)
    p.put(fx + n - 1 + dx, fy - 1, fc)


def feet(p, legs, fc, dx=0):
    # 長衣の裾から出る靴だけ
    for side in ('back', 'front'):
        fx, fy, n = legs[side][1]
        for i in range(n):
            p.put(fx + i + dx, fy, fc)


# ---------------------------------------------------------------- 頭
# 顔は右向き寄りの斜め。楕円に髪を被せ、目は縦長の黒目（横1×縦2）。ほほの赤みは手前だけ
HEAD = (13.5, 6.8, 5.2, 4.4)
EYES = [(14, 7, 'E'), (14, 8, 'E'), (17, 7, 'E'), (17, 8, 'E'),
        (13, 9, 'k'), (15, 10, 'm')]
HURT_EYES = [(13, 8, 'E'), (14, 8, 'E'), (16, 8, 'E'), (17, 8, 'E'), (14, 10, 'm'), (15, 10, 'm')]


def head(p, dx, dy, style, face=None):
    cx, cy, rx, ry = HEAD
    for y in range(1, 13):
        for x in range(6, 22):
            ex, ey = (x - cx) / rx, (y - cy) / ry
            if ex * ex + ey * ey >= 1:
                continue
            if style == 'mage':
                hair = x <= 9
            elif style == 'skull':
                hair = False
            else:
                hair = y <= 4 or (y == 5 and x not in (14, 16, 17)) or (y == 6 and x <= 12) or x <= 10
            if hair:
                c = 'H' if (y <= 3 and 11 <= x <= 15) else ('j' if (x <= 9 or y >= 10) else 'h')
            else:
                c = 's' if (x <= 11 or y >= 10) else 'S'
            p.put(x + dx, y + dy, c)
    if style == 'hero':
        # 逆立った髪
        p.rows([(0, {12: 'H'}), (1, {8: 'j', 11: 'hH', 14: 'H', 17: 'h'}), (2, {8: 'jhhHHHHhhh'}),
                (3, {7: 'jj', 17: 'hh'}), (4, {18: 'h'})], dx, dy)
    if style == 'priest':
        # 肩まで届く髪と、金の額飾り
        for y in range(7, 14):
            for x in (8, 9, 10):
                p.put(x + dx, y + dy, 'j' if x == 8 or y >= 12 else 'h')
        p.rows([(4, {10: 'gGGGGGg'})], dx, dy)
        p.pts([(15, 5, 'I')], dx, dy)
    if style == 'skull':
        p.pts([(13, 7, 'E'), (14, 7, 'E'), (13, 8, 'E'), (14, 8, 'E'), (16, 7, 'E'), (17, 7, 'E'), (16, 8, 'E'),
               (17, 8, 'E'), (15, 9, 'E'), (13, 11, 'E'), (15, 11, 'E'), (17, 10, 'E')], dx, dy)
        p.pts([(14, 7, 'r'), (17, 7, 'r')], dx, dy)      # 目の奥の赤い光
        return
    if style == 'mage':
        # 白い眉と、点の目。口は髭に隠れる
        p.pts([(13, 6, 'H'), (14, 6, 'H'), (16, 6, 'H'), (17, 6, 'H'), (14, 7, 'E'), (17, 7, 'E'), (18, 8, 's')], dx, dy)
        return
    p.pts(HURT_EYES if face == 'hurt' else EYES, dx, dy)


# ---------------------------------------------------------------- 勇者
HERO_C = code_map({
    'H': ('hair', 0), 'h': ('hair', 1), 'j': ('hair', 2),
    'S': ('skin', 0), 's': ('skin', 1), 'z': ('skin', 2),
    'T': ('tunic', 0), 't': ('tunic', 1), 'u': ('tunic', 2),
    'C': ('cape', 0), 'c': ('cape', 1), 'q': ('cape', 2),
    'b': ('belt', 1), 'B': ('belt', 2), 'y': 'yel',
    'P': ('pants', 1), 'p': ('pants', 2), 'O': ('boots', 1), 'o': ('boots', 2),
    'X': ('blade', 0), 'x': ('blade', 1), 'v': ('blade', 2),
    'G': ('hilt', 0), 'g': ('hilt', 1), 'n': ('hilt', 2),
    'E': 'eye', 'W': 'eyew', 'm': 'mouth', 'k': 'blush',
})
HERO_TORSO = [
    (11, {11: 'uTTt'}),
    (12, {10: 'uTTTTt'}),
    (13, {10: 'utTTTt'}),
    (14, {10: 'utttTt'}),
    (15, {10: 'Bbbbyb'}),
    (16, {10: 'uttttu'}),
    (17, {10: 'utttuu'}),
]
HERO_CAPE = [(11, {9: 'q'}), (12, {8: 'cq'}), (13, {7: 'Ccq'}), (14, {7: 'Ccq'}), (15, {6: 'Cccq'}),
             (16, {6: 'Cccq'}), (17, {5: 'Ccccq'}), (18, {5: 'Cccq'}), (19, {5: 'Ccq'})]
HERO_BACK = [(9, 12, 'u'), (9, 13, 'u'), (9, 14, 'u'), (9, 15, 's'), (9, 16, 's')]
HERO_ARM = {
    'hold': [(15, 12, 'T'), (16, 13, 't'), (17, 14, 't'), (18, 14, 'S'), (17, 15, 'n'),
             (18, 12, 'G'), (19, 13, 'G'), (20, 14, 'g'),
             (20, 12, 'X'), (21, 11, 'X'), (22, 10, 'X'), (23, 9, 'X'), (24, 8, 'X'),
             (21, 12, 'v'), (22, 11, 'x'), (23, 10, 'x'), (24, 9, 'v')],
    'windup': [(15, 12, 'T'), (14, 13, 't'), (13, 14, 'S'), (12, 14, 'S'), (11, 13, 'G'), (11, 14, 'g'), (11, 15, 'G'),
               (10, 14, 'X'), (9, 14, 'X'), (8, 14, 'x'), (7, 14, 'X'), (6, 14, 'x'), (5, 14, 'x')],
    'strike': [(15, 12, 'T'), (16, 12, 't'), (17, 12, 't'), (18, 12, 'S'), (19, 11, 'G'), (19, 12, 'g'), (19, 13, 'G'),
               (20, 12, 'X'), (21, 12, 'X'), (22, 12, 'x'), (23, 12, 'X'), (24, 12, 'x'), (25, 12, 'x')],
    'follow': [(15, 12, 'T'), (16, 13, 't'), (17, 14, 't'), (18, 15, 'S'), (19, 16, 'G'), (20, 15, 'G'), (18, 17, 'G'),
               (20, 17, 'X'), (21, 18, 'X'), (22, 19, 'X'), (23, 20, 'X'), (21, 17, 'x'), (22, 18, 'x'), (23, 19, 'v')],
    'flail': [(15, 11, 'T'), (16, 10, 't'), (17, 9, 'S'), (16, 8, 'G'), (17, 8, 'g'), (18, 9, 'G'),
              (18, 7, 'X'), (19, 6, 'X'), (20, 5, 'X'), (21, 4, 'X'), (19, 7, 'x'), (20, 6, 'x'), (21, 5, 'v')],
    'raise': [(15, 12, 'T'), (16, 11, 't'), (17, 10, 't'), (18, 10, 'S'), (19, 9, 'S'), (18, 8, 'G'), (19, 8, 'g'),
              (20, 8, 'G'), (19, 7, 'X'), (19, 6, 'X'), (19, 5, 'x'), (19, 4, 'X'), (19, 3, 'x'), (19, 2, 'X'), (19, 1, 'x')],
}
HERO_SMEAR = {
    'strike': [(24, 8), (25, 9), (26, 10), (26, 11), (26, 13), (26, 14), (25, 15), (24, 16)],
    'follow': [(24, 14), (25, 15), (25, 16), (25, 18), (24, 19)],
}


def hero_frame(legs, body_dy=0, head_dy=0, arm='hold', arm_dx=0, arm_dy=0, body_dx=0, head_dx=0, legs_dx=0,
               cape=0, face=None, smear=None):
    p = Pix(HERO_C)
    for y, sp in HERO_CAPE:
        d = cape if y >= 16 else (cape // 2 if y >= 14 else 0)
        p.rows([(y, sp)], body_dx + d, body_dy)
    (bp, bf), (fp, ff) = legs['back'], legs['front']
    leg(p, bp, bf, 'p', 'o', legs_dx)
    p.pts(HERO_BACK, body_dx - arm_dx, body_dy)
    p.rows(HERO_TORSO, body_dx, body_dy)
    leg(p, fp, ff, 'P', 'O', legs_dx)
    p.rows(HERO_TORSO[-3:], body_dx, body_dy)
    head(p, body_dx + head_dx, body_dy + head_dy, 'hero', face)
    p.pts(HERO_ARM[arm], body_dx + arm_dx, body_dy + arm_dy)
    return p.done(smear=[(x + body_dx, y + body_dy) for x, y in HERO_SMEAR.get(smear, [])])


def hero_frames():
    return {
        'idle': [hero_frame(LEGS_STAND), hero_frame(LEGS_STAND, head_dy=1, arm_dy=1, cape=-1)],
        'walk': [hero_frame(LEGS_STRIDE_A, arm_dx=1, cape=1), hero_frame(LEGS_PASS_A, body_dy=-1),
                 hero_frame(LEGS_STRIDE_B, arm_dx=-1, cape=-1), hero_frame(LEGS_PASS_B, body_dy=-1)],
        'attack': [hero_frame(LEGS_STAND, body_dx=-1, head_dx=-1, arm='windup', cape=1),
                   hero_frame(LEGS_STRIDE_A, body_dx=1, legs_dx=1, head_dy=1, arm='strike', smear='strike', cape=-1),
                   hero_frame(LEGS_STRIDE_A, body_dx=1, legs_dx=1, body_dy=1, arm='follow', smear='follow', cape=-2),
                   hero_frame(LEGS_STAND, arm_dy=1)],
        'hurt': [hero_frame(LEGS_STAND, body_dx=-1, head_dx=-1, arm='flail', face='hurt', cape=2)],
        'win': [hero_frame(LEGS_STAND, arm='raise', cape=-1)],
    }


# ---------------------------------------------------------------- 魔法使いと僧侶
# 裾の広がった長衣。脚は見せず、裾から靴だけ出す。前の手で杖を持つ
ROBE = [
    (11, {11: 'drrR'}),
    (12, {10: 'drrrRr'}),
    (13, {10: 'drrrRr'}),
    (14, {10: 'drrrrr'}),
    (15, {9: 'bbbbbbb'}),
    (16, {9: 'drrrrrr'}),
    (17, {9: 'drrrrrrr'}),
    (18, {8: 'ddrrrrrrr'}),
    (19, {8: 'ddrrrrrrrr'}),
    (20, {8: 'dddrrrrrrd'}),
]
ROBE_BACK = [(9, 12, 'd'), (9, 13, 'd'), (9, 14, 'd'), (9, 15, 's')]
MAGE_HAT = [(0, {7: 'Qa'}), (1, {8: 'QaA'}), (2, {9: 'QaAAa'}), (3, {9: 'QaAAAAa'}), (4, {9: 'ggggggggg'}),
            (5, {6: 'QQaaaaaaaaaaaaQ'})]
MAGE_BEARD = [(9, {12: 'hhHHHh'}), (10, {11: 'jhhHHHh'}), (11, {11: 'jhhhHh'}), (12, {12: 'jhhHh'}),
              (13, {13: 'jhhh'}), (14, {14: 'jh'})]


def staff_pts(x0, y0, x1, y1):
    n = max(abs(x1 - x0), abs(y1 - y0))
    return [(round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n), 'f' if i % 4 else 'F') for i in range(n + 1)]


ROBE_ARM = {
    'hold': ([(15, 12, 'R'), (16, 13, 'r'), (17, 14, 'r'), (18, 14, 'S')], (18, 20, 18, 3)),
    'cast': ([(15, 12, 'R'), (16, 12, 'r'), (17, 12, 'r'), (18, 12, 'r'), (19, 12, 'r'), (20, 12, 'S')], (19, 16, 23, 4)),
    'raise': ([(15, 12, 'R'), (16, 11, 'r'), (17, 10, 'r'), (18, 9, 'r'), (19, 9, 'S')], (19, 15, 19, 2)),
}


def robe_frame(kind, legs, body_dy=0, head_dy=0, arm='hold', arm_dy=0, sway=0, glow=False):
    if kind == 'mage':
        cm = code_map({
            'H': ('beard', 0), 'h': ('beard', 1), 'j': ('beard', 2),
            'S': ('skin', 0), 's': ('skin', 1),
            'R': ('robe', 0), 'r': ('robe', 1), 'd': ('robe', 2), 'b': ('belt', 1),
            'A': ('hat', 0), 'a': ('hat', 1), 'Q': ('hat', 2), 'g': ('hilt', 1), 'G': ('hilt', 0),
            'O': ('boots', 1), 'f': ('wood', 1), 'F': ('wood', 2),
            'I': ('gem', 0), 'i': ('gem', 1), 'l': ('gem', 2),
            'E': 'eye', 'W': 'eyew', 'm': 'mouth', 'k': 'blush',
        })
    else:
        cm = code_map({
            'H': ('blond', 0), 'h': ('blond', 1), 'j': ('blond', 2),
            'S': ('skin', 0), 's': ('skin', 1),
            'R': ('white', 0), 'r': ('white', 1), 'd': ('white', 2), 'b': ('trim', 1),
            'g': ('trim', 1), 'G': ('trim', 0), 'n': ('trim', 2),
            'O': ('boots', 1), 'f': ('wood', 1), 'F': ('wood', 2),
            'I': ('gem', 1), 'i': ('gem', 1), 'l': ('gem', 2),
            'E': 'eye', 'W': 'eyew', 'm': 'mouth', 'k': 'blush',
        })
    p = Pix(cm)
    feet(p, legs, 'O')
    p.pts(ROBE_BACK, 0, body_dy)
    for y, sp in ROBE:
        p.rows([(y, sp)], sway if y >= 18 else 0, body_dy if y < 18 else 0)
    if kind == 'priest':
        p.line(13, 12 + body_dy, 13, 17 + body_dy, 'g')            # 前の合わせ目の金の縁
        p.rows([(20, {8 + sway: 'gggggggggg'})])
    head(p, 0, body_dy + head_dy, 'mage' if kind == 'mage' else 'priest')
    if kind == 'mage':
        p.rows(MAGE_BEARD, 0, body_dy + head_dy)
        p.rows(MAGE_HAT, 0, body_dy + head_dy)
    pts, (sx0, sy0, sx1, sy1) = ROBE_ARM[arm]
    dy = body_dy + arm_dy
    p.pts(staff_pts(sx0, sy0 + dy, sx1, sy1 + dy))
    tx, ty = sx1, sy1 + dy
    if kind == 'mage':
        p.pts([(tx - 1, ty - 1, 'i'), (tx, ty - 2, 'I'), (tx, ty - 1, 'I'), (tx + 1, ty - 1, 'i'), (tx, ty, 'l')])
    else:
        # 金の輪の杖
        p.pts([(tx - 1, ty - 2, 'G'), (tx, ty - 3, 'G'), (tx + 1, ty - 2, 'G'), (tx - 1, ty - 1, 'g'),
               (tx + 1, ty - 1, 'g'), (tx, ty, 'n'), (tx, ty - 2, 'I')])
    p.pts(pts, 0, dy)
    lights = []
    if glow:
        if kind == 'mage':
            lights = [(tx + 3, ty - 2), (tx - 3, ty - 3), (tx + 2, ty + 2), (tx, ty - 5), (tx + 4, ty + 1)]
        else:
            lights = [(7, 2), (20, 1), (5, 8), (22, 6), (13, 0), (24, 11)]
    return p.done(glow=lights)


def robe_frames(kind):
    f = robe_frame
    return {
        'idle': [f(kind, LEGS_STAND), f(kind, LEGS_STAND, head_dy=1, arm_dy=1)],
        'walk': [f(kind, LEGS_STRIDE_A, sway=1), f(kind, LEGS_PASS_A, body_dy=-1),
                 f(kind, LEGS_STRIDE_B, sway=-1), f(kind, LEGS_PASS_B, body_dy=-1)],
        'cast': [f(kind, LEGS_STRIDE_A, arm='cast'), f(kind, LEGS_STRIDE_A, arm='cast', glow=True)],
        'win': [f(kind, LEGS_STAND, arm='raise', glow=True)],
    }


# ---------------------------------------------------------------- 骸骨（人と同じ枠）
SKEL_C = code_map({
    'H': ('bone', 0), 'h': ('bone', 1), 'j': ('bone', 2), 'S': ('bone', 0), 's': ('bone', 1),
    'X': ('rust', 0), 'x': ('rust', 1), 'G': ('hilt', 1), 'g': ('hilt', 2),
    'E': 'eye', 'r': 'red',
})
SKEL_TORSO = [(11, {12: 'jh'}), (12, {10: 'hSSSSh'}), (13, {12: 'jh'}), (14, {10: 'hSSSSh'}), (15, {12: 'jh'}),
              (16, {10: 'jhhhhj'}), (17, {10: 'j'}), (17, {15: 'j'})]
SKEL_ARM = [(15, 12, 'h'), (16, 13, 'h'), (17, 14, 'S'), (17, 15, 'g'), (18, 13, 'G'), (19, 14, 'G'),
            (19, 12, 'X'), (20, 11, 'X'), (21, 10, 'X'), (22, 9, 'X'), (20, 12, 'x'), (21, 11, 'x'), (22, 10, 'x')]


def skeleton_frames():
    out = []
    for i, legs in enumerate(WALK_LEGS):
        dy = -1 if i % 2 else 0
        p = Pix(SKEL_C)
        (bp, bf), (fp, ff) = legs['back'], legs['front']
        leg(p, bp, bf, 'j', 'j', thin=True)
        p.pts([(9, 12, 'j'), (9, 13, 'j'), (9, 14, 'j'), (9, 15, 'h')], -(1 if i == 0 else -1 if i == 2 else 0), dy)
        p.rows(SKEL_TORSO, 0, dy)
        leg(p, fp, ff, 'h', 'h', thin=True)
        head(p, 0, dy + (1 if i % 2 == 0 else 0), 'skull')
        p.pts(SKEL_ARM, 0, dy)
        out.append(p.done())
    return out


# ---------------------------------------------------------------- てびきのフェアリー
# F:\30_Program\Prototype\goblin\_make.py のフェアリーと同じ作り。羽は半透明で、羽の縁は淡い線
def _fput(grid, x, y, c):
    if 0 <= x < FW and 0 <= y < FH and c != '.':
        grid[y][x] = c


def _wing(grid, rx0, ry0, ang, length, width):
    ca, sa = math.cos(ang), math.sin(ang)
    cx, cy = rx0 + ca * length / 2, ry0 + sa * length / 2
    a = length / 2
    for y in range(int(cy - a - 2), int(cy + a + 3)):
        for x in range(int(cx - a - 2), int(cx + a + 3)):
            dx, dy = x - cx, y - cy
            u, v = dx * ca + dy * sa, -dx * sa + dy * ca
            e = (u / a) ** 2 + (v / width) ** 2
            if e < 1:
                _fput(grid, x, y, 'A' if e > 0.5 else 'a')


WING_POSES = {'up': ((-0.45, -1.0), (-1.0, 0.15)), 'mid': ((-1.0, -0.45), (-1.0, 0.5)), 'down': ((-1.0, 0.2), (-0.6, 0.9))}


def _fairy_head(grid, dx, dy, face):
    for y in range(2, 14):
        for x in range(6, 22):
            ex, ey = (x - 14.5) / 5.0, (y - 7.5) / 4.6
            bx, by = (x - 9) / 1.9, (y - 5) / 1.9
            in_head = ex * ex + ey * ey < 1
            if not in_head and bx * bx + by * by >= 1:
                continue
            hair = (not in_head or y <= 5 or (y == 6 and x not in (15, 18, 19)) or (y == 7 and x <= 12) or x <= 11)
            if hair:
                c = 'Y' if (y <= 4 and 12 <= x <= 16) else ('o' if x <= 10 or y >= 10 else 'y')
            else:
                c = 'z' if x <= 12 or y >= 12 else 's'
            _fput(grid, x + dx, y + dy, c)
    for x, y, c in ((12, 2, 'F'), (11, 3, 'F'), (13, 3, 'F'), (12, 3, 'Y'), (12, 4, 'F')):
        _fput(grid, x + dx, y + dy, c)
    if face == 'flinch':
        feats = [(14, 9, 'E'), (15, 9, 'E'), (17, 9, 'E'), (18, 9, 'E'), (13, 10, 'p'), (18, 10, 'p'), (16, 11, 'E'), (16, 12, 'r')]
    elif face == 'smile':
        feats = [(14, 9, 'E'), (15, 8, 'E'), (16, 9, 'E'), (17, 9, 'E'), (18, 8, 'E'), (19, 9, 'E'),
                 (13, 10, 'p'), (18, 10, 'p'), (16, 11, 'r'), (17, 11, 'r')]
    elif face == 'blink':
        feats = [(14, 9, 'E'), (15, 9, 'E'), (17, 9, 'E'), (18, 9, 'E'), (13, 10, 'p'), (18, 10, 'p'), (16, 11, 'r')]
    else:
        feats = [(14, 8, 'W'), (15, 8, 'E'), (14, 9, 'E'), (15, 9, 'E'), (17, 8, 'W'), (18, 8, 'E'),
                 (17, 9, 'E'), (18, 9, 'E'), (13, 10, 'p'), (18, 10, 'p'), (16, 11, 'r')]
    for x, y, c in feats:
        _fput(grid, x + dx, y + dy, c)


FAIRY_DRESS = [(12, {14: 'zs'}), (13, {13: 'dddd'}), (14, {13: 'dDdd'}), (15, {12: 'ddDdd'}),
               (16, {11: 'dddDddd'}), (17, {10: 'dDddDddd'}), (18, {10: 'D.dD.dD'})]
FAIRY_ARMS = {
    'down': [(17, 14, 's'), (17, 15, 's'), (18, 16, 's')],
    'up': [(17, 13, 's'), (18, 12, 's'), (19, 11, 's'), (20, 10, 's')],
    'toss': [(17, 14, 's'), (18, 14, 's'), (19, 14, 's'), (20, 13, 's')],
    'low': [(17, 14, 's'), (18, 15, 's'), (19, 16, 's')],
}
FAIRY_LEGS = {
    'hang': [(13, 19, 'z'), (13, 20, 'z'), (13, 21, 'D'), (15, 19, 's'), (16, 20, 's'), (16, 21, 'D'), (17, 21, 'D')],
    'trail': [(12, 19, 'z'), (11, 20, 'z'), (10, 20, 'D'), (14, 19, 's'), (13, 20, 's'), (12, 21, 'D'), (13, 21, 'D')],
}
STAR_BIG = [(0, 0, 'X'), (1, 0, 'x'), (-1, 0, 'x'), (0, 1, 'x'), (0, -1, 'x')]


def fairy_frame(wings='mid', dy=0, head_dx=0, body_dx=0, arm='down', legs='hang', face=None, big=(), small=(), sweat=False):
    grid = [['.'] * FW for _ in range(FH)]
    up, low = WING_POSES[wings]
    rx0, ry0 = 12 + body_dx, 14 + dy
    _wing(grid, rx0, ry0 - 1, math.atan2(up[1], up[0]), 11, 2.8)
    _wing(grid, rx0, ry0 + 1, math.atan2(low[1], low[0]), 7, 1.8)
    for x, y, c in FAIRY_LEGS[legs]:
        _fput(grid, x + body_dx, y + dy, c)
    for y, spans in FAIRY_DRESS:
        for x0, s in spans.items():
            for i, c in enumerate(s):
                _fput(grid, x0 + i + body_dx, y + dy, c)
    _fairy_head(grid, body_dx + head_dx, dy, face)
    for x, y, c in FAIRY_ARMS[arm]:
        _fput(grid, x + body_dx, y + dy, c)
    # 輪郭。羽の縁だけ淡い線にする
    g = [r[:] for r in grid]
    for y in range(FH):
        for x in range(FW):
            if grid[y][x] != '.':
                continue
            hard = found = False
            for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + ox, y + oy
                if 0 <= nx < FW and 0 <= ny < FH and grid[ny][nx] not in '.K':
                    found = True
                    if grid[ny][nx] not in 'aA':
                        hard = True
            if found:
                g[y][x] = 'K' if hard else 'q'

    def spark(x, y, c):
        if 0 <= x < FW and 0 <= y < FH and g[y][x] in '.q':
            g[y][x] = c
    for bx, by in big:
        for ox, oy, c in STAR_BIG:
            spark(bx + ox, by + oy, c)
    for sx, sy, c in small:
        spark(sx, sy, c)
    if sweat:
        for x, y in ((21, 5), (21, 6), (20, 6)):
            spark(x, y, 'b')
    return [''.join(FAIRY_LET[c] if c != '.' else '.' for c in r) for r in g]


def fairy_frames():
    f = fairy_frame
    return {
        'idle': [f('up', dy=0), f('mid', dy=0), f('down', dy=1), f('mid', dy=0)],
        'blink': [f('up', dy=0, face='blink'), f('mid', dy=0, face='blink'), f('down', dy=1, face='blink'), f('mid', dy=0, face='blink')],
        'cheer': [f('up', dy=-1, arm='up', face='smile', small=[(21, 9, 'X'), (22, 11, 'x'), (20, 7, 'c')]),
                  f('mid', dy=0, body_dx=1, arm='toss', face='smile', big=[(23, 12), (26, 9)],
                    small=[(22, 15, 'x'), (25, 16, 'c'), (27, 13, 'X'), (24, 7, 'x'), (27, 11, 'c')]),
                  f('down', dy=1, body_dx=1, arm='low', face='smile', big=[(24, 16)],
                    small=[(21, 18, 'c'), (26, 18, 'x'), (23, 12, 'X'), (27, 15, 'c'), (26, 20, 'X'), (22, 21, 'x')]),
                  f('mid', dy=0, arm='down', face='smile', small=[(25, 21, 'x'), (22, 22, 'c'), (27, 19, 'X')])],
    }


# ---------------------------------------------------------------- 形で組む敵
class Grid:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.m = [[None] * w for _ in range(h)]
        self.over = {}

    def set(self, x, y, mat):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            self.m[y][x] = mat

    def rect(self, x0, y0, x1, y1, mat):
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1):
                self.set(x, y, mat)

    def disc(self, cx, cy, rx, ry, mat):
        for y in range(self.h):
            for x in range(self.w):
                dx, dy = (x + .5 - cx) / rx, (y + .5 - cy) / ry
                if dx * dx + dy * dy <= 1:
                    self.m[y][x] = mat

    def poly(self, pts, mat):
        for y in range(self.h):
            for x in range(self.w):
                if inside(pts, x + .5, y + .5):
                    self.m[y][x] = mat

    def line(self, x0, y0, x1, y1, mat, w=1):
        n = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
        for i in range(n + 1):
            t = i / n
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            for dy in range(w):
                for dx in range(w):
                    self.set(math.floor(x) + dx, math.floor(y) + dy, mat)

    def path(self, pts, mat, w=1):
        for a, b in zip(pts, pts[1:]):
            self.line(a[0], a[1], b[0], b[1], mat, w)

    def dot(self, x, y, flat):
        # 陰影の後に上から置く1点（目など）。1色の部品だけ
        assert flat in FLAT, flat
        self.over[(int(round(x)), int(round(y)))] = flat

    def eye(self, x, y):
        # 縦長の黒目（横1×縦2）
        self.dot(x + 1, y, 'eye'); self.dot(x + 1, y + 1, 'eye')


def inside(pts, x, y):
    c = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]; xj, yj = pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi:
            c = not c
        j = i
    return c


def shade(g):
    out = [['.'] * g.w for _ in range(g.h)]
    get = lambda x, y: g.m[y][x] if 0 <= x < g.w and 0 <= y < g.h else None
    for y in range(g.h):
        for x in range(g.w):
            m = g.m[y][x]
            if m is None:
                continue
            if m in FLAT:
                out[y][x] = FLET[m]
                continue
            L, M, D = LET[m]
            sep = 'sep' in MAT[m]
            same = lambda xx, yy: get(xx, yy) == m
            if sep and any(get(x + ox, y + oy) not in (None, m) for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                out[y][x] = D
            elif not same(x, y - 1) or not same(x - 1, y):
                out[y][x] = L
            elif not same(x, y + 1) or not same(x + 1, y):
                out[y][x] = D
            else:
                out[y][x] = M
    for (x, y), f in g.over.items():
        if 0 <= x < g.w and 0 <= y < g.h:
            out[y][x] = FLET[f]
    res = [r[:] for r in out]
    for y in range(g.h):
        for x in range(g.w):
            if out[y][x] != '.':
                continue
            for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                xx, yy = x + ox, y + oy
                if 0 <= xx < g.w and 0 <= yy < g.h and out[yy][xx] not in '.*+':
                    res[y][x] = OUTLINE[0]
                    break
    return [''.join(r) for r in res]


# どれも右向きに描き、書き出すときに左右を返して勇者の方を向かせる
def slime_frames():
    out = []
    for rx, ry in ((8.5, 6), (9.6, 5), (8.5, 6), (7.4, 7)):
        g = Grid(20, 16)
        cy = 15.6 - ry
        g.disc(10, cy, rx, ry, 'slime')
        g.disc(10, cy - ry + 2.2, rx * .45, 2.4, 'slime')
        for x in range(20):
            if g.m[14][x] == 'slime':
                g.m[15][x] = 'slime'
        g.dot(10 - rx * .55, cy - ry * .5, 'glow'); g.dot(10 - rx * .55 + 1, cy - ry * .5, 'glow')
        g.dot(10 - rx * .55, cy - ry * .5 + 1, 'glow')
        ex = round(10 + rx * .15)
        g.eye(ex, round(cy - 1)); g.eye(ex + 4, round(cy - 1))
        g.dot(ex - 1, round(cy + 1), 'blush'); g.dot(ex + 6, round(cy + 1), 'blush')
        g.dot(ex + 2.5, round(cy + 2), 'mouth')
        out.append(shade(g))
    return out


def bat_frames():
    out = []
    wings = (
        [(10, 8), (3, 1), (4, 5), (0, 6), (4, 8), (1, 11), (9, 11)],
        [(10, 8), (1, 6), (4, 9), (0, 11), (5, 11), (9, 11)],
        [(10, 9), (3, 15), (4, 12), (0, 12), (4, 10), (1, 9), (9, 8)],
        [(10, 8), (1, 6), (4, 9), (0, 11), (5, 11), (9, 11)],
    )
    for i, wl in enumerate(wings):
        g = Grid(24, 16)
        g.poly([(x, y) for x, y in wl], 'batw')
        g.poly([(24 - x, y) for x, y in wl], 'batw')
        g.disc(12, 9 + (i == 2), 4, 3.8, 'batb')
        g.poly([(9, 6), (9.5, 2), (11.5, 6)], 'batb'); g.poly([(12.5, 6), (14.5, 2), (15, 6)], 'batb')
        y = 8 + (i == 2)
        g.dot(10, y, 'yel'); g.dot(11, y, 'red'); g.dot(13, y, 'yel'); g.dot(14, y, 'red')
        g.dot(11, y + 2, 'eyew'); g.dot(13, y + 2, 'eyew')
        out.append(shade(g))
    return out


def ghost_frames():
    out = []
    for i in range(4):
        g = Grid(20, 24)
        ph = i * math.pi / 2
        dy = round(math.sin(ph))
        g.disc(10, 8.5 + dy, 6.6, 6.4, 'ghost')
        pts = [(3.6, 9 + dy)]
        for k in range(7):
            x = 3.8 + k * 1.1 + math.sin(ph + k * .9) * 1.2
            pts.append((x, 13 + k * 1.4 + dy))
        pts += [(11 + math.sin(ph) * 1.5, 22 + dy), (13, 18 + dy), (15.5, 14 + dy), (16.6, 9 + dy)]
        g.poly(pts, 'ghost')
        g.poly([(15, 11 + dy), (19, 13 + dy + (i % 2)), (15.5, 14 + dy)], 'ghost')   # 腕
        g.eye(10, 6 + dy); g.eye(13, 6 + dy)
        g.dot(9, 9 + dy, 'blush'); g.dot(15, 9 + dy, 'blush')
        g.dot(12, 10 + dy, 'mouth'); g.dot(12, 11 + dy, 'mouth')
        g.dot(6, 4 + dy, 'glow')
        out.append(shade(g))
    return out


def dragon_frames():
    out = []
    wings = (
        [(12, 14), (6, 1), (10, 4), (13, 0), (16, 5), (19, 3), (19, 14)],
        [(12, 14), (3, 6), (8, 7), (10, 4), (14, 8), (19, 6), (19, 14)],
        [(12, 13), (4, 21), (9, 18), (12, 23), (15, 17), (19, 19), (19, 13)],
        [(12, 14), (3, 6), (8, 7), (10, 4), (14, 8), (19, 6), (19, 14)],
    )
    for i, wl in enumerate(wings):
        g = Grid(36, 30)
        g.poly(wl, 'wingm')                                         # 奥の翼
        g.path([(9, 20), (5, 19), (2, 15), (1, 11)], 'scale', 3)    # 尾
        g.poly([(0, 11), (2, 7), (3, 12)], 'horn')                  # 尾の先
        g.path([(11, 23), (10, 26), (11, 27)], 'scale', 3)          # 後ろ脚
        g.disc(15, 19, 9, 6.4, 'scale')                             # 胴
        g.disc(17, 22, 6.5, 3.4, 'belly')
        g.path([(21, 16), (24, 12), (26, 9)], 'scale', 4)           # 首
        g.disc(27.5, 7.5, 4.8, 4, 'scale')                          # 頭
        g.rect(29, 8, 34, 10, 'scale')                              # 鼻先
        g.rect(30, 10, 33, 10, 'belly')
        g.poly([(24, 5), (21, 0), (26, 4)], 'horn'); g.poly([(27, 4), (26, 0), (29, 4)], 'horn')
        g.path([(19, 23), (20, 27), (22, 27)], 'scale', 3)          # 前脚
        for x in range(9, 22, 3):
            g.set(x, 13 + (x % 2), 'horn')                          # 背びれ
        g.dot(28, 6, 'yel'); g.dot(29, 6, 'eye'); g.dot(28, 7, 'eye'); g.dot(29, 7, 'eye')
        g.dot(33, 8, 'eye')
        if i == 2:
            for k in range(5):
                g.dot(35 - k * .2, 9 + k % 2, 'fire')
        out.append(shade(g))
    return out


def mirror(frames):
    return [[r[::-1] for r in f] for f in frames]


# ---------------------------------------------------------------- 書き出し
def write_png(path, w, h, rows):
    raw = b''.join(b'\x00' + bytes(r) for r in rows)

    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    data += chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as fp:
        fp.write(data)


def rgba(pal, c):
    if c == '.':
        return (0, 0, 0, 0)
    if c == '*':
        return (236, 244, 255, 190)
    if c == '+':
        return (255, 255, 255, 255)
    col = pal.get(c, '#ff00ff')
    if col.startswith('rgba'):
        v = col[5:-1].split(',')
        return (int(v[0]), int(v[1]), int(v[2]), int(float(v[3]) * 255))
    return (int(col[1:3], 16), int(col[3:5], 16), int(col[5:7], 16), 255)


def preview(sheets, scale, path):
    pal = palette()
    pad = 2
    rows_out = []
    width = max(sum(len(fr[0]) + pad for fr in s) for s in sheets) * scale
    for s in sheets:
        h = max(len(fr) for fr in s)
        for y in range(h * scale):
            row = []
            for fr in s:
                fh, fw = len(fr), len(fr[0])
                for x in range((fw + pad) * scale):
                    gx, gy = x // scale, y // scale
                    c = rgba(pal, fr[gy][gx]) if gx < fw and gy < fh else (0, 0, 0, 0)
                    # 確認しやすいよう、透明は明るい市松
                    if c[3] < 255:
                        bg = (236, 230, 220) if ((gx + gy) & 1) else (246, 242, 236)
                        a = c[3] / 255
                        c = tuple(int(c[i] * a + bg[i] * (1 - a)) for i in range(3)) + (255,)
                    row.extend(c)
            row.extend([255] * (width * 4 - len(row)))
            rows_out.append(row[:width * 4])
        rows_out.extend([[255] * width * 4] * (pad * scale))
    write_png(path, width, len(rows_out), rows_out)


def export(path, data):
    import json
    lines = ['// 勇者の一行・敵・てびきのフェアリーのドット絵。_sprites.py が書き出す。手で直さず、_sprites.py を直して作り直す',
             '// 1文字1ドット。"." は透明、K は輪郭、* は剣の残像、+ は光。色は pal、材質ごとの文字は let',
             'window.SPRITES = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';', '']
    with open(path, 'w', encoding='utf-8', newline=chr(10)) as fp:
        fp.write(chr(10).join(lines))


if __name__ == '__main__':
    hf = hero_frames()
    mf = robe_frames('mage')
    pf = robe_frames('priest')
    ff = fairy_frames()
    sk = mirror(skeleton_frames())
    pal = palette(); pal['*'] = 'rgba(236,244,255,.75)'; pal['+'] = '#ffffff'
    export(os.path.join(OUT, 'sprites.js'), {
        'pal': pal, 'let': LET,
        'hero': hf, 'mage': mf, 'priest': pf, 'fairy': ff,
        'slime': mirror(slime_frames()), 'bat': mirror(bat_frames()), 'skel': sk,
        'ghost': mirror(ghost_frames()), 'dragon': mirror(dragon_frames()),
    })
    preview([hf['walk'] + hf['idle'] + hf['win'], hf['attack'] + hf['hurt'],
             mf['walk'] + mf['idle'] + mf['cast'] + mf['win'], pf['walk'] + pf['idle'] + pf['cast'] + pf['win'],
             ff['idle'] + ff['cheer'], sk + mirror(ghost_frames()),
             mirror(slime_frames()) + mirror(bat_frames()), mirror(dragon_frames())], 5, os.path.join(OUT, '_sprites_preview.png'))
    print('preview ok')
