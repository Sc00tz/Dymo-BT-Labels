"""FastAPI backend for DYMO label web editor."""

from __future__ import annotations

import base64
import json
import os
from io import BytesIO
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from PIL import Image

from .printer import scan_printers, print_label, LABEL_HEIGHT

SAVES_DIR = Path(__file__).parent / "saves"
SAVES_DIR.mkdir(exist_ok=True)

app = FastAPI(title="DYMO Label Editor")


# ── Static files ──────────────────────────────────────────────
app.mount("/static", StaticFiles(directory=Path(__file__).parent / "static"), name="static")


@app.get("/")
async def index():
    return FileResponse(Path(__file__).parent / "static" / "index.html")


# ── Printer endpoints ─────────────────────────────────────────
@app.get("/api/printers")
async def get_printers():
    printers = await scan_printers()
    return {"printers": printers}


class PrintRequest(BaseModel):
    printer_address: str
    image_data: str          # base64-encoded PNG
    stretch_factor: int = 2


@app.post("/api/print")
async def do_print(req: PrintRequest):
    try:
        image_bytes = base64.b64decode(req.image_data)
    except Exception:
        raise HTTPException(400, "Invalid base64 image data")
    status = await print_label(req.printer_address, image_bytes, req.stretch_factor)
    return {"status": status}


# ── Image conversion endpoint ─────────────────────────────────
@app.post("/api/convert-image")
async def convert_image(file: UploadFile = File(...)):
    data = await file.read()
    img = Image.open(BytesIO(data))

    # Resize to 30px tall, keep aspect ratio
    ratio = LABEL_HEIGHT / img.height
    new_w = max(1, int(img.width * ratio))
    img = img.resize((new_w, LABEL_HEIGHT), Image.NEAREST)

    # Convert to 1-bit
    img = img.convert("L").point(lambda p: 255 if p > 128 else 0, mode="1")

    buf = BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return {"image": b64, "width": new_w, "height": LABEL_HEIGHT}


# ── Save / Load endpoints ─────────────────────────────────────
@app.get("/api/saves")
async def list_saves():
    files = sorted(
        [f.stem for f in SAVES_DIR.glob("*.json")],
        key=str.lower,
    )
    return {"saves": files}


@app.post("/api/saves/{name}")
async def save_design(name: str, body: dict):
    path = SAVES_DIR / f"{name}.json"
    path.write_text(json.dumps(body, indent=2))
    return {"ok": True}


@app.get("/api/saves/{name}")
async def load_design(name: str):
    path = SAVES_DIR / f"{name}.json"
    if not path.exists():
        raise HTTPException(404, "Design not found")
    return json.loads(path.read_text())


@app.delete("/api/saves/{name}")
async def delete_design(name: str):
    path = SAVES_DIR / f"{name}.json"
    if path.exists():
        path.unlink()
    return {"ok": True}
