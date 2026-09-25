import os, struct, zlib

FW, FH = 28, 24
SCALE = 4
OUT = os.path.dirname(os.path.abspath(__file__))
SMEAR_COL = (236, 244, 255, 255)


def put(grid, x, y, c):
    if 0 <= x < FW and 0 <= y < FH and c != '.':
        grid[y][x] = c


def draw_rows(grid, rows, dx=0, dy=0):
    for y, spans in rows:
        for x0, s in spans.items():
            for i, c in enumerate(s):
                put(grid, x0 + i + dx, y + dy, c)


def draw_pts(grid, pts, dx=0, dy=0):
    for x, y, c in pts:
        put(grid, x + dx, y + dy, c)


def draw_leg(grid, pts, foot, col):
    for x, y in pts:
        put(grid, x, y, col)
        put(grid, x + 1, y, col)
    fx, fy, n = foot
    for i in range(n):
        put(grid, fx + i, fy, col)
    put(grid, fx + n - 1, fy - 1, col)


def outline(grid):
    out = [row[:] for row in grid]
    for y in range(FH):
        for x in range(FW):
            if grid[y][x] != '.':
                continue
            for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + ox, y + oy
                if 0 <= nx < FW and 0 <= ny < FH and grid[ny][nx] not in '.K':
                    out[y][x] = 'K'
                    break
    return out


def shift(pts, dx):
    return [(x + dx, y) for x, y in pts]


LEGS_STAND = {
    'back': ([(10, 18), (10, 19), (10, 20)], (10, 21, 3)),
    'front': ([(13, 18), (13, 19), (14, 20)], (14, 21, 3)),
}
LEGS_STRIDE_A = {
    'back': ([(10, 18), (9, 19), (8, 20)], (7, 21, 3)),
    'front': ([(13, 18), (14, 19), (15, 20)], (15, 21, 3)),
}
LEGS_STRIDE_B = {
    'back': ([(13, 18), (14, 19), (15, 20)], (15, 21, 3)),
    'front': ([(10, 18), (9, 19), (8, 20)], (7, 21, 3)),
}
LEGS_PASS_A = {
    'back': ([(11, 18), (11, 19), (11, 20)], (10, 20, 3)),
    'front': ([(12, 18), (12, 19), (12, 20)], (12, 21, 3)),
}
LEGS_PASS_B = {
    'back': ([(12, 18), (12, 19), (12, 20)], (12, 21, 3)),
    'front': ([(11, 18), (11, 19), (11, 20)], (10, 20, 3)),
}


def frame(ch, legs, body_dy=0, head_dy=0, arm_dx=0, arm_dy=0, body_dx=0, head_dx=0, legs_dx=0,
          arm='hold', face=None, smear=None, flash=False):
    grid = [['.'] * FW for _ in range(FH)]
    back_pts, back_foot = legs['back']
    front_pts, front_foot = legs['front']
    back_col, front_col = ch['legs']
    draw_leg(grid, shift(back_pts, legs_dx), (back_foot[0] + legs_dx,) + back_foot[1:], back_col)
    draw_pts(grid, ch['back_arm'][arm], body_dx - arm_dx, body_dy + (arm_dy if ch.get('back_arm_moves') else 0))
    draw_rows(grid, ch['torso'], body_dx, body_dy)
    draw_leg(grid, shift(front_pts, legs_dx), (front_foot[0] + legs_dx,) + front_foot[1:], front_col)
    draw_rows(grid, ch['torso'][-3:], body_dx, body_dy)
    hx, hy = body_dx + head_dx + ch.get('head_dx', 0), body_dy + head_dy
    draw_rows(grid, ch['head'], hx, hy)
    if face:
        draw_rows(grid, ch['faces'][face], hx, hy)
    draw_pts(grid, ch['arm'][arm], body_dx + arm_dx, body_dy + arm_dy)
    g = outline(grid)
    if flash:
        g = [['w' if c not in '.K' else c for c in row] for row in g]
    if smear:
        for x, y in ch['smear'][smear]:
            if 0 <= x < FW and 0 <= y < FH and g[y][x] == '.':
                g[y][x] = '*'
    return g


