import app from "./app";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger";
import { initializeRadarDatabaseSecurity } from "./lib/radar/database-security";
import { startRadarWorker, stopRadarWorker } from "./lib/radar/worker";
import { createShutdownHandler } from "./lib/shutdown";
import { setReadiness } from "./lib/observability";
import { ensureRadarMonitoringSources } from "./lib/radar/repository";
import { getRadarDatabaseProvider } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

const shutdown = createShutdownHandler({
  closeServer: () =>
    new Promise<Error | null>((resolve) => {
      server.close((error) => {
        if (error) logger.error({ err: error }, "HTTP server close failed");
        resolve(error ?? null);
      });
    }),
  stopWorker: stopRadarWorker,
  closePool: () => pool.end(),
  exit: (code) => process.exit(code),
  logger,
});

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

try {
  await initializeRadarDatabaseSecurity();
  if (process.env.RADAR_WRITE_FREEZE === "true") {
    logger.info("RadarOH source bootstrap skipped during write freeze");
  } else {
    const monitoringSources = await ensureRadarMonitoringSources();
    logger.info(monitoringSources, "RadarOH public monitoring sources initialized");
  }
  setReadiness(true);
  if (process.env.RADAR_WORKER_ENABLED === "false") {
    logger.info(
      { databaseProvider: getRadarDatabaseProvider() },
      "RadarOH worker disabled for maintenance",
    );
  } else {
    startRadarWorker();
  }
} catch (error) {
  logger.error({ err: error }, "RadarOH startup initialization failed");
  await shutdown("STARTUP_FAILURE");
}
