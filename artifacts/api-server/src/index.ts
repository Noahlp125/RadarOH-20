import app from "./app";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger";
import { initializeRadarDatabaseSecurity } from "./lib/radar/database-security";
import { startRadarWorker, stopRadarWorker } from "./lib/radar/worker";

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
  startRadarWorker();
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Graceful shutdown started");

  const forceExit = setTimeout(() => {
    logger.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  const serverClosed = new Promise<Error | null>((resolve) => {
    server.close((error) => {
      if (error) logger.error({ err: error }, "HTTP server close failed");
      resolve(error ?? null);
    });
  });
  const [serverError] = await Promise.all([serverClosed, stopRadarWorker()]);
  await pool.end();
  clearTimeout(forceExit);
  process.exit(serverError ? 1 : 0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