GOBLIN_BACK = [(8, y, 'd') for y in range(12, 17)]
GOBLIN = {
    'pal': {
        'K': (28, 22, 34), 'G': (156, 204, 84), 'g': (104, 160, 60), 'd': (58, 100, 44),
        'e': (252, 224, 64), 'r': (210, 48, 40), 'w': (240, 236, 220),
        'b': (132, 88, 52), 'B': (86, 56, 36), 'l': (184, 132, 72), 'm': (200, 206, 220), 'M': (112, 118, 136),
    },
    'legs': ('d', 'g'),
    'head': [
        (3,  {10: 'gGGGg'}),
        (4,  {2: 'G', 9: 'gGGGGGg'}),
        (5,  {2: 'dGGGGg', 8: 'gGGGGdddg'}),
        (6,  {3: 'ddggg', 8: 'gGGGGgerg', 17: 'g'}),
        (7,  {5: 'ddg', 8: 'ggGGGgggg', 17: 'gG'}),
        (8,  {8: 'dgggggggg', 17: 'gd'}),
        (9,  {9: 'dggKwKwK'}),
        (10, {10: 'ddgggd'}),
    ],
    'torso': [
        (11, {9: 'Bbbbbb', 15: 'gg'}),
        (12, {9: 'Bbbbbb', 15: 'Gg'}),
        (13, {9: 'Bbbbbb', 16: 'gg'}),
        (14, {9: 'Bbbbbb'}),
        (15, {9: 'llllll'}),
        (16, {9: 'Bbbbbb'}),
        (17, {9: 'b.bb.b'}),
    ],
    'faces': {
        'hurt': [(6, {14: 'KK'}), (5, {13: 'gdd'}), (9, {9: 'dgKwKKwK'}), (10, {10: 'dKKKgd'})],
    },
    'arm': {
        'hold': [(17, 14, 'g'), (18, 14, 'G'), (18, 15, 'g'), (19, 14, 'M'), (19, 15, 'B'), (19, 13, 'M'),
                 (20, 13, 'm'), (21, 12, 'm'), (22, 11, 'm')],
        'windup': [(15, 12, 'g'), (14, 13, 'g'), (13, 14, 'g'), (12, 15, 'g'), (11, 15, 'G'), (10, 14, 'M'), (10, 16, 'M'),
                   (10, 15, 'M'), (9, 15, 'm'), (8, 15, 'm'), (7, 15, 'm'), (6, 15, 'm')],
        'strike': [(16, 12, 'g'), (17, 12, 'g'), (18, 12, 'g'), (19, 12, 'G'), (19, 13, 'B'), (20, 11, 'M'), (20, 13, 'M'),
                   (20, 12, 'M'), (21, 12, 'm'), (22, 12, 'm'), (23, 12, 'm'), (24, 12, 'm')],
        'follow': [(16, 13, 'g'), (17, 13, 'g'), (18, 14, 'g'), (19, 14, 'G'), (19, 15, 'B'), (20, 13, 'M'), (20, 15, 'M'),
                   (20, 14, 'M'), (21, 15, 'm'), (22, 16, 'm')],
        'flail': [(15, 11, 'g'), (16, 10, 'g'), (17, 9, 'G'), (17, 10, 'B'), (18, 9, 'M'), (18, 8, 'M'),
                  (19, 8, 'm'), (20, 7, 'm'), (21, 6, 'm')],
    },
    'back_arm': {k: GOBLIN_BACK for k in ('hold', 'windup', 'strike', 'follow', 'flail')},
    'smear': {
        'strike': [(24, 9), (25, 10), (26, 11), (26, 13), (25, 14), (24, 15)],
        'follow': [(24, 12), (25, 13)],
    },
}
GOBLIN['frames'] = [
    ('idle_0', frame(GOBLIN, LEGS_STAND)),
    ('idle_1', frame(GOBLIN, LEGS_STAND, head_dy=1, arm_dy=1)),
    ('walk_0', frame(GOBLIN, LEGS_STRIDE_A, arm_dx=1)),
    ('walk_1', frame(GOBLIN, LEGS_PASS_A, body_dy=-1)),
    ('walk_2', frame(GOBLIN, LEGS_STRIDE_B, arm_dx=-1)),
    ('walk_3', frame(GOBLIN, LEGS_PASS_B, body_dy=-1)),
    ('attack_0', frame(GOBLIN, LEGS_STAND, body_dx=-1, head_dx=-1, arm='windup')),
    ('attack_1', frame(GOBLIN, LEGS_STRIDE_A, body_dx=1, legs_dx=1, head_dy=1, arm='strike', smear='strike')),
    ('attack_2', frame(GOBLIN, LEGS_STRIDE_A, body_dx=1, legs_dx=1, body_dy=1, arm='follow', smear='follow')),
    ('attack_3', frame(GOBLIN, LEGS_STAND, arm='hold', arm_dy=1)),
    ('hurt_0', frame(GOBLIN, LEGS_STAND, body_dx=-1, head_dx=-1, arm='flail', face='hurt', flash=True)),
    ('hurt_1', frame(GOBLIN, LEGS_STAND, body_dx=-2, head_dx=-1, legs_dx=-1, head_dy=-1, arm='flail', face='hurt')),
]

