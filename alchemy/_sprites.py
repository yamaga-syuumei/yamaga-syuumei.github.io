# 勇者の一行と敵のドット絵を作り、sprites.js に書き出す。
#
#   python _sprites.py           … sprites.js と、確認用の _sprites_preview.png を書き出す
#
# 形は部品（円・多角形・線）で組み、材質ごとに「左上から光が当たる」として3段の陰影を付け、
# 最後に黒い輪郭で縁取る。手前の部品（腕など）は境目を自分の影の色で縁取って、奥と分ける。
# 色は文字1つで書き出すので、ゲーム側で色だけ差し替えられる（ランクで鎧や剣の色が変わる）。
import os, struct, zlib, math

OUT = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- 材質
# 名前 → 明・中・暗の3色。'=名前' は別の材質と同じ色を使う。sep は手前の部品で、
# 奥の部品との境目を自分の暗い色で縁取って分ける（腕が胴に溶けないように）
MAT = {
    'skin':   ['#ffd9b4', '#f0ae84', '#bd7458'],
    'hair':   ['#c8783a', '#9a5224', '#5e2e12'],
    'tunic':  ['#6fa8ff', '#3a6fd8', '#22408a'],
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
    'blond':  ['#ffeeaa', '#f0c450', '#a87420'],
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
    'eye': '#1a1020', 'eyew': '#ffffff', 'red': '#ff4040', 'yel': '#ffe040',
    'mouth': '#7a2a2a', 'glow': '#ffffff', 'fire': '#ffb040', 'smear': None,
}
OUTLINE = ('K', '#1c1226')

# 文字を材質ごとに配る。'.' は透明、K は輪郭、* は剣の残像、+ は光
POOL = [c for c in 'ABCDEFGHIJLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?#%&@<>{}[]^~=:;,_$/()|']
LET, PAL = {}, {OUTLINE[0]: OUTLINE[1]}
_i = 0
for _name, _v in MAT.items():
    if isinstance(_v[0], str) and _v[0].startswith('='):
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


def palette():
    return dict(PAL)


# ---------------------------------------------------------------- 描く土台
class Grid:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.m = [[None] * w for _ in range(h)]
        self.over = {}

    def set(self, x, y, mat):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            self.m[y][x] = mat

    def clear(self, x, y):
        self.set(x, y, None)

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
    # 輪郭。光の粒と剣の残像は縁取らない
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


# ---------------------------------------------------------------- 人の形
# 28×28 の枠。足の裏が 26 段目、体の中心は x=11。右を向いている
HW, HH = 28, 28
FOOT = 26

def legs(g, pose, mat='pants', boot='boots', dy=0, back_only=False, front_only=False):
    # pose: (股, 膝, 足首) を後ろ脚・前脚の順に
    for i, (hip, knee, ank) in enumerate(pose):
        if back_only and i == 1 or front_only and i == 0:
            continue
        g.path([hip, knee, ank], mat, 2)
        bx, by = ank
        g.rect(bx - 1, by + 1, bx + 2, by + 2, boot)          # 靴。つま先は前（右）
        g.set(bx + 3, by + 2, boot)


WALK = [  # 4コマの歩き。後ろ脚・前脚
    (((10, 18), (8, 21), (6, 23)), ((13, 18), (15, 21), (16, 23))),
    (((10, 18), (11, 21), (10, 22)), ((13, 18), (12, 21), (12, 23))),
    (((10, 18), (12, 21), (14, 23)), ((13, 18), (11, 21), (8, 23))),
    (((10, 18), (9, 21), (9, 23)), ((13, 18), (14, 21), (13, 22))),
]
STAND = (((10, 18), (9, 21), (9, 23)), ((13, 18), (14, 21), (14, 23)))
WIDE = (((10, 18), (8, 21), (7, 23)), ((13, 18), (15, 21), (16, 23)))


