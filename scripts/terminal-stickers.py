# Bakes a hand-picked set of clean stickers into small color pixel art for the terminal (agentpeeps watch / show).
# Writes avatars/terminal.json. Run after changing the picks:  npm run terminal-stickers   (needs Python + Pillow)
# Only simple, bold stickers make the cut: furry or photo-like ones (cats, capybaras, seals) turn to mush at 20x20.
import base64, json, os
from PIL import Image, ImageSequence

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'avatars')
W, H = 20, 20          # pixels; the terminal draws two per character cell, so 20 columns x 10 rows
MAX_FRAMES = 8
ALL = None
PICKS = {               # folder (under avatars/) -> sticker names, or ALL
    'stickers/model-logos': ALL,   # official logos, also each agent's default sticker
    'free/pixel-food': ALL, 'free/monster-icons': ALL, 'free/flame-expressions': ALL,
    'free/color-blobs': ALL, 'free/gradient-icons': ALL, 'free/plush-blobs': ALL,
    'free/retro-windows': ['retro-arrow-cursor', 'retro-blank-window', 'retro-desktop-computer', 'retro-hand-cursor', 'retro-heart-pet',
                           'retro-paint-palette', 'retro-pixel-tree', 'retro-recycle-bin', 'retro-warning-triangle', 'retro-yellow-folder'],
}

def frames(path):
    seq = [(f.convert('RGBA'), f.info.get('duration', 100)) for f in ImageSequence.Iterator(Image.open(path))]
    step = max(1, len(seq) // MAX_FRAMES)
    return [f for f, _ in seq[::step][:MAX_FRAMES]], round(sum(d for _, d in seq) / len(seq) * step)

def bake(path):
    fs, ms = frames(path)
    box = None  # one crop for every frame so they stay aligned
    for f in fs:
        b = f.getchannel('A').point(lambda v: 255 if v > 100 else 0).getbbox()
        if b: box = b if not box else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    s = min(W / (box[2] - box[0]), H / (box[3] - box[1]))
    w, h = max(1, round((box[2] - box[0]) * s)), max(1, round((box[3] - box[1]) * s))
    out = []
    for f in fs:
        im = f.crop(box).resize((w, h), Image.LANCZOS)
        im.putalpha(im.getchannel('A').point(lambda v: 255 if v > 110 else 0))  # hard edge: a pixel is there or not
        can = Image.new('RGBA', (W, H)); can.alpha_composite(im, ((W - w) // 2, H - h))  # sit on the bottom edge
        out.append(base64.b64encode(can.tobytes()).decode())
    return {'ms': ms, 'f': out} if len(out) > 1 else {'f': out}

art = {}
for folder, names in PICKS.items():
    d = os.path.join(ROOT, folder)
    for n in sorted(os.listdir(d)):
        base = n.rsplit('.', 1)[0]
        if base.endswith('-animated') or (names is not ALL and base not in names): continue
        twin = os.path.join(d, base + '-animated.webp')  # play the animated version when there is one
        art[f'{folder}/{n}'] = bake(twin if os.path.exists(twin) else os.path.join(d, n))

with open(os.path.join(ROOT, 'terminal.json'), 'w', encoding='utf8') as fh:
    json.dump({'w': W, 'h': H, 'art': art}, fh, separators=(',', ':'))
print(f"baked {len(art)} stickers ({sum(len(a['f']) > 1 for a in art.values())} animated) into avatars/terminal.json")
