"""Thin wrapper around dymo-bluetooth for scanning and printing."""

from __future__ import annotations
import asyncio
from io import BytesIO
from PIL import Image

LABEL_HEIGHT = 30  # printable pixels


async def scan_printers() -> list:
    """Return list of discovered DYMO printers as {address, name}."""
    try:
        from dymo_bluetooth import discover_printers
        printers = await discover_printers()
        results = []
        for p in printers:
            addr = str(p._impl.address)
            name = p._impl.name or addr
            results.append({"address": addr, "name": name})
        return results
    except Exception as exc:
        print(f"[printer] scan error: {exc}")
        return []

def _image_to_canvas(img: Image.Image):
    """Convert a Pillow Image to a dymo_bluetooth Canvas."""
    from dymo_bluetooth import Canvas

    # Convert to grayscale
    img = img.convert("L")

    # Crop to content (trim whitespace)
    # getbbox() returns the bounding box of non-white pixels
    bbox = img.point(lambda p: 255 if p < 128 else 0).getbbox()
    if bbox:
        img = img.crop(bbox)

    # Scale to exactly 30px tall, filling the full printable height
    ratio = LABEL_HEIGHT / img.height
    new_w = max(1, int(img.width * ratio))
    img = img.resize((new_w, LABEL_HEIGHT), Image.LANCZOS)

    # Floyd-Steinberg dithering to 1-bit (better for photos/gradients)
    img = img.convert("1")

    canvas = Canvas()
    for x in range(img.width):
        for y in range(img.height):
            pixel = img.getpixel((x, y))
            canvas.set_pixel(x, y, pixel == 0)
    return canvas

async def print_label(
    address: str,
    image_bytes: bytes,
    stretch_factor: int = 2,
) -> str:
    """Print a PNG image to the given printer address. Returns status message."""
    from dymo_bluetooth import discover_printers

    img = Image.open(BytesIO(image_bytes))
    canvas = _image_to_canvas(img)
    canvas = canvas.stretch(stretch_factor)

    printers = await discover_printers()
    printer = None
    for p in printers:
        if str(p._impl.address) == address:
            printer = p
            break

    if printer is None:
        return f"Printer {address} not found"

    await printer.connect()
    result = await printer.print(canvas)
    return f"Print result: {result}"