ZOMBIE = {
    'pal': {
        'K': (24, 20, 28), 'G': (176, 194, 150), 'g': (124, 150, 110), 'd': (76, 98, 74),
        'e': (236, 244, 196), 'h': (54, 44, 40), 'w': (222, 214, 186), 'l': (140, 30, 34),
        'b': (96, 110, 146), 'B': (60, 66, 100), 'p': (104, 90, 74), 'P': (66, 56, 48),
    },
    'legs': ('P', 'p'),
    'back_arm_moves': True,
    'head_dx': 1,
    'head': [
        (2,  {10: 'hhhh'}),
        (3,  {9: 'hhhhhG'}),
        (4,  {8: 'hhhhGGGg'}),
        (5,  {8: 'hhgGGddg'}),
        (6,  {8: 'hgdgGdeg', 16: 'g'}),
        (7,  {8: 'hggggGdg', 16: 'gd'}),
        (8,  {9: 'gggdgKK'}),
        (9,  {9: 'dgglKwK'}),
        (10, {10: 'ddgd'}),
    ],
    'torso': [
        (11, {9: 'Bbbbbb'}),
        (12, {9: 'BbgbbB'}),
        (13, {9: 'Bbbgbb'}),
        (14, {9: 'Bbblbb'}),
        (15, {9: 'BBBBBB'}),
        (16, {9: 'bBb.bb'}),
        (17, {9: 'b..b.b'}),
    ],
    'faces': {
        'hurt': [(6, {14: 'K'}), (8, {13: 'KKK'}), (9, {12: 'lKKK'}), (10, {11: 'dKd'})],
    },
    'arm': {
        'hold': [(15, 12, 'b'), (16, 13, 'b'), (17, 13, 'g'), (18, 13, 'g'), (19, 13, 'g'), (20, 13, 'G'), (21, 13, 'G'),
                 (21, 14, 'g')],
        'windup': [(15, 13, 'b'), (16, 14, 'g'), (17, 15, 'g'), (18, 16, 'G'), (18, 17, 'G')],
        'strike': [(15, 12, 'b'), (16, 11, 'b'), (17, 11, 'g'), (18, 11, 'g'), (19, 11, 'g'), (20, 11, 'g'), (21, 11, 'G'),
                   (22, 11, 'G'), (23, 11, 'G'), (23, 12, 'w'), (24, 11, 'w')],
        'follow': [(15, 13, 'b'), (16, 14, 'g'), (17, 15, 'g'), (18, 16, 'g'), (19, 17, 'G'), (20, 17, 'G')],
        'flail': [(16, 11, 'b'), (17, 10, 'g'), (18, 9, 'g'), (19, 8, 'g'), (20, 7, 'G'), (21, 6, 'G')],
    },
    'back_arm': {
        'hold': [(15, 11, 'B'), (16, 11, 'B'), (17, 11, 'd'), (18, 11, 'd'), (19, 11, 'd'), (20, 11, 'd'), (21, 11, 'd')],
        'windup': [(15, 12, 'B'), (16, 13, 'd'), (17, 14, 'd'), (17, 15, 'd')],
        'strike': [(15, 10, 'B'), (16, 10, 'B'), (17, 9, 'd'), (18, 9, 'd'), (19, 9, 'd'), (20, 9, 'd'), (21, 9, 'd'),
                   (22, 9, 'd')],
        'follow': [(15, 12, 'B'), (16, 13, 'd'), (17, 14, 'd'), (18, 15, 'd'), (19, 16, 'd')],
        'flail': [(14, 11, 'B'), (15, 10, 'd'), (16, 9, 'd'), (17, 8, 'd')],
    },
    'smear': {
        'strike': [(25, 8), (26, 9), (25, 11), (26, 12), (25, 14), (26, 15)],
        'follow': [(22, 15), (23, 16), (21, 18), (22, 19)],
    },
}
ZOMBIE['frames'] = [
    ('idle_0', frame(ZOMBIE, LEGS_STAND)),
    ('idle_1', frame(ZOMBIE, LEGS_STAND, head_dx=1, head_dy=1, arm_dy=1)),
    ('walk_0', frame(ZOMBIE, LEGS_STRIDE_A, head_dy=1)),
    ('walk_1', frame(ZOMBIE, LEGS_PASS_A, arm_dy=1)),
    ('walk_2', frame(ZOMBIE, LEGS_STRIDE_B, head_dy=1, head_dx=1)),
    ('walk_3', frame(ZOMBIE, LEGS_PASS_B, arm_dy=1)),
    ('attack_0', frame(ZOMBIE, LEGS_STAND, body_dy=1, head_dy=1, arm='windup')),
    ('attack_1', frame(ZOMBIE, LEGS_STRIDE_A, body_dx=1, legs_dx=1, arm='strike', smear='strike')),
    ('attack_2', frame(ZOMBIE, LEGS_STRIDE_A, body_dx=1, legs_dx=1, body_dy=1, arm='follow', smear='follow')),
    ('attack_3', frame(ZOMBIE, LEGS_STAND, arm='hold', arm_dy=1)),
    ('hurt_0', frame(ZOMBIE, LEGS_STAND, body_dx=-1, head_dx=-1, arm='flail', face='hurt', flash=True)),
    ('hurt_1', frame(ZOMBIE, LEGS_STAND, body_dx=-2, head_dx=-1, legs_dx=-1, head_dy=-1, arm='flail', face='hurt')),
]


