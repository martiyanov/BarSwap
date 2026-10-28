#!/usr/bin/env python3
"""Генерирует иконки расширения (icons/iconNN.png) без внешних зависимостей.

Рисуем скруглённый квадрат с градиентом и две белые стрелки ⇄ —
«переключение наборов». Сглаживание — 4-кратный суперсэмплинг.
"""

import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
SIZES = [16, 32, 48, 128]
SS = 4  # суперсэмплинг

TOP = (59, 130, 246)    # #3b82f6
BOTTOM = (29, 78, 216)  # #1d4ed8
WHITE = (255, 255, 255)


def lerp(a, b, t):
    return a + (b - a) * t


def in_rounded_rect(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def in_triangle(x, y, ax, ay, bx, by, cx, cy):
    d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by)
    d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy)
    d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay)
    return not ((d1 < 0 or d2 < 0 or d3 < 0) and (d1 > 0 or d2 > 0 or d3 > 0))


def pixel(nx, ny):
    """Цвет точки в единичных координатах (0..1). Возвращает (r, g, b, a)."""
    if not in_rounded_rect(nx, ny, 0.02, 0.02, 0.98, 0.98, 0.24):
        return (0, 0, 0, 0)

    # стрелка вправо (верхняя)
    if 0.355 <= ny <= 0.445 and 0.18 <= nx <= 0.62:
        return WHITE + (255,)
    if in_triangle(nx, ny, 0.60, 0.30, 0.60, 0.50, 0.80, 0.40):
        return WHITE + (255,)
    # стрелка влево (нижняя)
    if 0.555 <= ny <= 0.645 and 0.38 <= nx <= 0.82:
        return WHITE + (255,)
    if in_triangle(nx, ny, 0.40, 0.50, 0.40, 0.70, 0.20, 0.60):
        return WHITE + (255,)

    bg = tuple(int(round(lerp(TOP[i], BOTTOM[i], ny))) for i in range(3))
    return bg + (255,)


def render(size):
    pixels = []
    for y in range(size):
        row = []
        for x in range(size):
            r = g = b = a = 0.0
            for sy in range(SS):
                for sx in range(SS):
                    nx = (x + (sx + 0.5) / SS) / size
                    ny = (y + (sy + 0.5) / SS) / size
                    pr, pg, pb, pa = pixel(nx, ny)
                    r += pr * pa
                    g += pg * pa
                    b += pb * pa
                    a += pa
            n = SS * SS
            alpha = a / (n * 255)  # доля покрытия 0..1
            if alpha > 0.001:
                row.append((
                    int(round(r / a)),
                    int(round(g / a)),
                    int(round(b / a)),
                    int(round(alpha * 255)),
                ))
            else:
                row.append((0, 0, 0, 0))
        pixels.append(row)
    return pixels


def write_png(path, size, pixels):
    raw = b""
    for row in pixels:
        raw += b"\x00" + b"".join(struct.pack("4B", *px) for px in row)

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", ihdr)
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in SIZES:
        path = os.path.join(OUT_DIR, f"icon{size}.png")
        write_png(path, size, render(size))
        print(f"OK {path}")


if __name__ == "__main__":
    main()
