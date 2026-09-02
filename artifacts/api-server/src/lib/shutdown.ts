export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

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
    logger.info({ signal }, "Graceful shutdown started");

    const forceExit = setTimeout(() => {
      logger.error("Graceful shutdown timed out");
      exit(1);
    }, timeoutMs);
    forceExit.unref();

    const [serverError] = await Promise.all([closeServer(), stopWorker()]);
    await closePool();
    clearTimeout(forceExit);
    exit(serverError ? 1 : 0);
  };
}