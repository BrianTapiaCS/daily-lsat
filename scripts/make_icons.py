"""Write simple home-screen icons without an image library."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path: Path, size: int) -> None:
    paper = (243, 239, 230)
    ink = (28, 25, 21)
    rows = bytearray()
    margin = size // 6
    for y in range(size):
        rows.append(0)
        for x in range(size):
            inside = margin <= x < size - margin and margin <= y < size - margin
            band = inside and size * 0.42 <= y < size * 0.48
            color = paper if not inside or band else ink
            if band:
                color = paper
            rows.extend(color)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(rows), 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def main() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    write_png(PUBLIC / "icon-192.png", 192)
    write_png(PUBLIC / "icon-512.png", 512)


if __name__ == "__main__":
    main()
