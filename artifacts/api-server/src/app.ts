import express, { type ErrorRequestHandler, type Express } from "express";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { recordRadarActivity } from "./lib/radar/dashboard";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
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
      if (res.statusCode >= 200 && res.statusCode < 300) {
        void recordRadarActivity(req.method.toLocaleLowerCase(), "api", req.path, {
          status: res.statusCode,
          actor_user_id: res.locals.radarUserId,
        }).catch((error) => logger.error({ err: error }, "RadarOH audit write failed"));
      }
    });
  }
  next();
});

app.use("/api", router);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  req.log.error({ err: error }, "Unhandled API error");
  if (res.headersSent) return;
  res.status(500).json({ error: "Error interno del servidor" });
};
app.use(errorHandler);

export default app;
