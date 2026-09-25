import os, struct, zlib

SIZE = 24
SCALE = 4
OUT = os.path.dirname(os.path.abspath(__file__))

PAL = {
    'K': (28, 22, 34),
    'G': (156, 204, 84),
    'g': (104, 160, 60),
    'd': (58, 100, 44),
    'e': (252, 224, 64),
    'r': (210, 48, 40),
    'w': (240, 236, 220),
    'b': (132, 88, 52),
    'B': (86, 56, 36),
    'l': (184, 132, 72),
    'm': (200, 206, 220),
    'M': (112, 118, 136),
}

HEAD = [
    (3,  {10: 'gGGGg'}),
    (4,  {2: 'G', 9: 'gGGGGGg'}),
    (5,  {2: 'dGGGGg', 8: 'gGGGGdddg'}),
    (6,  {3: 'ddggg', 8: 'gGGGGgerg', 17: 'g'}),
    (7,  {5: 'ddg', 8: 'ggGGGgggg', 17: 'gG'}),
    (8,  {8: 'dgggggggg', 17: 'gd'}),
    (9,  {9: 'dggKwKwK'}),
    (10, {10: 'ddgggd'}),
]
TORSO = [
    (11, {9: 'Bbbbbb', 15: 'gg'}),
    (12, {9: 'Bbbbbb', 15: 'Gg'}),
    (13, {9: 'Bbbbbb', 16: 'gg'}),
    (14, {9: 'Bbbbbb'}),
    (15, {9: 'llllll'}),
    (16, {9: 'Bbbbbb'}),
    (17, {9: 'b.bb.b'}),
]


def put(grid, x, y, c):
    if 0 <= x < SIZE and 0 <= y < SIZE and c != '.':
        grid[y][x] = c


def draw_rows(grid, rows, dx=0, dy=0):
    for y, spans in rows:
        for x0, s in spans.items():
            for i, c in enumerate(s):
                put(grid, x0 + i + dx, y + dy, c)


def draw_leg(grid, pts, foot, col, dy=0):
    for x, y in pts:
        put(grid, x, y + dy, col)
        put(grid, x + 1, y + dy, col)
    fx, fy, n = foot
    for i in range(n):
        put(grid, fx + i, fy + dy, col)
    put(grid, fx + n - 1, fy + dy - 1, col)


def draw_back_arm(grid, dx, dy):
    for y in range(12, 16):
        put(grid, 8 + dx, y + dy, 'd')
    put(grid, 8 + dx, 16 + dy, 'd')


def draw_dagger_arm(grid, dx, dy):
    put(grid, 17 + dx, 14 + dy, 'g')
    put(grid, 18 + dx, 14 + dy, 'G')
    put(grid, 18 + dx, 15 + dy, 'g')
    put(grid, 19 + dx, 14 + dy, 'M')
    put(grid, 19 + dx, 15 + dy, 'B')
    for i, c in enumerate('mmm'):
        put(grid, 20 + dx + i, 13 + dy - i, c)
    put(grid, 19 + dx, 13 + dy, 'M')


def outline(grid):
    out = [row[:] for row in grid]
    for y in range(SIZE):
        for x in range(SIZE):
            if grid[y][x] != '.':
                continue
            for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + ox, y + oy
                if 0 <= nx < SIZE and 0 <= ny < SIZE and grid[ny][nx] not in '.K':
                    out[y][x] = 'K'
                    break
    return out


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


def frame(legs, body_dy=0, head_dy=0, arm_dx=0, dagger_dy=0):
    grid = [['.'] * SIZE for _ in range(SIZE)]
    back_pts, back_foot = legs['back']
    front_pts, front_foot = legs['front']
    draw_leg(grid, back_pts, back_foot, 'd')
    draw_back_arm(grid, -arm_dx, body_dy)
    draw_rows(grid, TORSO, 0, body_dy)
    draw_leg(grid, front_pts, front_foot, 'g')
    draw_rows(grid, TORSO[-3:], 0, body_dy)
    draw_rows(grid, HEAD, 0, body_dy + head_dy)
    draw_dagger_arm(grid, arm_dx, body_dy + dagger_dy)
    return outline(grid)


FRAMES = [
    ('idle_0', frame(LEGS_STAND)),
    ('idle_1', frame(LEGS_STAND, head_dy=1, dagger_dy=1)),
    ('walk_0', frame(LEGS_STRIDE_A, arm_dx=1)),
    ('walk_1', frame(LEGS_PASS_A, body_dy=-1)),
    ('walk_2', frame(LEGS_STRIDE_B, arm_dx=-1)),
    ('walk_3', frame(LEGS_PASS_B, body_dy=-1)),
]


def write_png(path, w, h, rgba_rows):
    raw = b''.join(b'\x00' + bytes(row) for row in rgba_rows)
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    data += chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(data)


def rgba(c):
    return (0, 0, 0, 0) if c == '.' else PAL[c] + (255,)


def render(grids, scale):
    w, h = SIZE * len(grids) * scale, SIZE * scale
    rows = []
    for y in range(h):
        row = []
        for g in grids:
            for x in range(SIZE * scale):
                row.extend(rgba(g[y // scale][x // scale]))
        rows.append(row)
    return w, h, rows


os.makedirs(os.path.join(OUT, 'frames'), exist_ok=True)
for name, g in FRAMES:
    write_png(os.path.join(OUT, 'frames', name + '.png'), *render([g], SCALE))
write_png(os.path.join(OUT, 'goblin_sheet.png'), *render([g for _, g in FRAMES], SCALE))
write_png(os.path.join(OUT, 'goblin_sheet_1x.png'), *render([g for _, g in FRAMES], 1))
print('ok')