def write_png(path, w, h, rgba_rows):
    raw = b''.join(b'\x00' + bytes(row) for row in rgba_rows)
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    data += chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(data)


def render(ch, grids, scale):
    pal = ch['pal']
    def rgba(c):
        if c == '.':
            return (0, 0, 0, 0)
        return SMEAR_COL if c == '*' else pal[c] + (255,)
    w, h = FW * len(grids) * scale, FH * scale
    rows = []
    for y in range(h):
        row = []
        for g in grids:
            for x in range(FW * scale):
                row.extend(rgba(g[y // scale][x // scale]))
        rows.append(row)
    return w, h, rows


if __name__ == '__main__':
    for name, ch in (('goblin', GOBLIN), ('zombie', ZOMBIE)):
        d = os.path.join(OUT, 'frames' if name == 'goblin' else 'frames_' + name)
        os.makedirs(d, exist_ok=True)
        for fname, g in ch['frames']:
            write_png(os.path.join(d, fname + '.png'), *render(ch, [g], SCALE))
        grids = [g for _, g in ch['frames']]
        write_png(os.path.join(OUT, name + '_sheet.png'), *render(ch, grids, SCALE))
        write_png(os.path.join(OUT, name + '_sheet_1x.png'), *render(ch, grids, 1))
    print('ok')
