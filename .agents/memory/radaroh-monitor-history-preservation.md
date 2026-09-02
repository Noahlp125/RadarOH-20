---
name: RadarOH monitor history preservation
description: Why full-state snapshots must not implicitly delete monitored entities.
---

Full-state snapshot saves must remain non-destructive for sources and competitors. Deletion of either entity requires an explicit CRUD action.

**Why:** Monitoring runs, evidence, and change events are durable audit history. Treating absence from a possibly stale snapshot as deletion can cascade-delete that history.

**How to apply:** When changing RadarOH sync or import behavior, use upserts for monitored entities and keep destructive removal behind an explicit user action.