import express, { type ErrorRequestHandler, type Express } from "express";
import { randomUUID } from "node:crypto";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import healthRouter from "./routes/health";
import { logger } from "./lib/logger";
import { recordRadarActivity } from "./lib/radar/dashboard";
import { recordHttpRequest, waitForReadiness } from "./lib/observability";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();
app.set("trust proxy", 1);

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function requestIdFromHeader(value: string | undefined) {
  return value && REQUEST_ID_PATTERN.test(value) ? value : randomUUID();
}

app.use((req, res, next) => {
  const requestId = requestIdFromHeader(req.get("x-request-id"));
  (req as typeof req & { id: string }).id = requestId;
  res.setHeader("X-Request-ID", requestId);
  const startedAt = process.hrtime.bigint();
  res.locals.requestStartedAt = startedAt;
  res.on("finish", () => {
    recordHttpRequest(
      req.method,
      req.originalUrl,
      res.statusCode,
      Number(process.hrtime.bigint() - startedAt) / 1_000_000,
    );
  });
  next();
});

app.use(
  pinoHttp({
    logger,
    genReqId: (req) => (req as typeof req & { id?: string }).id ?? randomUUID(),
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(helmet());
// Operational endpoints must remain available without Clerk/Radar authorization.
app.use("/api", healthRouter);
app.use("/api/radar", async (req, res, next) => {
  await waitForReadiness();
  next();
});
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Demasiadas solicitudes. Inténtalo de nuevo más tarde." },
  }),
);
app.use(
  ["/api/radar/ai/analyze", "/api/radar/monitor/run", "/api/radar/import"],
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Límite temporal alcanzado para esta operación." },
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb", parameterLimit: 200 }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);
app.use("/api/radar", (req, res, next) => {
  const shouldAudit = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  if (shouldAudit) {
    res.on("finish", () => {
      void recordRadarActivity(req.method.toLocaleLowerCase(), "api", req.path, {
        status: res.statusCode,
        outcome: res.statusCode >= 200 && res.statusCode < 300 ? "success" : "rejected",
        actor_user_id: res.locals.radarUserId,
        request_id: (req as typeof req & { id?: string }).id,
        duration_ms: Math.round(Number(process.hrtime.bigint() - res.locals.requestStartedAt) / 1_000_000),
      }).catch((error) => logger.error({ err: error }, "RadarOH audit write failed"));
    });
  }
  next();
});

app.use("/api", router);
app.use("/api", (_req, res) => {
  res.status(404).json({
    error: "Ruta no encontrada",
    request_id: (_req as typeof _req & { id?: string }).id,
  });
});

const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  req.log.error({ err: error }, "Unhandled API error");
  if (res.headersSent) return;
  res.status(500).json({
    error: "Error interno del servidor",
    request_id: (req as typeof req & { id?: string }).id,
  });
};
app.use(errorHandler);

export default app;
