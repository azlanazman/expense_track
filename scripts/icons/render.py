# Renders the icon SVGs to PNGs with headless Chromium (pip install playwright; playwright install chromium).
# Run from the repo root:  python3 scripts/icons/mark.py && python3 scripts/icons/render.py
import asyncio, sys
from playwright.async_api import async_playwright
JOBS = [  # (svg, out, size, transparent)
 ('icons/icon-any.svg',      'icons/icon-192.png',            192, True),
 ('icons/icon-any.svg',      'icons/icon-512.png',            512, True),
 ('icons/icon-maskable.svg', 'icons/icon-maskable-512.png',   512, False),
 ('icons/icon-maskable.svg', 'icons/apple-touch-icon.png',    180, False),
 ('favicon.svg',             'icons/favicon-32.png',           32, True),
 ('favicon.svg',             'icons/favicon-48.png',           48, True),
]
async def main():
    async with async_playwright() as p:
        import os
        exe = '/opt/pw-browsers/chromium'
        b = await p.chromium.launch(executable_path=exe) if os.path.exists(exe) else await p.chromium.launch()
        for src, out, size, transp in JOBS:
            pg = await b.new_page(viewport={'width': size, 'height': size}, device_scale_factor=1)
            svg = open(src).read().replace('width="512" height="512">', 'width="%d" height="%d">' % (size, size), 1)
            await pg.set_content('<html><body style="margin:0;background:transparent">' + svg + '</body></html>')
            await pg.screenshot(path=out, omit_background=transp)
            await pg.close()
        await b.close()
asyncio.run(main())
