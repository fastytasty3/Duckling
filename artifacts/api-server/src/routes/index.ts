import { Router, type IRouter } from "express";
import healthRouter from "./health";
import operatorsRouter from "./operators";
import shiftsRouter from "./shifts";
import workplacesRouter from "./workplaces";
import productsRouter from "./products";
import operationsRouter from "./operations";
import settingsRouter from "./settings";
import sessionRouter from "./session";
import actionLogRouter from "./action-log";
import reportsRouter from "./reports";
import authRouter from "./auth";
import supervisorRouter from "./supervisor";
import excelExportRouter from "./excel-export";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(supervisorRouter);
router.use(excelExportRouter);
router.use(operatorsRouter);
router.use(shiftsRouter);
router.use(workplacesRouter);
router.use(productsRouter);
router.use(operationsRouter);
router.use(settingsRouter);
router.use(sessionRouter);
router.use(actionLogRouter);
router.use(reportsRouter);

export default router;