def head(g, dx, dy, hair='hair', style='hero'):
    cx, cy = 11.5 + dx, 7 + dy
    g.disc(cx + .3, cy, 5, 4.6, 'skin')
    if style == 'hero':
        # 逆立った髪。前髪は額で止め、後ろは首まで
        g.poly([(cx - 5.6, cy + 2), (cx - 5, cy - 3), (cx - 3, cy - 6), (cx + 1, cy - 6.5), (cx + 4, cy - 5),
                (cx + 5.2, cy - 2), (cx + 3, cy - 2.2), (cx + 1.5, cy - 1), (cx - 1.5, cy - 1.6), (cx - 2.5, cy + 3)], hair)
        for a, b, c in (((cx - 4, cy - 4), (cx - 5.5, cy - 7.5), (cx - 1.5, cy - 5.5)),
                        ((cx - 1, cy - 5.5), (cx + 1, cy - 9), (cx + 2.5, cy - 5.5)),
                        ((cx + 2, cy - 5), (cx + 6.5, cy - 6.5), (cx + 4.8, cy - 2))):
            g.poly([a, b, c], hair)
        g.dot(cx + 1.6, cy + .6, 'eye'); g.dot(cx + 1.6, cy + 1.6, 'eye')
        g.set(cx + 1.6, cy - .6, hair)              # 眉
    elif style == 'mage':
        g.poly([(cx - 5, cy + 3), (cx - 5, cy - 1), (cx - 2, cy - 2), (cx - 2.5, cy + 3.5)], 'beard')
        g.poly([(cx - 1, cy + 1.5), (cx + 4.8, cy + 1.5), (cx + 3.5, cy + 6), (cx + .5, cy + 7.5), (cx - 2, cy + 4)], 'beard')
        g.dot(cx + 1.6, cy - .4, 'eye')
        g.set(cx + 1.5, cy - 1.5, 'beard'); g.set(cx + 2.5, cy - 1.5, 'beard')
    elif style == 'priest':
        g.poly([(cx - 5.6, cy + 7), (cx - 5.5, cy - 2), (cx - 3, cy - 5.5), (cx + 1.5, cy - 5.8), (cx + 4.6, cy - 3.5),
                (cx + 5, cy - 1), (cx + 2, cy - 2.2), (cx - 1, cy - 1.2), (cx - 2.6, cy + 2), (cx - 2.4, cy + 7)], 'blond')
        g.dot(cx + 1.6, cy + .6, 'eye'); g.dot(cx + 1.6, cy + 1.6, 'eye')


def torso(g, dx, dy, mat='tunic'):
    g.poly([(7.5 + dx, 12 + dy), (15 + dx, 12 + dy), (16 + dx, 18.5 + dy), (7.5 + dx, 18.5 + dy)], mat)


def draw_sword(g, sword):
    (hx, hy), (tx, ty) = sword
    nx, ny = tx - hx, ty - hy
    l = math.hypot(nx, ny) or 1
    ux, uy = nx / l, ny / l
    px_, py_ = -uy, ux
    # 刃は2ドット幅。根元から切っ先へ
    for i in range(int(l) + 1):
        x, y = hx + ux * (i + 1), hy + uy * (i + 1)
        g.set(x, y, 'blade')
        if i < l - 1:
            g.set(x + px_ * .9, y + py_ * .9, 'blade')
    g.set(tx + ux, ty + uy, 'blade')
    # 鍔は刃に直角に、柄は手の後ろ
    for k in (-1.6, -.8, 0, .8, 1.6):
        g.set(hx + px_ * k, hy + py_ * k, 'hilt')
    g.set(hx - ux * 1.2, hy - uy * 1.2, 'belt'); g.set(hx - ux * 2.2, hy - uy * 2.2, 'hilt')


def arc_smear(g, cx, cy, r0, r1, a0, a1):
    # 振った剣の残像。中心 (cx,cy) から半径 r0〜r1 の帯を角度 a0→a1 で塗る
    for y in range(g.h):
        for x in range(g.w):
            dx, dy = x + .5 - cx, y + .5 - cy
            r = math.hypot(dx, dy)
            a = math.degrees(math.atan2(dy, dx))
            if r0 <= r <= r1 and a0 <= a <= a1 and g.m[y][x] is None:
                g.dot(x, y, 'smear')


def hero_frame(pose, dy=0, arm=None, sword=None, cape=0, back_arm=None, smear=None, hurt=False, sword_back=False):
    g = Grid(HW, HH)
    # マント（体の後ろ）
    w = cape
    g.poly([(8, 12 + dy), (11, 12 + dy), (10, 17 + dy), (7 + w, 23 + dy), (3 + w, 23.5 + dy), (5 + w * .5, 16 + dy)], 'cape')
    if back_arm:
        g.path(back_arm, 'skin', 2)
    legs(g, pose, back_only=True)
    torso(g, 0, dy)
    g.rect(7.5, 17 + dy, 15.5, 18 + dy, 'belt'); g.dot(13, 17 + dy, 'yel')
    legs(g, pose, front_only=True)
    if sword and sword_back:
        draw_sword(g, sword)
    head(g, 0, dy)
    if hurt:
        g.over.pop((13, 8 + dy), None); g.over.pop((13, 9 + dy), None)
        g.dot(12, 8 + dy, 'eye'); g.dot(14, 8 + dy, 'eye'); g.dot(13, 9 + dy, 'eye'); g.dot(12, 10 + dy, 'eye'); g.dot(14, 10 + dy, 'eye')
    if sword and not sword_back:
        draw_sword(g, sword)
    if smear:
        arc_smear(g, *smear)
    if arm:
        g.path(arm[:-1], 'sleeve', 2)
        g.path(arm[-2:], 'arm', 2)
    return shade(g)


