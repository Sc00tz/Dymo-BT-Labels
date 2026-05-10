# DYMO BT Labels

A web-based label designer for DYMO Bluetooth label printers. Design labels visually in the browser and print wirelessly — no DYMO software required.

## Features

- **Canvas editor** — text, shapes (rect, circle, ellipse, line, triangle, arrow), freehand draw
- **23 Google Fonts** — grouped by style (sans-serif, condensed, display, script, monospace) with live font preview in the picker
- **QR codes & barcodes** — generated client-side (CODE128)
- **Image upload** — converted and Floyd-Steinberg dithered to 1-bit for thermal printing
- **Material Icons** — full ~1100 icon library loaded from Google, searchable
- **Live preview** — shows dithered output at actual print dimensions with stretch factor applied
- **Auto-expanding canvas** — width grows and shrinks automatically as content changes
- **Save / load designs** — persisted as JSON on the server
- **Export** — PNG, SVG, or JSON

## Requirements

- Docker & Docker Compose
- Linux host with BlueZ for Bluetooth printing (see [Docker notes](#docker-notes))
- A DYMO Bluetooth label printer (tested with the LabelManager LT-200B)

## Setup

```bash
git clone https://github.com/Sc00tz/Dymo-BT-Labels.git
cd Dymo-BT-Labels
docker compose up -d
```

Open [http://localhost:8235](http://localhost:8235).

## Usage

1. Click **Scan** to discover nearby DYMO printers and select one.
2. Set the **canvas width** to match your label stock (in pixels — 200px ≈ a standard address label). The canvas auto-expands as you add content.
3. Add text, shapes, icons, QR codes, or upload an image.
4. Adjust the **stretch factor** (1–4×) to fill the label vertically — this compensates for the printer's horizontal/vertical dot-pitch ratio.
5. Check the live **preview** at the bottom to see the dithered output at actual print size.
6. Click **Print**.

## Label dimensions

The printable height is fixed at **30 pixels** (the physical height of the label). Width is variable and auto-adjusts to fit content. The stretch factor scales the image horizontally before sending it to the printer.

## Tech stack

| Layer | Technology |
|---|---|
| Backend | FastAPI + Uvicorn |
| Bluetooth | `dymo-bluetooth` + BlueZ |
| Image processing | Pillow (Floyd-Steinberg dithering) |
| Frontend | Fabric.js 5.x |
| Fonts | Google Fonts (23 families) |
| Barcodes | JsBarcode (client-side) |
| QR codes | qrcode-generator (client-side) |
| Icons | Material Icons (~1100, loaded from Google) |
| Container | Docker (privileged, host network on Linux) |

## Docker notes

### Linux (recommended for printing)

The compose file uses `network_mode: host` and `privileged: true` — both required for Bluetooth to work inside Docker on Linux. Uncomment `network_mode: host` in `docker-compose.yml` and comment out the `ports` mapping:

```yaml
network_mode: host   # required for BLE on Linux
# ports:
#   - "8235:8235"
```

Then access via [http://localhost:8235](http://localhost:8235).

### macOS / Windows (Docker Desktop)

`network_mode: host` doesn't work on Docker Desktop — use the default bridge networking with the `ports` mapping (the default in this repo). The UI works fully for designing labels, but Bluetooth printer scanning and printing require a Linux host.

Design saves are stored in a named Docker volume (`saves_data`) and persist across container restarts.

## Why not the official DYMO SDK?

The official DYMO Connect SDK requires DYMO Connect desktop software and targets USB/network printers. It has no Bluetooth support. The `dymo-bluetooth` package used here directly implements the BLE/GATT protocol for the LT-200B, with no desktop app dependency.

## Development

Run without Docker:

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8235
```
