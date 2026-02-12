---
title: "UV Atlas Guide"
description: "How internal UV atlas behavior affects modeling and texturing decisions."
summary: "How internal UV atlas behavior affects modeling and texturing decisions."
---

# UV Atlas Guide

The UV atlas is managed internally and can be triggered automatically when cube geometry changes while textures already exist. This behavior is intended to preserve a usable layout without requiring manual UV intervention from the client.

Atlas logic aims to keep one rect per face with no overlaps. If packing cannot fit in the current resolution, the system retries with larger texture space. When growth alone is still not enough, Ashfox may reduce effective density to keep the model editable and exportable.

For authors, the important point is that remapping can happen as a side effect of structural edits. Existing pixels are reprojected to follow the new layout, so repaint should be treated as a creative refinement step, not as mandatory repair after every geometry update.

In short, use atlas behavior as a safety net, not as a replacement for thoughtful modeling order. Finish major proportion changes first, then spend time on detailed paint work.

