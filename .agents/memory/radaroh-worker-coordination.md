---
name: RadarOH worker coordination
description: Durable coordination and recovery constraints for recurring RadarOH jobs.
---

Recurring monitoring and AI work must combine a database lease with a per-job PostgreSQL advisory lock held for the full external operation. Recovery may requeue stale state only after acquiring the same job lock.

**Why:** A lease alone is not fencing: an old process can finish an external call after losing leadership. The job lock prevents a replacement from duplicating that work, while persisted job state supports restart recovery.

**How to apply:** Run stale recovery on every leader tick, drain active work before voluntarily releasing leadership, and keep a hard process shutdown deadline. Do not add independent in-memory schedulers.