def hero_frames():
    f = {}
    # 歩き。前の腕は剣を前に構え、後ろの腕は脚と逆に振る
    swing = [(-1, 1), (0, 0), (1, -1), (0, 0)]
    f['walk'] = []
    for i, pose in enumerate(WALK):
        dy = -1 if i % 2 else 0
        ba = [(9, 13 + dy), (8 + swing[i][1], 16 + dy)]
        f['walk'].append(hero_frame(pose, dy, arm=[(14, 13 + dy), (16, 15 + dy), (17, 16 + dy)],
                                    sword=((18, 15 + dy), (23, 10 + dy)), cape=[0, 1, 0, -1][i], back_arm=ba))
    f['idle'] = [hero_frame(STAND, d, arm=[(14, 13 + d), (16, 15 + d), (17, 16 + d)], sword=((18, 15 + d), (23, 10 + d)),
                            back_arm=[(9, 13 + d), (9, 16 + d)]) for d in (0, 1)]
    f['attack'] = [
        hero_frame(WIDE, 0, arm=[(14, 13), (13, 10), (12, 8)], sword=((12, 7), (6, 2)), cape=-1, back_arm=[(9, 13), (7, 15)],
                   sword_back=True),
        hero_frame(WIDE, 0, arm=[(14, 13), (17, 13), (19, 13)], sword=((20, 13), (26, 13)), cape=1, back_arm=[(9, 13), (8, 16)],
                   smear=(15, 14, 9.5, 13, -95, -8)),
        hero_frame(WIDE, 1, arm=[(14, 14), (17, 16), (18, 18)], sword=((19, 18), (24, 23)), cape=2, back_arm=[(9, 14), (8, 17)],
                   smear=(15, 14, 9.5, 13, -40, 30)),
        hero_frame(STAND, 0, arm=[(14, 13), (16, 15), (17, 16)], sword=((18, 15), (23, 10)), back_arm=[(9, 13), (9, 16)]),
    ]
    f['hurt'] = [hero_frame(STAND, 1, arm=[(14, 14), (16, 12), (18, 11)], sword=((19, 11), (24, 8)), cape=-2,
                            back_arm=[(9, 14), (7, 12)], hurt=True)]
    f['win'] = [hero_frame(STAND, 0, arm=[(14, 13), (15, 9), (15, 7)], sword=((15, 6), (15, 0)), back_arm=[(9, 13), (8, 16)])]
    return f


def robe_body(g, pose, dy, mat, sway):
    # 裾の広がった長衣。脚は裾から靴だけ出す
    for hip, knee, ank in pose:
        bx, by = ank
        g.rect(bx - 1, by + 1, bx + 2, by + 2, 'boots'); g.set(bx + 3, by + 2, 'boots')
    g.poly([(8, 12 + dy), (15, 12 + dy), (17 + sway, 24 + dy * .5), (5 + sway, 24 + dy * .5)], mat)


def mage_frame(pose, dy=0, sway=0, staff=((17, 16), (18, 3)), arm=((14, 13), (16, 15), (17, 16)), cast=False):
    g = Grid(HW, HH)
    g.path([(9, 13 + dy), (8, 17 + dy)], 'robe', 2)
    robe_body(g, pose, dy, 'robe', sway)
    g.rect(8, 17 + dy, 15.5, 17.6 + dy, 'belt')
    head(g, 0, dy, style='mage')
    # 三角帽子。つばを広げ、先は後ろへ折れる
    cx, cy = 11.8, 3 + dy
    g.disc(cx, cy + .6, 7.2, 1.6, 'hat')
    g.poly([(cx - 4.5, cy + .5), (cx + 4.5, cy + .5), (cx + 1, cy - 3), (cx - 2, cy - 3.5), (cx - 5.5, cy - 2.5), (cx - 3.5, cy - 2)], 'hat')
    g.set(cx - 6, cy - 2, 'hat')
    g.rect(cx - 4, cy - .4, cx + 4, cy - .2, 'hilt')       # 帽子の帯
    (hx, hy), (tx, ty) = staff
    g.line(hx, hy + 6, tx, ty + 1, 'wood', 1)
    g.disc(tx + .5, ty, 1.6, 1.6, 'gem')
    if cast:
        for a in range(0, 360, 45):
            g.dot(tx + .5 + math.cos(math.radians(a)) * 3.2, ty + math.sin(math.radians(a)) * 3.2, 'glow')
    g.path(list(arm[:-1]), 'robe', 2)
    g.path(list(arm[-2:]), 'arm', 2)
    return shade(g)


