# 07-delivery

See `docs/README.md` for what belongs in this folder.

| File | What it is |
|---|---|
| `design-overview-infographic.html` | Source of the submission infographic — 3 A4 landscape pages |
| `design-overview.pdf` | 3-page PDF, for Google Classroom |
| `design-overview.png` | The same three pages as one tall image (2246 × 4900) |

The infographic is a summary. It is not a replacement for the documents in `01-requirements`, `02-design` and `04-testing` — it points at them, and the assessment expects the full set to exist behind it.

## Regenerating after editing the HTML

Run these one at a time. Each uses its own Edge profile, because a second Edge started against the default profile silently attaches to the first one and writes nothing.

```bash
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --user-data-dir="C:\Users\ASUS EXPERTBOOK\AppData\Local\Temp\edge-pdf" --no-first-run --no-pdf-header-footer --print-to-pdf="E:\WebWork\dtbimarket\docs\07-delivery\design-overview.pdf" "file:///E:/WebWork/dtbimarket/docs/07-delivery/design-overview-infographic.html"
```

```bash
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --user-data-dir="C:\Users\ASUS EXPERTBOOK\AppData\Local\Temp\edge-png" --no-first-run --hide-scrollbars --force-device-scale-factor=2 --window-size=1123,2450 --screenshot="E:\WebWork\dtbimarket\docs\07-delivery\design-overview.png" "file:///E:/WebWork/dtbimarket/docs/07-delivery/design-overview-infographic.html"
```

If a page grows past its A4 box the extra content is clipped silently rather than flowing onto the next page, so open the HTML in a browser after editing and confirm nothing is cut off at the bottom of each of the three pages.

The wireframe on page 3 is referenced as `../../screenshot/PR-01-wireframe-seller-dashboard.png`. Keep the relative path intact or the image will be missing from the export with no error.
