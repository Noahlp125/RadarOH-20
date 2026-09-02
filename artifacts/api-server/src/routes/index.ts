import { Router, type IRouter } from "express";
import healthRouter from "./health";
import radarRouter from "./radar";
import radarAiRouter from "./radar-ai";
import radarExecutiveRouter from "./radar-executive";
import radarIntegrationsRouter from "./radar-integrations";
import { requireRadarAccess } from "../middlewares/radarAuth";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/radar", requireRadarAccess);
router.use(radarRouter);
router.use(radarAiRouter);
router.use(radarExecutiveRouter);
router.use(radarIntegrationsRouter);

export default router;
