import { Router } from "express";
import { fileController } from "./files.controller.js";
import { protected_route } from "../../shared/middleware/auth.middleware.js";

const router = Router();

router.use(protected_route);

router.post("/get-upload-urls", fileController.getUploadUrls);
router.post("/complete-upload", fileController.completeUpload);
router.post("/record-chunk", fileController.recordChunkUpload);
router.post("/get-download-url", fileController.getDownloadUrl);
router.post("/abort-upload", fileController.abortUpload);
router.get("/list", fileController.listFiles);
router.delete("/delete", fileController.deleteFile);

export { router as file_router };