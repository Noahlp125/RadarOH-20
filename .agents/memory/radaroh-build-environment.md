---
name: RadarOH build environment
description: Environment-specific build requirements for the RadarOH web artifact.
---

The managed web workflow injects both `PORT` and `BASE_PATH`. A direct Vite production build must provide both values explicitly; setting only `PORT` fails before Vite loads the config.

**Why:** The artifact config intentionally fails fast when routing metadata is absent, while the workflow supplies that metadata automatically.

**How to apply:** Prefer restarting the managed web workflow for preview verification; when running a standalone production build, set `PORT` and the artifact's configured base path.