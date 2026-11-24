import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from notes import NOTES
from pptx import Presentation
from pptx.util import Emu
from PIL import Image
d, outdir = sys.argv[1], sys.argv[2]
os.makedirs(f'{outdir}/slides', exist_ok=True)
prs = Presentation(); prs.slide_width = Emu(12192000); prs.slide_height = Emu(6858000)
imgs = []
N=len([f for f in os.listdir(f"{d}/out") if f.endswith(".png")])
for i in range(1, N+1):
    jpg = f'{outdir}/slides/slide{i:02d}.jpg'
    Image.open(f'{d}/out/slide{i:02d}.png').convert('RGB').save(jpg, quality=93, subsampling=0)
    s = prs.slides.add_slide(prs.slide_layouts[6])
    s.shapes.add_picture(jpg, 0, 0, prs.slide_width, prs.slide_height)
    if i in NOTES: s.notes_slide.notes_text_frame.text = NOTES[i]
    imgs.append(Image.open(jpg))
prs.save(f'{outdir}/Презентация_миграция_ВКС.pptx')
imgs[0].save(f'{outdir}/Презентация_миграция_ВКС.pdf', save_all=True, append_images=imgs[1:], resolution=200)
w, h = 960, 540
sheet = Image.new("RGB", (w*3+40, (h+20)*((len(imgs)+2)//3)+20), '#cfcac0')
for k, im in enumerate(imgs): sheet.paste(im.resize((w, h)), (10+(k%3)*(w+10), 10+(k//3)*(h+20)))
sheet.save(f'{outdir}/Обзор_всех_слайдов.jpg', quality=85)
