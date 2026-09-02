import app from "./app";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger";
import { startRadarMonitorScheduler, stopRadarMonitorScheduler } from "./lib/radar/monitoring";
import { startRadarAiScheduler, stopRadarAiScheduler } from "./lib/radar/ai";
import { initializeRadarDatabaseSecurity } from "./lib/radar/database-security";

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

await initializeRadarDatabaseSecurity();

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startRadarMonitorScheduler();
  startRadarAiScheduler();
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Graceful shutdown started");
  stopRadarMonitorScheduler();
  stopRadarAiScheduler();

  const forceExit = setTimeout(() => {
    logger.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async (error) => {
    if (error) logger.error({ err: error }, "HTTP server close failed");
    await pool.end();
    clearTimeout(forceExit);
    process.exit(error ? 1 : 0);
  });
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
