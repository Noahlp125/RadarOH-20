import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { recordRadarActivity } from "./lib/radar/dashboard";

const app: Express = express();

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
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/api/radar", (req, res, next) => {
  const shouldAudit = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  if (shouldAudit) {
    res.on("finish", () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        void recordRadarActivity(req.method.toLocaleLowerCase(), "api", req.path, {
          status: res.statusCode,
        }).catch((error) => logger.error({ err: error }, "RadarOH audit write failed"));
      }
    });
  }
  next();
});

app.use("/api", router);

export default app;
