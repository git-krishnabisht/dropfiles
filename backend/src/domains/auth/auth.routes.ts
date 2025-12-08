import { Router } from "express";
import { authController } from "./auth.controller.js";
import { protected_route } from "../../shared/middleware/auth.middleware.js";

const router = Router();

router.post("/signup", authController.sign_up);
router.post("/signin", authController.sign_in);
router.get("/signout", authController.sign_out);
router.get("/refresh", authController.refresh_token);
router.get("/authenticate", protected_route, authController.authenticate);

export { router as auth_router };
