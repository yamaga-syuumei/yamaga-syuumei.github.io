import os, struct, zlib

OUT = os.path.dirname(os.path.abspath(__file__))
FW, FH = 32, 64

PAL = {
    'K': (40, 28, 30), 'Y': (242, 190, 70), 'y': (208, 146, 50), 'G': (252, 222, 128),
    'W': (248, 245, 240), 'w': (212, 204, 200), 'N': (78, 50, 38), 'P': (240, 140, 140),
    'E': (60, 52, 36), 'A': (206, 210, 216), 'a': (150, 155, 164), 'b': (96, 100, 112),
    'S': (236, 240, 244), 'L': (130, 84, 50), 'l': (84, 52, 34), 'C': (226, 204, 150),
    'R': (190, 60, 50),
}

FRONT = [
    '................................',
    '.............N.......N..........',
    '............NN......NN..........',
    '............YW......WY..........',
    '...........YWW.YYY.WWY..........',
    '...........YWWYGGGYWWY..........',
    '...........YYWGGGGGWYy..........',
    '...........YGGGGGGGGYy..........',
    '...........YGKKGGGKKGy..........',
    '...........YGGEGGGEGGy..........',
    '..........NWWPGGGGPGYy..........',
    '...........WWWKWWGGGYy..........',
    '............WWWWWWGYy...........',
    '.............WWWWWY..bAAb.......',
    '........bAAaWWWWWWWWaAAAAb......',
    '.......bAAAaLLLLLLLLaAAAAAb.....',
    '.......bAAaaWWWWWWWWaAAAaab.....',
    '......baAaaaWWWwwWWWaaAaaab.....',
    '......bbaabWWWWwwWWWWbaaabb.....',
    '......yYYWWWWWwwWWWWWWYYy.......',
    '......yYYaWWWWwwWWWWWaYYy.......',
    '......yYYaAWWWwwWWWWAaYYy.......',
    '......aaaaAAWWwCwWWAAaaaa.......',
    '......aAAaAAAAblbAAAAaAAa.......',
    '.......aAAaaAAblbAAaaAAa........',
    '........aAAaaaAlAaaaAAa.........',
    '.........aAANNNNNNNAAa..........',
    '..........aANNNNNNNAa...........',
    '........LLLLNNNNNNNLLLL.........',
    '........lLLlLNNNNNLlLLl.........',
    '.......aAAaCCCCCCCCCaAAAa.......',
    '.......aAAaRNSSCaaYYaAAAa.......',
    '......baAAaRNSSCaaYYaAAAab......',
    '......baAaaNRSSCaaYyaAAaab......',
    '......bbaabRNSSCaayYaaaabbYY....',
    '.......YYYYyRSSCaayYYYYyYGYYY...',
    '......YYYYYyRSSAaayYYYYyyGGYYY..',
    '......YYYYYyRSSAaayYYYYyyGGGYYY.',
    '......YYYYyy.SSAaa.YYYYyyGGGGYY.',
    '......YYYYyy.SSAaa.YYYYyyGGGGYY.',
    '......YYYyyy.SSAaa.YYYyyyGGGGYY.',
    '.......yYYyy.SSAaa.yYYyyyyGGGYY.',
    '.......aAAAa.SSAaa.aAAAayyGGGYY.',
    '.......aAAAa.SSAaa.aAAAayyyGGYY.',
    '..WWWW.bAAab.SAAaa.bAAabyyyGGYY.',
    '.WWWWWwbaaab.SAAaa.baaabyyyyGYY.',
    '.WWWWWwaAAab.SAAaa.aAAabyyyyyYY.',
    '.WWWWWwaAAab.SAAaa.aAAabyyyyyy..',
    '.wWWWWwaAAab.SAAaa.aAAabyyyyy...',
    '.wwWWWwaAAab..SAa..aAAabyyyy....',
    '..wwWWwaAAab..SAa..aAAabyyy.....',
    '...wwwwaAAab..SAa..aAAab........',
    '.....wwaAAab..SAa..aAAab........',
    '.......aAAab..SAa..aAAab........',
    '.......aAAab..SAa..aAAab........',
    '.......aAAab..SAa..aAAab........',
    '.......baaab..SAa..baaab........',
    '......aAAAab..SA..aAAAab........',
    '.....NNNNNNb..SA..NNNNNNN.......',
    '.....NNNNNN...S...NNNNNNN.......',
    '..............S.................',
    '................................',
    '................................',
    '................................',
]


def outline(rows):
    g = [list(r) for r in rows]
    out = [r[:] for r in g]
    for y in range(FH):
        for x in range(FW):
            if g[y][x] != '.':
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < FW and 0 <= ny < FH and g[ny][nx] not in '.K':
                    out[y][x] = 'K'
                    break
    return out


def write_png(path, grids, scale, bg=None):
    w, h = FW * len(grids) * scale, FH * scale
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for g in grids:
            for x in range(FW * scale):
                c = g[y // scale][x // scale]
                if c == '.':
                    raw.extend(bg + (255,) if bg else (0, 0, 0, 0))
                else:
                    raw.extend(PAL[c] + (255,))
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    data += chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(data)


if __name__ == '__main__':
    for i, r in enumerate(FRONT):
        assert len(r) == FW, (i, len(r))
    assert len(FRONT) == FH
    g = outline(FRONT)
    write_png(os.path.join(OUT, 'fox_front_1x.png'), [g], 1)
    write_png(os.path.join(OUT, 'fox_front_4x.png'), [g], 4)
    import sys
    if len(sys.argv) > 1:
        write_png(sys.argv[1], [g], 8, (150, 196, 160))
    print('ok')