def priest_frame(pose, dy=0, sway=0, staff=((17, 16), (18, 4)), arm=((14, 13), (16, 15), (17, 16)), cast=False):
    g = Grid(HW, HH)
    g.path([(9, 13 + dy), (8, 17 + dy)], 'white', 2)
    robe_body(g, pose, dy, 'white', sway)
    # 金の縁取り。裾と前の合わせ目
    g.line(5 + sway, 23 + dy * .5, 17 + sway, 23 + dy * .5, 'trim', 1)
    g.line(13, 13 + dy, 14.5 + sway * .5, 23 + dy * .5, 'trim', 1)
    head(g, 0, dy, style='priest')
    (hx, hy), (tx, ty) = staff
    g.line(hx, hy + 6, tx, ty + 2, 'wood', 1)
    for a in range(0, 360, 30):
        g.set(tx + .5 + math.cos(math.radians(a)) * 1.8, ty + math.sin(math.radians(a)) * 1.8, 'trim')
    if cast:
        for a in range(0, 360, 60):
            g.dot(11.5 + math.cos(math.radians(a)) * 9, 9 + dy + math.sin(math.radians(a)) * 9, 'glow')
    g.path(list(arm[:-1]), 'white', 2)
    g.path(list(arm[-2:]), 'arm', 2)
    return shade(g)


def party_frames(fn):
    f = {}
    f['walk'] = [fn(pose, -1 if i % 2 else 0, sway=[0, 1, 0, -1][i]) for i, pose in enumerate(WALK)]
    f['idle'] = [fn(STAND, d) for d in (0, 1)]
    f['cast'] = [fn(WIDE, 0, staff=((18, 13), (21, 4)), arm=((14, 13), (17, 13), (18, 13)), cast=False),
                 fn(WIDE, 0, staff=((18, 13), (21, 4)), arm=((14, 13), (17, 13), (18, 13)), cast=True)]
    f['win'] = [fn(STAND, -1, staff=((16, 9), (17, 0)), arm=((14, 13), (15, 10), (16, 9)), cast=True)]
    return f


# ---------------------------------------------------------------- 敵
# どれも右向きに描き、書き出すときに左右を返して勇者の方を向かせる

def slime_frames():
    out = []
    for rx, ry in ((8.5, 6), (9.6, 5), (8.5, 6), (7.4, 7)):
        g = Grid(20, 16)
        cy = 15.6 - ry
        g.disc(10, cy, rx, ry, 'slime')
        g.disc(10, cy - ry + 2.2, rx * .45, 2.4, 'slime')
        g.rect(0, 16, 19, 16, None)
        for y in range(15, 16):
            for x in range(20):
                if g.m[y - 1][x] == 'slime':
                    g.m[y][x] = 'slime'
        g.dot(10 - rx * .5, cy - ry * .45, 'glow'); g.dot(10 - rx * .5 + 1, cy - ry * .45, 'glow')
        g.dot(10 - rx * .5, cy - ry * .45 + 1, 'glow')
        ex = 10 + rx * .25
        for x in (ex, ex + 3):
            g.dot(x, cy - .5, 'eye'); g.dot(x, cy + .5, 'eye')
        g.dot(ex + 1.5, cy + 2.2, 'mouth')
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
        g.disc(12, 9 + (i == 2), 3.6, 3.4, 'batb')
        g.poly([(9.5, 6), (10, 2.5), (11.5, 6)], 'batb'); g.poly([(12.5, 6), (14, 2.5), (14.5, 6)], 'batb')
        y = 8 + (i == 2)
        g.dot(11, y, 'yel'); g.dot(13, y, 'yel')
        g.dot(11, y + 2, 'eyew'); g.dot(13, y + 2, 'eyew')
        out.append(shade(g))
    return out


