---
title: "UV Atlas Guide"
description: "UV Atlas Guide"
---

# UV Atlas Guide

Internal UV atlas runs automatically on cube add and geometry-changing cube updates (`from`/`to`/`inflate`) when textures exist.

Key points:
- UV rects must not overlap.
- The atlas assigns one rect per face (no sharing).
- When packing overflows, resolution doubles and packing retries.
- If the atlas still overflows, Ashfox lowers `uvPixelsPerBlock` automatically to fit.
- Rect sizes are computed from the starting resolution; increasing size adds space instead of scaling UVs.

After apply:
- Preflight is internal-only.
- Existing texture pixels are reprojected to follow the new UVs.
- Repaint only when you want to change style/details after remap.

