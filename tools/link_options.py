"""Render the cross-site link affordance on the REAL DCF Studio company page.

    python tools/link_options.py [AMD]

Shoots the LIVE page rather than a dev server: this is a Next.js app whose numbers
come from a server fetch, and a mock-up of the header would not carry the real
eyebrow line, the real company name or the real implied value under it.

DCF Studio is the easy one of the three. It already has a per-company URL, it is a
single-company page rather than a list, and it can receive any ticker - so the only
question here is where the line sits, not whether the target exists.

Throwaway tooling for one decision. Delete it once the shape is settled.
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

TICKER = sys.argv[1] if len(sys.argv) > 1 else "AMD"
URL = f"https://dcf.charlietrenorden.com/{TICKER}"
OUT = Path(__file__).resolve().parent / "link_options.png"

CSS = """
.xl { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
.xl a { color: #7aa2c4; text-decoration: none;
        border-bottom: 1px solid rgba(122,162,196,.35); }
.xl .sep { color: var(--text-dim, #8a8f98); padding: 0 .5em; }
.xl .lead { color: var(--text-dim, #8a8f98); padding-right: .55em; }
.xrow { margin-top: 14px; }
"""

HELPERS = """
const mk = (tag, cls, text, parent) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
};
const run = (host, lead, labels) => {
  const s = mk('span', 'xl', '', host);
  if (lead) mk('span', 'lead', lead, s);
  labels.forEach((label, i) => {
    if (i) mk('span', 'sep', '\\u00b7', s);
    const a = mk('a', '', label, s); a.href = '#';
  });
  return s;
};
const h1 = document.querySelector('h1');
const eyebrow = h1.previousElementSibling;
const TARGETS = ['Shortfall', 'Consensus Drift'];
"""

VARIANTS = [
    ("Today", "no change - the baseline", ""),

    ("i  Under the company name",
     "its own line, below the name and above the valuation",
     """const d = mk('div', 'xrow', '', null);
        h1.parentNode.insertBefore(d, h1.nextSibling);
        run(d, 'Also on', TARGETS);"""),

    ("ii  Appended to the eyebrow",
     "reuses the middot run the page already has above the name",
     """eyebrow.appendChild(document.createTextNode(' \\u00b7 '));
        run(eyebrow, '', TARGETS);"""),

    ("iii  In the top nav",
     "beside Methodology - a site-level link, not a company-level one",
     """const nav = document.querySelector('header a[href*="methodology" i]')
                  || document.querySelector('header a');
        const s = run(nav.parentNode, '', TARGETS);
        s.style.paddingLeft = '18px';"""),
]


def font(size):
    for name in ("seguisb.ttf", "segoeui.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main() -> int:
    shots = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        for title, note, js in VARIANTS:
            pg = b.new_page(viewport={"width": 1100, "height": 1300},
                            device_scale_factor=2, color_scheme="dark")
            pg.goto(URL, wait_until="networkidle", timeout=120000)
            pg.wait_for_selector("h1", state="visible", timeout=60000)
            pg.add_style_tag(content=CSS)
            if js:
                pg.evaluate("() => {" + HELPERS + js + "}")
            shots.append((title, note, pg.screenshot(clip={
                "x": 0, "y": 0, "width": 1100, "height": 470})))
            pg.close()
        b.close()

    tiles = [Image.open(io.BytesIO(s)) for _, _, s in shots]
    w = max(t.width for t in tiles)
    head_h, gap = 74, 26
    sheet = Image.new("RGB", (w + 48, sum(t.height + head_h + gap for t in tiles) + 24),
                      "#0d0f12")
    d = ImageDraw.Draw(sheet)
    y = 12
    for (title, note, _), t in zip(shots, tiles):
        d.text((24, y + 8), title, fill="#e8e6e1", font=font(28))
        d.text((24, y + 44), note, fill="#8b8f97", font=font(20))
        sheet.paste(t, (24, y + head_h))
        y += t.height + head_h + gap
    sheet.save(OUT)
    print(f"{OUT}  {sheet.width}x{sheet.height}  {len(tiles)} variants  ({TICKER})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