def skeleton_frames():
    out = []
    for i, pose in enumerate(WALK):
        dy = -1 if i % 2 else 0
        g = Grid(24, 28)
        # 後ろの腕と脚は細い骨
        g.path([(9, 13 + dy), (8, 17 + dy), (9, 20 + dy)], 'bone', 1)
        for k, (hip, knee, ank) in enumerate(pose):
            g.path([hip, knee, ank], 'bone', 1)
            bx, by = ank
            g.rect(bx - 1, by + 1, bx + 2, by + 2, 'bone')
        g.line(11, 11 + dy, 11, 18 + dy, 'bone', 2)          # 背骨
        for yy in (12, 14, 16):
            g.line(8, yy + dy, 14, yy + dy, 'bone', 1)        # 肋骨
        g.rect(8, 18 + dy, 14, 19 + dy, 'bone')               # 骨盤
        g.disc(12, 6 + dy, 4.8, 4.4, 'bone')                  # 頭蓋
        g.rect(10, 9 + dy, 15, 11 + dy, 'bone')               # 顎
        for x, y in ((12, 5), (13, 5), (12, 6), (13, 6), (15, 5), (15, 6)):
            g.dot(x, y + dy, 'eye')
        g.dot(14, 8 + dy, 'eye')
        for x in (11, 13, 15):
            g.dot(x, 10 + dy, 'eye')
        # 錆びた剣
        g.line(17, 15 + dy, 22, 9 + dy, 'rust', 2)
        g.set(16, 16 + dy, 'hilt'); g.set(17, 17 + dy, 'hilt'); g.set(15, 15 + dy, 'hilt')
        g.path([(14, 13 + dy), (16, 15 + dy), (17, 16 + dy)], 'bone', 1)
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
        for x, y in ((11, 6), (11, 7), (11, 8), (14, 6), (14, 7), (14, 8)):
            g.dot(x, y + dy, 'eye')
        g.dot(12.5, 11 + dy, 'eye'); g.dot(12.5, 12 + dy, 'eye')
        g.dot(7, 5 + dy, 'glow')
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
        g.disc(27.5, 7.5, 4.6, 3.6, 'scale')                        # 頭
        g.rect(29, 8, 34, 10, 'scale')                              # 鼻先
        g.rect(30, 10, 33, 10, 'belly')
        g.poly([(24, 5), (21, 0), (26, 4)], 'horn'); g.poly([(27, 4), (26, 0), (29, 4)], 'horn')
        g.path([(19, 23), (20, 27), (22, 27)], 'scale', 3)          # 前脚
        for x in range(9, 22, 3):
            g.set(x, 13 + (x % 2), 'horn')                          # 背びれ
        g.dot(29, 6, 'yel'); g.dot(30, 6, 'eye')
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
                    if gx < fw and gy < fh:
                        c = rgba(pal, fr[gy][gx])
                    else:
                        c = (0, 0, 0, 0)
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
    lines = ['// 勇者の一行と敵のドット絵。_sprites.py が書き出す。手で直さず、_sprites.py を直して作り直す',
             '// 1文字1ドット。"." は透明、K は輪郭、* は剣の残像、+ は光。色は pal、材質ごとの文字は let',
             'window.SPRITES = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';', '']
    with open(path, 'w', encoding='utf-8', newline=chr(10)) as fp:
        fp.write(chr(10).join(lines))


if __name__ == '__main__':
    hf = hero_frames()
    mf = party_frames(mage_frame)
    pf = party_frames(priest_frame)
    pal = palette(); pal['*'] = 'rgba(236,244,255,.75)'; pal['+'] = '#ffffff'
    export(os.path.join(OUT, 'sprites.js'), {
        'pal': pal, 'let': LET,
        'hero': hf, 'mage': mf, 'priest': pf,
        'slime': mirror(slime_frames()), 'bat': mirror(bat_frames()), 'skel': mirror(skeleton_frames()),
        'ghost': mirror(ghost_frames()), 'dragon': mirror(dragon_frames()),
    })
    preview([hf['walk'] + hf['idle'], hf['attack'] + hf['hurt'] + hf['win'],
             mf['walk'] + mf['cast'] + mf['win'], pf['walk'] + pf['cast'] + pf['win'],
             mirror(slime_frames()) + mirror(bat_frames()), mirror(skeleton_frames()) + mirror(ghost_frames()),
             mirror(dragon_frames())], 5, os.path.join(OUT, '_sprites_preview.png'))
    print('preview ok')
