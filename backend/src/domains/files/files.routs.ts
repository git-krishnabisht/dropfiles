import { Router } from "express";
import { fileController } from "./files.controller";
import { protected_route } from "../../shared/middleware/auth.middleware";

const router = Router();

router.use(protected_route);

router.post("/get-upload-urls", fileController.getUploadUrls);
router.post("/complete-upload", fileController.completeUpload);
router.post("/record-chunk", fileController.recordChunkUpload);
router.post("/get-download-url", fileController.getDownloadUrl);

export { router as file_router };
