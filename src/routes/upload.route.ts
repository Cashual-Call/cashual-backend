import { Router, RequestHandler } from "express";
import { UploadController } from "../controller/upload.controller";
import { validateResponse } from "../middleware/validate.middleware";

const router = Router();

const uploadController = new UploadController();

router.get("/presigned-url", uploadController.getPresignedUrl as RequestHandler);

export default router;