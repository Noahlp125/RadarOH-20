import { Router, type IRouter } from "express";
import healthRouter from "./health";
import radarRouter from "./radar";
import radarAiRouter from "./radar-ai";
import radarExecutiveRouter from "./radar-executive";

const router: IRouter = Router();

router.use(healthRouter);
router.use(radarRouter);
router.use(radarAiRouter);
router.use(radarExecutiveRouter);

export default router;
