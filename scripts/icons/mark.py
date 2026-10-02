# Generates the SVG variants of the monogram icon (run from the repo root; writes icons/*.svg and favicon.svg).
# Icon background is pure black (changed 2026-10-02); --accent #FEC000 (yellow), shadow #B37900.
BG, FG, SH = '#000000', '#FEC000', '#B37900'

def letter(dx=0, dy=0, scale=1.0, shadow=16):
    # heavy rounded "T": crossbar + stem; drawn twice (hard offset shadow, then letter)
    def shape(fill, ox, oy):
        return (f'<g fill="{fill}" transform="translate({ox} {oy})">'
                '<rect x="136" y="132" width="240" height="76" rx="38"/>'
                '<rect x="218" y="132" width="76" height="248" rx="38"/></g>')
    inner = shape(SH, shadow, shadow) + shape(FG, 0, 0)
    # centre the letter+shadow block on the 512 canvas, then scale about the centre
    cx, cy = 256 + shadow/2 - 0, 256 + shadow/2 - 6
    return (f'<g transform="translate({256 + dx} {256 + dy}) scale({scale}) translate({-cx} {-cy})">{inner}</g>')

def svg(bg_rx, scale, shadow, title):
    bg = f'<rect width="512" height="512" rx="{bg_rx}" fill="{BG}"/>' if bg_rx else f'<rect width="512" height="512" fill="{BG}"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">'
            f'<title>{title}</title>{bg}{letter(0, 0, scale, shadow)}</svg>\n')

open('icons/icon-maskable.svg', 'w').write(svg(0, 1.0, 16, 'Expense Tracker'))      # full-bleed; OS applies its own mask
open('icons/icon-any.svg',      'w').write(svg(112, 1.12, 16, 'Expense Tracker'))  # rounded; transparent corners
open('favicon.svg',             'w').write(svg(112, 1.3, 14, 'Expense Tracker'))   # tab icon: bigger letter
