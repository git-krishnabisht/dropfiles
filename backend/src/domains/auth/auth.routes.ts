import { Router } from "express";
import { authController } from "./auth.controller";

const router = Router();

router.post("/signup", authController.sign_up);
router.post("/signin", authController.sign_in);
router.get("/signout", authController.sign_out);
router.post("/refresh", authController.refresh_token);

export { router as auth_router };
