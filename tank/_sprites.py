# 地形・雑魚・賞金首・拾い物・サキの顔のドット絵を作り、sprites.js に書き出す。
#
#   python _sprites.py      … sprites.js と、確認用の _sprites_preview.png を書き出す
#
# 形（楕円・四角・多角形）を重ねて組み、左上から光が当たるとして明・中・暗の3段で塗る。
# 最後に外側を濃い輪郭で縁取る。戦車は装備で色が変わるので art.js が描く。
import os, struct, zlib, random

OUT = os.path.dirname(os.path.abspath(__file__))
INK = '#191d22'


def hx(c):
    return int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16)


def tone(c, amt):
    r, g, b = hx(c)
    wr, wb = (1.15, 0.7) if amt > 0 else (0.85, 1.2)
    f = lambda v: max(0, min(255, round(v)))
    return '#%02x%02x%02x' % (f(r + amt * wr), f(g + amt), f(b + amt * wb))


def ramp(c, step=28):
    return (tone(c, step), c, tone(c, -step))


class Spr:
    def __init__(self, w, h, bg=None):
        self.w, self.h = w, h
        self.px = [[bg] * w for _ in range(h)]

    def put(self, x, y, c):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h and c:
            self.px[y][x] = c

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[y][x]
        return None

    def shape(self, inside, box, rp, sep=False):
        x0, y0, x1, y1 = box
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        rx, ry = max(1, (x1 - x0) / 2), max(1, (y1 - y0) / 2)
        pts = []
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1):
                if inside(x + 0.5, y + 0.5):
                    pts.append((x, y))
        s = set(pts)
        for x, y in pts:
            n = (x + 0.5 - cx) / rx * 0.6 + (y + 0.5 - cy) / ry
            c = rp[0] if n < -0.55 else rp[2] if n > 0.5 else rp[1]
            if sep and any((x + dx, y + dy) not in s for dx, dy in ((1, 0), (0, 1))):
                c = rp[2]
            self.put(x, y, c)
        return s

    def ell(self, cx, cy, rx, ry, rp, sep=False):
        return self.shape(lambda x, y: ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1,
                          (cx - rx, cy - ry, cx + rx, cy + ry), rp, sep)

    def rect(self, x0, y0, x1, y1, rp, sep=False):
        return self.shape(lambda x, y: x0 <= x <= x1 + 1 and y0 <= y <= y1 + 1, (x0, y0, x1, y1), rp, sep)

    def poly(self, P, rp, sep=False):
        def inside(x, y):
            c = False
            j = len(P) - 1
            for i in range(len(P)):
                xi, yi = P[i]; xj, yj = P[j]
                if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi:
                    c = not c
                j = i
            return c
        xs = [p[0] for p in P]; ys = [p[1] for p in P]
        return self.shape(inside, (min(xs), min(ys), max(xs), max(ys)), rp, sep)

    def line(self, x0, y0, x1, y1, c):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n):
            t = i / max(1, n - 1)
            self.put(round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t), c)

    def outline(self, c=INK):
        add = []
        for y in range(self.h):
            for x in range(self.w):
                if self.px[y][x] is None and any(self.get(x + dx, y + dy) not in (None, c)
                                                 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    add.append((x, y))
        for x, y in add:
            self.px[y][x] = c

    def shadow(self, cx, cy, rx, ry):
        for y in range(self.h):
            for x in range(self.w):
                if self.px[y][x] is None and ((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 <= 1:
                    self.px[y][x] = 'rgba(0,0,0,.28)'

    def over(self, other, dx=0, dy=0):
        for y in range(other.h):
            for x in range(other.w):
                if other.px[y][x]:
                    self.put(x + dx, y + dy, other.px[y][x])

    def flipx(self):
        s = Spr(self.w, self.h)
        s.px = [row[::-1] for row in self.px]
        return s


# ---------------------------------------------------------------- 地形（16x16）
GROUND = {   # 地域 → (地面, 道, 岩)
    'sand':  ('#b08c58', '#cbb188', '#7a7468'),
    'rocks': ('#a86c48', '#c49270', '#6a4a3a'),
    'ruins': ('#6e6e6a', '#4e5054', '#5a5c62'),
    'salt':  ('#d8d2c2', '#bdb6a2', '#9a9488'),
    'cliff': ('#8a6a48', '#a8885e', '#5e4a38'),
}


def speckle(s, base, seed, n=10):
    rnd = random.Random(seed)
    lo, hi = tone(base, -18), tone(base, 16)
    for _ in range(n):
        x, y = rnd.randrange(16), rnd.randrange(16)
        s.put(x, y, lo if rnd.random() < .6 else hi)
        if rnd.random() < .4:
            s.put(x + 1, y, lo)


def t_ground(rg, v):
    base = GROUND[rg][0]
    s = Spr(16, 16, base)
    speckle(s, base, hash((rg, v)) & 0xffff, 12)
    rnd = random.Random(v * 7 + len(rg))
    if rg == 'sand':
        for _ in range(2):
            x, y = rnd.randrange(12), rnd.randrange(2, 15)
            for i in range(4):
                s.put(x + i, y + (1 if i in (0, 3) else 0), tone(base, -20))
    if rg == 'ruins':
        x, y = rnd.randrange(14), rnd.randrange(14)
        s.line(x, y, x + 3, y + 2, tone(base, -26))
    if rg == 'salt':
        for _ in range(3):
            x, y = rnd.randrange(15), rnd.randrange(15)
            s.put(x, y, '#ffffff'); s.put(x + 1, y + 1, tone(base, -24))
    if rg in ('rocks', 'cliff', 'sand'):
        x, y = rnd.randrange(2, 14), rnd.randrange(2, 14)
        rp = ramp(GROUND[rg][2], 24)
        s.put(x, y, rp[0]); s.put(x + 1, y, rp[1]); s.put(x, y + 1, rp[2]); s.put(x + 1, y + 1, tone(base, -30))
    return s


def t_road(rg, v):
    base = GROUND[rg][1]
    s = Spr(16, 16, base)
    speckle(s, base, 991 + v + len(rg), 8)
    if rg == 'ruins':
        if v == 0:
            for x in range(3, 9):
                s.put(x, 7, '#c8b860'); s.put(x, 8, '#c8b860')
    else:
        for y in (4, 11):   # 轍
            for x in range(16):
                if (x + v) % 5:
                    s.put(x, y, tone(base, -14))
    return s


def t_rock(rg, v):
    base = GROUND[rg][0]
    s = Spr(16, 16, base)
    speckle(s, base, 31 + v, 6)
    rp = ramp(GROUND[rg][2], 30)
    rock = Spr(16, 16)
    if v == 0:
        rock.ell(8, 8.5, 7, 6, rp); rock.ell(5, 6, 3, 2.5, ramp(tone(GROUND[rg][2], 14), 30))
    elif v == 1:
        rock.ell(6, 9, 5, 5, rp); rock.ell(11.5, 8, 4, 5, ramp(tone(GROUND[rg][2], -8), 30), sep=True)
    else:
        rock.poly([(2, 13), (4, 4), (9, 2), (14, 6), (14, 13)], rp)
    rock.line(7, 9, 10, 11, rp[2])
    rock.outline()
    sh = Spr(16, 16)
    sh.shadow(9, 13.5, 7, 2.5)
    s.over(sh); s.over(rock)
    return s


def t_bldg(v):
    s = Spr(16, 16, '#3e4148')
    rp = ramp('#62666e', 22)
    s.rect(0, 0, 15, 15, rp)
    for x in range(1, 15):
        s.put(x, 1, tone('#62666e', 26))
    for (x, y) in ((3, 4), (9, 4), (3, 10), (9, 10)):
        s.rect(x, y, x + 3, y + 2, ramp('#4a4e56', 16))
        s.put(x + 1, y + 1, '#8a6a3a' if (x + y + v) % 3 == 0 else '#2a2c30')
    s.line(0, 15, 15, 15, '#2a2c30'); s.line(15, 0, 15, 15, '#2a2c30')
    return s


def water(base, hi, seed, edge=None):
    s = Spr(16, 16, base)
    rnd = random.Random(seed)
    for _ in range(4):
        x, y = rnd.randrange(12), rnd.randrange(1, 15)
        for i in range(4):
            s.put(x + i, y - (1 if i in (1, 2) else 0), hi)
    return s


def t_slope(v):
    base = '#9a7448'
    s = Spr(16, 16, base)
    for y in range(0, 16, 4):
        for x in range(16):
            s.put(x, y, tone(base, 26)); s.put(x, y + 1, tone(base, -10)); s.put(x, y + 3, tone(base, -26))
    s.put(7, 6, '#e8d8a0'); s.put(8, 5, '#e8d8a0'); s.put(9, 6, '#e8d8a0')
    s.put(7, 10, '#e8d8a0'); s.put(8, 9, '#e8d8a0'); s.put(9, 10, '#e8d8a0')
    return s


def t_rubble(v):
    s = Spr(16, 16, '#6a645c')
    speckle(s, '#6a645c', 77, 10)
    c = Spr(16, 16)
    c.poly([(1, 9), (4, 3), (9, 4), (8, 11)], ramp('#9a948a', 26))
    c.poly([(8, 12), (11, 5), (15, 8), (14, 15)], ramp('#868078', 26), sep=True)
    c.rect(3, 12, 6, 14, ramp('#a8763a', 20))
    c.line(10, 2, 13, 4, '#8a5a3a')
    c.outline()
    s.over(c)
    return s


def t_marsh(v):
    s = Spr(16, 16, '#d8d4c0')
    speckle(s, '#d8d4c0', 55 + v, 8)
    p = Spr(16, 16)
    p.ell(5, 6, 4, 2.5, ('#8ab0a0', '#6a9488', '#4e786c'))
    p.ell(11, 12, 4, 2, ('#8ab0a0', '#6a9488', '#4e786c'))
    s.over(p)
    s.put(4, 5, '#c8e8d8'); s.put(10, 11, '#c8e8d8')
    return s


def t_stone(rg):
    s = t_ground(rg, 0)
    st = Spr(16, 16)
    st.ell(8, 8, 5.5, 4.5, ramp('#9a8a6a', 30))
    st.line(6, 9, 9, 7, tone('#9a8a6a', -40))
    st.outline()
    sh = Spr(16, 16); sh.shadow(9, 12, 5.5, 2)
    s.over(sh); s.over(st)
    return s


def t_wreck(rg):
    s = t_ground(rg, 1)
    w = Spr(16, 16)
    w.rect(2, 4, 13, 11, ramp('#8a4e30', 24))
    w.rect(4, 5, 9, 9, ramp('#5a3a2a', 16))
    w.put(5, 6, '#2a2420'); w.put(6, 7, '#2a2420'); w.put(8, 6, '#a86a40')
    w.rect(1, 11, 4, 12, ramp('#2e2e30', 12)); w.rect(11, 11, 14, 12, ramp('#2e2e30', 12))
    w.line(11, 4, 14, 2, '#6a3a22')
    w.outline()
    sh = Spr(16, 16); sh.shadow(8, 13, 7, 2)
    s.over(sh); s.over(w)
    return s


def t_town():
    s = Spr(16, 16, GROUND['sand'][1])
    t = Spr(16, 16)
    t.rect(1, 5, 7, 13, ramp('#c9a86e')); t.rect(1, 3, 7, 5, ramp('#a8542e'))
    t.rect(8, 6, 14, 13, ramp('#b8986a')); t.rect(8, 4, 14, 6, ramp('#5a7a8a'))
    t.rect(10, 10, 11, 13, ('#3a2a1a', '#3a2a1a', '#3a2a1a'))
    t.line(12, 0, 12, 4, '#5c6672')
    t.outline()
    s.over(t)
    for x, y in ((3, 8), (5, 8), (9, 8), (13, 8)):
        s.put(x, y, '#ffd060')
    s.put(13, 0, '#e03919'); s.put(14, 0, '#e03919'); s.put(13, 1, '#a82a12')
    return s


# ---------------------------------------------------------------- 雑魚（16x16、右向き）
def mob(kind):
    s = Spr(16, 16)
    if kind == 'drone':
        s.rect(5, 6, 10, 10, ramp('#8a9aa8'))
        for x in (2, 13):
            s.line(x, 5, x, 11, '#5a6672')
            s.ell(x, 4, 2.5, 1, ('#e8f0f8', '#c8d4e0', '#9aa8b4'))
        s.put(9, 8, '#ff5a3a'); s.put(10, 8, '#ff9a6a')
    elif kind == 'swarm':
        s.ell(8, 8, 3.5, 3, ramp('#6ac87a'))
        for x in (3, 12):
            s.ell(x, 6, 2, 1, ('#e0ffe8', '#b0e8c0', '#80c090'))
        s.put(9, 8, '#ffe040')
    elif kind == 'buggy':
        s.rect(2, 7, 13, 11, ramp('#d8a040')); s.rect(5, 4, 10, 7, ramp('#4a4e56'))
        for x in (3, 11):
            s.ell(x + 1, 12, 2, 2, ramp('#2a2c30', 14))
        s.put(12, 8, '#fff0a0')
    elif kind == 'raider':
        s.rect(1, 7, 13, 11, ramp('#c86a3a')); s.rect(4, 5, 9, 7, ramp('#5a4a3a'))
        s.rect(7, 2, 9, 5, ramp('#6a6e76')); s.line(9, 3, 15, 3, '#8a8e96')
        for x in (2, 10):
            s.ell(x + 1, 12, 2, 2, ramp('#2a2c30', 14))
    elif kind == 'gunner':
        s.rect(2, 10, 13, 13, ramp('#4a4e46', 16)); s.rect(3, 6, 12, 10, ramp('#c8a85a'))
        s.ell(7, 6, 3, 2.5, ramp('#a8884a')); s.rect(9, 4, 15, 5, ramp('#6a6e76', 16))
    elif kind == 'junk':
        s.rect(3, 3, 12, 11, ramp('#7a7e86')); s.rect(5, 11, 6, 14, ramp('#5a5e66')); s.rect(9, 11, 10, 14, ramp('#5a5e66'))
        s.rect(5, 5, 10, 7, ('#2a2c30',) * 3); s.put(6, 6, '#ff5a3a'); s.put(9, 6, '#ff5a3a')
        s.line(12, 6, 15, 9, '#a8743e')
    elif kind == 'crab':
        s.ell(8, 9, 6, 4, ramp('#e8e4d8')); s.ell(8, 8, 3, 2, ramp('#c8a090'))
        s.ell(2, 6, 2, 2, ramp('#d88a6a')); s.ell(14, 6, 2, 2, ramp('#d88a6a'))
        for x in (3, 6, 10, 13):
            s.line(x, 12, x - 1, 14, '#a8705a')
    elif kind == 'boat':
        s.poly([(1, 8), (14, 8), (12, 13), (3, 13)], ramp('#5a8aa8')); s.rect(5, 5, 9, 8, ramp('#e8e0c8'))
        s.line(7, 1, 7, 5, '#6a6e76'); s.put(8, 1, '#e03919')
    elif kind == 'golem':
        s.ell(8, 8, 5, 5.5, ramp('#9a8060')); s.ell(3, 9, 2, 3, ramp('#8a7050')); s.ell(13, 9, 2, 3, ramp('#8a7050'))
        s.put(7, 6, '#ffb040'); s.put(10, 6, '#ffb040')
        s.line(6, 10, 9, 11, '#5a4430')
    elif kind == 'hawk':
        s.poly([(0, 6), (8, 8), (15, 4), (10, 10), (6, 11)], ramp('#a8b0c0')); s.ell(10, 7, 2.5, 2, ramp('#d8dce8'))
        s.put(12, 7, '#ffd040'); s.put(13, 7, '#e8a020')
    s.outline()
    out = Spr(16, 16)
    out.shadow(8, 14.5, 5, 1.5)
    out.over(s)
    return out


# ---------------------------------------------------------------- 賞金首（32x32、部位ごと）
def boss(id):
    P = {}
    def part(k):
        P[k] = Spr(32, 32)
        return P[k]
    if id == 'mantis':
        g = ramp('#6a9a5a')
        t = part('track')
        for x0 in (4, 20):
            t.poly([(x0, 30), (x0 + 3, 20), (x0 + 6, 21), (x0 + 4, 30)], ramp('#4a6a3a'))
        b = part('body')
        b.ell(16, 19, 9, 6, g); b.ell(16, 11, 5, 4, ramp('#7aaa6a'))
        b.put(14, 10, '#ff4a2a'); b.put(18, 10, '#ff4a2a'); b.put(14, 11, '#a82a12'); b.put(18, 11, '#a82a12')
        a = part('arm')
        for sgn in (-1, 1):
            cx = 16 + sgn * 9
            a.poly([(cx, 15), (cx + sgn * 5, 4), (cx + sgn * 7, 6), (cx + sgn * 3, 16)], ramp('#b8c8b0'))
            a.line(cx + sgn * 5, 4, cx + sgn * 2, 2, '#e8f0e8')
    elif id == 'scorpion':
        sh = part('shell')
        sh.ell(16, 20, 12, 6, ramp('#c8963a')); sh.line(6, 20, 26, 20, '#8a5a1a')
        b = part('body')
        b.ell(16, 21, 8, 4.5, ramp('#a87028')); b.ell(7, 24, 4, 2.5, ramp('#c88a3a')); b.ell(25, 24, 4, 2.5, ramp('#c88a3a'))
        b.put(13, 19, '#ffe040'); b.put(19, 19, '#ffe040')
        tl = part('tail')
        tl.poly([(14, 16), (12, 8), (16, 3), (21, 5), (18, 9), (18, 16)], ramp('#d8a028'))
        tl.rect(19, 2, 25, 5, ramp('#5a5e66', 18)); tl.put(26, 3, '#ff7a3a')
    elif id == 'worm':
        h = part('hide')
        for i, x in enumerate((6, 12, 18, 24)):
            h.ell(x, 22 - i, 5, 5, ramp('#8a6a9a'), sep=True)
        b = part('body')
        b.ell(16, 18, 8, 7, ramp('#a07ab0')); b.ell(16, 17, 5, 4, ramp('#c8a0d0'))
        j = part('jaw')
        for sgn in (-1, 1):
            j.poly([(16 + sgn * 2, 13), (16 + sgn * 9, 4), (16 + sgn * 6, 14)], ramp('#e8d8c0'))
        j.ell(16, 13, 3, 2, ('#5a1a2a', '#3a0a18', '#2a0610'))
    elif id == 'floater':
        bg = part('bag')
        bg.ell(7, 22, 5, 5, ramp('#f0ecd8')); bg.ell(25, 22, 5, 5, ramp('#f0ecd8'))
        b = part('body')
        b.rect(6, 15, 25, 24, ramp('#7a8a8a')); b.rect(10, 11, 21, 15, ramp('#5a6a6e'))
        b.line(6, 25, 25, 25, '#4a5458')
        s = part('shield')
        s.ell(16, 9, 4, 3, ramp('#7ad8f0')); s.line(16, 12, 16, 15, '#5a6a6e')
        s.put(15, 8, '#e8ffff')
        gn = part('gun')
        gn.rect(20, 13, 29, 14, ramp('#7ad8e8', 20)); gn.rect(20, 16, 29, 17, ramp('#7ad8e8', 20))
        gn.rect(18, 12, 22, 18, ramp('#5a7a8a'))
    elif id == 'ghost':
        t = part('track')
        t.rect(2, 22, 29, 28, ramp('#4a4e54', 16))
        for x in range(4, 28, 4):
            t.line(x, 23, x, 27, '#2a2c30')
        b = part('body')
        b.rect(4, 13, 27, 22, ramp('#9aa4b4')); b.rect(6, 14, 25, 16, ramp('#b8c4d4'))
        sb = part('sub')
        sb.ell(8, 12, 3, 2.5, ramp('#8a94a4')); sb.line(10, 11, 14, 9, '#c8d0dc')
        c = part('cannon')
        c.ell(18, 11, 6, 4.5, ramp('#b8c4d8')); c.rect(23, 9, 31, 11, ramp('#d8e0ec', 20))
        c.put(16, 10, '#ff4a2a')
    for k in P:
        P[k].outline()
    return P


# ---------------------------------------------------------------- 拾い物（8x8）
def pickup(kind):
    s = Spr(8, 8)
    if kind == 'scrap':
        s.poly([(1, 5), (3, 2), (6, 3), (6, 6), (2, 7)], ramp('#b8c0c8', 34)); s.put(4, 4, '#6a7480')
    elif kind == 'part':
        s.rect(1, 2, 6, 6, ramp('#a8742a', 26)); s.line(1, 4, 6, 4, '#ffd27a'); s.put(3, 3, '#fff0b0')
    elif kind == 'gold':
        s.ell(4, 4, 3, 3, ramp('#f0c840', 40)); s.put(3, 3, '#fff8c0')
    elif kind == 'note':
        s.rect(1, 1, 6, 6, ramp('#f0e8d0', 20)); s.line(2, 3, 5, 3, '#a89c84'); s.line(2, 5, 4, 5, '#e03919')
    elif kind == 'quest':
        s.rect(1, 2, 6, 6, ramp('#e86a8a', 30)); s.put(3, 3, '#ffe0e8'); s.put(4, 1, '#ffd27a')
    s.outline()
    return s


# ---------------------------------------------------------------- サキの顔（24x24）
def saki():
    s = Spr(24, 24)
    s.rect(4, 18, 19, 23, ramp('#4a6a5a'))                 # 作業着
    s.rect(10, 18, 13, 20, ramp('#e8c8a8'))                # 首
    s.ell(12, 11, 6.5, 7, ramp('#f0d0b0', 22))             # 顔
    s.ell(12, 6, 7.5, 4.5, ramp('#8a4a2a'))                # 髪
    s.rect(4, 6, 6, 14, ramp('#8a4a2a')); s.rect(18, 6, 20, 14, ramp('#8a4a2a'))
    s.rect(3, 9, 5, 13, ramp('#3a3e44', 16))              # ヘッドセット
    s.line(5, 14, 9, 16, '#3a3e44'); s.put(9, 16, '#e03919')
    for x in (9, 14):
        s.put(x, 11, '#2a1a12'); s.put(x, 12, '#2a1a12'); s.put(x + 1, 11, '#ffffff')
    s.put(11, 15, '#c86a5a'); s.put(12, 15, '#c86a5a')
    s.put(8, 13, '#f0a090'); s.put(16, 13, '#f0a090')
    s.outline()
    return s


# ---------------------------------------------------------------- 書き出し
def encode(s):
    pal, rows = [], []
    keys = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    for row in s.px:
        out = ''
        for c in row:
            if c is None:
                out += '.'
                continue
            if c not in pal:
                pal.append(c)
            out += keys[pal.index(c)]
        rows.append(out)
    assert len(pal) <= len(keys)
    return {'p': pal, 'r': rows}


def build():
    S = {}
    for rg in GROUND:
        for v in range(3):
            S['tile-ground-%s-%d' % (rg, v)] = t_ground(rg, v)
            S['tile-road-%s-%d' % (rg, v)] = t_road(rg, v)
            S['tile-rock-%s-%d' % (rg, v)] = t_rock(rg, v)
        S['tile-stone-%s' % rg] = t_stone(rg)
        S['tile-wreck-%s' % rg] = t_wreck(rg)
    S['tile-bldg-0'] = t_bldg(0)
    S['tile-bldg-1'] = t_bldg(1)
    S['tile-deep-0'] = water('#3a7a84', '#7ab8b8', 1)
    S['tile-river-0'] = water('#3a6a8a', '#8ac0d8', 2)
    S['tile-river-1'] = water('#3a6a8a', '#8ac0d8', 3)
    S['tile-slope-0'] = t_slope(0)
    S['tile-rubble-0'] = t_rubble(0)
    S['tile-marsh-0'] = t_marsh(0)
    S['tile-marsh-1'] = t_marsh(1)
    S['tile-town-0'] = t_town()
    for k in ('drone', 'buggy', 'raider', 'gunner', 'junk', 'swarm', 'crab', 'boat', 'golem', 'hawk'):
        S['mob-' + k] = mob(k)
    for b in ('mantis', 'scorpion', 'worm', 'floater', 'ghost'):
        for k, sp in boss(b).items():
            S['boss-%s-%s' % (b, k)] = sp
    for k in ('scrap', 'part', 'gold', 'note', 'quest'):
        S['pk-' + k] = pickup(k)
    S['face-saki'] = saki()
    return S


def write_png(path, w, h, rows):
    raw = b''.join(b'\x00' + bytes(r) for r in rows)
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def rgba(c):
    if c is None:
        return None
    if c.startswith('rgba'):
        v = c[5:-1].split(',')
        return (int(v[0]), int(v[1]), int(v[2]), float(v[3]))
    r, g, b = hx(c)
    return (r, g, b, 1.0)


def preview(S, path, scale=4, per=12):
    keys = list(S)
    cell = 34
    cols = per
    rowsN = (len(keys) + cols - 1) // cols
    W, H = cols * cell * scale, rowsN * cell * scale
    img = [[(236, 230, 220, 255)] * W for _ in range(H)]
    for i, k in enumerate(keys):
        s = S[k]
        ox, oy = (i % cols) * cell * scale, (i // cols) * cell * scale
        for y in range(s.h * scale):
            for x in range(s.w * scale):
                c = rgba(s.px[y // scale][x // scale])
                if not c:
                    continue
                bg = img[oy + y][ox + x]
                a = c[3]
                img[oy + y][ox + x] = tuple(int(c[j] * a + bg[j] * (1 - a)) for j in range(3)) + (255,)
    write_png(path, W, H, [[v for px in row for v in px] for row in img])


if __name__ == '__main__':
    import json
    S = build()
    data = {k: encode(v) for k, v in S.items()}
    lines = ['// 地形・雑魚・賞金首・拾い物・サキの顔のドット絵。_sprites.py が書き出す。手で直さず、_sprites.py を直して作り直す',
             '// p は色、r は1文字1ドットの行（"." は透明、ほかは p の番号）',
             'window.SPRITES = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';', '']
    with open(os.path.join(OUT, 'sprites.js'), 'w', encoding='utf-8', newline='\n') as fp:
        fp.write('\n'.join(lines))
    preview(S, os.path.join(OUT, '_sprites_preview.png'))
    print(len(S), 'sprites')
