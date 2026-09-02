import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";
import { createShutdownHandler } from "../src/lib/shutdown";

function waitForExit(
  register: (resolve: (code: number) => void) => void,
  timeoutMs: number,
) {
  return new Promise<number>((resolve, reject) => {
    const deadline = setTimeout(
      () => reject(new Error("The forced shutdown deadline did not fire")),
      timeoutMs,
    );
    register((code) => {
      clearTimeout(deadline);
      resolve(code);
    });
  });
}

describe("API shutdown", () => {
  it("forces exit within the deadline when SIGTERM finds a stuck worker job", async () => {
    const signals = new EventEmitter();
    const startedAt = Date.now();
    let resolveExit: ((code: number) => void) | undefined;
    const exitCode = waitForExit((resolve) => {
      resolveExit = resolve;
    }, 500);
    const shutdown = createShutdownHandler({
      closeServer: async () => null,
      stopWorker: () => new Promise<void>(() => undefined),
      closePool: async () => undefined,
      exit: (code) => resolveExit?.(code),
      logger: {
        info: () => undefined,
        error: () => undefined,
      },
      timeoutMs: 25,
    });
    signals.once("SIGTERM", () => void shutdown("SIGTERM"));

    signals.emit("SIGTERM");

    assert.equal(await exitCode, 1);
    assert.ok(Date.now() - startedAt < 500);
  });
});