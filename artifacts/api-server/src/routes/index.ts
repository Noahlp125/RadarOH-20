import { Router, type IRouter } from "express";
import healthRouter from "./health";
import radarRouter from "./radar";
import radarAiRouter from "./radar-ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(radarRouter);
router.use(radarAiRouter);

export default router;
