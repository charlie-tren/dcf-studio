"""Renders public/og-card.png, the 1200x630 share card.

WHY THIS EXISTS. Before it, app/layout.tsx declared a title and a description
and no Open Graph tags at all, so every share of the site - the one project here
most likely to be passed around, since it answers a question in one URL -
unfurled in Slack, iMessage and X as a bare link. A link with no card is not
neutral: next to carded links it reads as a dead or untrusted page.

TWO RULES SHAPE WHAT IS DRAWN, both lifted from statecraft/make_card.py in the
hub repo, which is the same job solved once already.

1. DARK, FROM THE PAGE'S OWN TOKENS. Every image asset on this estate is dark,
   and a light rectangle in a dark chat thread reads as a page from somewhere
   else. The palette is PARSED out of app/globals.css rather than copied here,
   so restyling the app and not restyling the card shows up as a diff instead of
   as drift. Statecraft's card kept an old accent and an old font stack through
   two redesigns exactly because those values were hand-copied.

2. IT SHOWS THE DEFAULT VIEW, WHICH IS EMPTY. The app opens on a search box with
   no company chosen, so there is no valuation to draw. A card showing a
   specific ticker's numbers would advertise a state nobody arrives at, and it
   would go stale the moment that company reports. So the card is type only.
   public/valuations.json is deliberately NOT read here for that reason.

Run it by hand after changing the palette, the wordmark or og:description:

    python tools/make_card.py
"""

import pathlib
import re
import sys

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent
CSS = ROOT / "app" / "globals.css"
LAYOUT = ROOT / "app" / "layout.tsx"
OUT = ROOT / "public" / "og-card.png"
SCRATCH = HERE / "_card_scratch.html"

WIDTH, HEIGHT = 1200, 630
DOMAIN = "dcf.charlietrenorden.com"

PROP = re.compile(r"--([a-z0-9-]+):\s*([^;]+);")


def tokens():
    """Every custom property from the :root block of globals.css."""
    css = CSS.read_text(encoding="utf-8")
    start = css.index(":root {")
    block = css[start:css.index("}", start)]
    found = {k: v.strip() for k, v in PROP.findall(block)}
    missing = [k for k in ("bg", "surface", "border", "text", "text-dim",
                           "text-faint", "accent") if k not in found]
    if missing:
        raise SystemExit(f"globals.css :root has no {', '.join(missing)}; "
                         f"the share card cannot be built from it")
    return found


def description():
    """og:description, READ OUT OF layout.tsx rather than restated here.

    The card and the tag are the same sentence to the reader - one is the
    preview image, the other the preview text - so a card carrying an older
    wording than the tag beside it is the drift this file exists to prevent.
    """
    src = LAYOUT.read_text(encoding="utf-8")
    m = re.search(r'const DESCRIPTION\s*=\s*\n?\s*"((?:[^"\\]|\\.)*)"', src)
    if not m:
        raise SystemExit("could not read `const DESCRIPTION` out of app/layout.tsx; "
                         "it is the one place the sentence lives, so a rename has to "
                         "fail here rather than let the card carry an older wording")
    return m.group(1).encode().decode("unicode_escape")


def page_html(t, lede):
    return f"""<!doctype html>
<html><head><meta charset="utf-8">
<!-- The faces the app actually uses. Without these the card renders in
     whatever the shooting machine has, which is how statecraft's came out in a
     generic sans while the site was in Archivo. The renderer asks for the
     faces and asserts on them before shooting. -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap">
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  html, body {{ width: {WIDTH}px; height: {HEIGHT}px; }}
  body {{
    background: {t['bg']};
    color: {t['text']};
    font-family: Geist, system-ui, sans-serif;
    padding: 78px 84px 70px;
    display: flex;
    flex-direction: column;
    /* The text block centres in the frame and the rule is pinned to the
       bottom. Stacked from the top instead, the card carried a slack 200px
       band between the lede and the rule and read as unfinished. */
    justify-content: center;
    position: relative;
  }}
  .eyebrow {{
    font-family: "Geist Mono", ui-monospace, monospace;
    font-size: 19px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: {t['accent']};
  }}
  h1 {{
    margin-top: 22px;
    font-size: 104px;
    font-weight: 500;
    letter-spacing: -0.032em;
    line-height: 1;
  }}
  .lede {{
    margin-top: 30px;
    margin-bottom: 96px;
    max-width: 880px;
    color: {t['text-dim']};
    font-size: 31px;
    line-height: 1.38;
  }}
  .foot {{
    position: absolute;
    left: 84px;
    right: 84px;
    bottom: 70px;
    padding-top: 30px;
    border-top: 1px solid {t['border']};
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    font-family: "Geist Mono", ui-monospace, monospace;
    font-size: 21px;
    color: {t['text-faint']};
  }}
  .foot .dom {{ color: {t['text-dim']}; }}
</style></head>
<body>
  <p class="eyebrow">Discounted cashflow</p>
  <h1>DCF Studio</h1>
  <p class="lede">{lede}</p>
  <div class="foot"><span class="dom">{DOMAIN}</span><span>Charlie Trenorden</span></div>
</body></html>"""


def main():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright is not installed: pip install playwright && "
              "playwright install chromium", file=sys.stderr)
        return 1

    t = tokens()
    lede = description()
    SCRATCH.write_text(page_html(t, lede), encoding="utf-8")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": WIDTH, "height": HEIGHT},
                                    device_scale_factor=1)
            page.goto(SCRATCH.as_uri())
            # ASK FOR THE FACES, do not just wait on the status: document.fonts
            # .status reads "loaded" while a face nothing has demanded yet has
            # not been fetched, so waiting on it alone passes instantly.
            page.evaluate("""() => Promise.all([
                document.fonts.load('500 16px Geist'),
                document.fonts.load('400 16px Geist'),
                document.fonts.load('400 16px "Geist Mono"'),
            ])""")
            page.wait_for_function("() => document.fonts.status === 'loaded'", timeout=15000)
            if not page.evaluate("() => document.fonts.check('500 16px Geist')"):
                raise SystemExit("Geist did not load; refusing to write a card "
                                 "in the fallback face")
            page.screenshot(path=str(OUT))
            browser.close()
    finally:
        SCRATCH.unlink(missing_ok=True)

    size = OUT.stat().st_size
    print(f"wrote {OUT}")
    print(f"  {WIDTH}x{HEIGHT}, {size:,} bytes ({size / 1024:.1f} KiB)")
    print(f"  palette from {CSS.name}: bg {t['bg']}, accent {t['accent']}")
    print(f"  lede from {LAYOUT.name}: {lede[:64]}...")
    return 0


if __name__ == "__main__":
    sys.exit(main())
