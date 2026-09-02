export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;
import { setReadiness } from "./observability";

type ShutdownLogger = {
  info(bindings: Record<string, unknown>, message: string): void;
  error(bindingsOrMessage: Record<string, unknown> | string, message?: string): void;
};

type ShutdownDependencies = {
  closeServer(): Promise<Error | null>;
  stopWorker(): Promise<void>;
  closePool(): Promise<void>;
  exit(code: number): void;
  logger: ShutdownLogger;
  timeoutMs?: number;
};

export function createShutdownHandler({
  closeServer,
  stopWorker,
  closePool,
  exit,
  logger,
  timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
}: ShutdownDependencies) {
  let shuttingDown = false;

  return async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    setReadiness(false);
    logger.info({ signal }, "Graceful shutdown started");

    const forceExit = setTimeout(() => {
      logger.error("Graceful shutdown timed out");
      exit(1);
    }, timeoutMs);
    forceExit.unref();

    let failed = false;
    try {
      const results = await Promise.allSettled([closeServer(), stopWorker()]);
      for (const result of results) {
        if (result.status === "rejected" || result.value instanceof Error) {
          failed = true;
          logger.error({ err: result.status === "rejected" ? result.reason : result.value }, "Graceful shutdown component failed");
        }
      }
    } finally {
      try {
        await closePool();
      } catch (error) {
        failed = true;
        logger.error({ err: error }, "Database pool close failed");
      } finally {
        clearTimeout(forceExit);
      }
    }
    exit(failed ? 1 : 0);
  };
}