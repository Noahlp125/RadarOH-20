---
name: RadarOH operational boundaries
description: Enterprise scaling, worker availability, and managed recovery boundaries.
---

RadarOH API replicas may scale horizontally because recurring work is coordinated through PostgreSQL, but scheduled monitoring and AI processing remain single-active per workspace by design.

**Why:** Database leases and advisory locks prevent duplicate external work across replicas. This provides failover, not parallel worker throughput. Replit deployment scaling, database backups, retention, and point-in-time recovery are managed-service settings rather than guarantees the application can create itself.

**How to apply:** Keep API request handling stateless, preserve lease and fencing semantics, and scale worker throughput only after measured queue pressure justifies a deliberate queue-partitioning design. Verify backup, restore, alerting, and deployment settings operationally before claiming HA or DR objectives are met.