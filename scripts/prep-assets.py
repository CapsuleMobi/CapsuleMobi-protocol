"""Derives raster and favicon assets from brand/ originals. Run once; outputs are committed."""
import json, re, numpy as np
from PIL import Image

SRC = 'brand/LOGO CAPSULE PNG...png'
tokens = open('src/tokens.css', encoding='utf-8').read()
tok = dict(re.findall(r'(--color-[\w-]+):\s*(#[0-9a-fA-F]{6})', tokens))

im = Image.open(SRC).convert('RGBA')
a = np.array(im)
ys, xs = np.where(a[..., 3] > 0)
x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
print('ink bbox', x0, y0, x1, y1)

def hex_rgb(h): return tuple(int(h[i:i+2], 16) for i in (1, 3, 5))

def premul_resize(img, size):
    # RGBa is PIL's premultiplied mode, so black transparent regions cannot bleed into edges
    return img.convert('RGBa').resize(size, Image.LANCZOS).convert('RGBA')

pad = int((x1 - x0) * 0.06)
crop = im.crop((x0 - pad, y0 - pad, x1 + pad, y1 + pad))
w = 1024
master = premul_resize(crop, (w, round(crop.height * w / crop.width)))
master.save('brand/capsule-logo.png', optimize=True)

def square(img, side, inner):
    r = premul_resize(img, (inner, round(img.height * inner / img.width)))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(r, ((side - r.width) // 2, (side - r.height) // 2))
    return canvas

core = im.crop((x0, y0, x1, y1))
square(core, 192, 150).save('brand/logo-192.png', optimize=True)
tile = Image.new('RGBA', (180, 180), hex_rgb(tok['--color-silver']) + (255,))
tile.alpha_composite(square(core, 180, 140))
tile.convert('RGB').save('brand/apple-touch-icon.png', optimize=True)

# favicon: 128x128 cell grid (0.25 unit cells) of real alpha coverage, merged into runs
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
S = (x1 - x0) / 28 * 32
box = (int(cx - S / 2), int(cy - S / 2), int(cx + S / 2), int(cy + S / 2))
alpha = im.getchannel('A').crop(box).resize((128, 128), Image.BOX)
g = np.array(alpha) > 127
d = []
for r in range(128):
    c = 0
    while c < 128:
        if g[r, c]:
            s = c
            while c < 128 and g[r, c]: c += 1
            d.append(f'M{s/4:g} {r/4:g}h{(c-s)/4:g}v.25h-{(c-s)/4:g}z')
        else: c += 1
open('brand/favicon-path.txt', 'w').write(''.join(d))
print('favicon path bytes', len(''.join(d)))

# palette provenance: every token hex must be a real pixel at a real coordinate
picks = {
  '--color-ink-0':   ('reference/CAPSULE 1.jpg.jpeg', 328, 20),
  '--color-ink-1':   ('reference/CAPSULE 1.jpg.jpeg', 1282, 295),
  '--color-ink-2':   ('reference/CAPSULE 1.jpg.jpeg', 1109, 308),
  '--color-steel':   ('reference/CAPSULE 1.jpg.jpeg', 1015, 317),
  '--color-silver':  ('reference/CAPSULE 1.jpg.jpeg', 968, 310),
  '--color-logo-ink': (SRC, 1188, 769),
}
proof = {}
for k, (f, x, y) in picks.items():
    p = Image.open(f).convert('RGB').getpixel((x, y))
    proof[k] = {'file': f, 'x': x, 'y': y, 'hex': '#%02x%02x%02x' % p}
json.dump(proof, open('brand/palette-proof.json', 'w'), indent=2)
print(json.dumps(proof, indent=1))
