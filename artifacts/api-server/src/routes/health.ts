import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import { isReady, renderMetrics, setReadiness } from "../lib/observability";

const router: IRouter = Router();

export async function readinessStatus(check: () => Promise<unknown>) {
  try {
    await check();
    return 200;
  } catch {
    return 503;
  }
}

router.get("/", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/readyz", async (_req, res) => {
  if (!isReady()) {
    res.status(503).json({ status: "unavailable" });
    return;
  }
  const status = await readinessStatus(() => pool.query("select 1"));
  setReadiness(status === 200);
  res.status(status).json(status === 200 ? { status: "ok" } : { status: "unavailable" });
});

router.get("/metrics", (_req, res) => {
  res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8").send(renderMetrics());
});

export default router;
