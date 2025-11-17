import { Router } from "express";
import { authController } from "./auth.controller";

const router = Router();

router.post("/signup", authController.sign_up);
router.post("/signin", authController.sign_in);
router.get("/signout", authController.sign_out);
router.get("/refresh", authController.refresh_token);

export { router as auth_router };


// eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImpvaG5kb2VAZ21haWwuY29tIiwiaWF0IjoxNzYzMzA4MDg3LCJleHAiOjE3NjMzOTQ0ODd9.TwuoN-KhZ5gC9pQBojVtxtC4Q0iPou__aXqIfda0U2VZXFDc8rUEoDQlN0x2xGaN_m1TkWHbLm5vSc6JRMoLCHDF4Lx0gb_c6b-bKbFDqEL8WxVdJuFl_tpLLx2y1K-ITikdz1tvQubXENT4UkVpgdHejkR65ISOzmIqcqlmIDXt7bGSQL0J58uaDAN4K331HH5cMKWz0PtE_-AOwfNWxjD-QMVXUSLClJiblj_Ox-RFsYMZAtuEuTrDcrhKAcv5sGXt5-ovH-lJEzkxFQnM1ZBncfi4eCIff9ooC43Qpk1Vxdu1mwVMuMvyJ970n_kRnJLoIUf2YoDEZxV6fgy2VA$A

// 5cc30c4bbe0eacc41d46845a4909ce49005dbf2d1f2bbd57235cb2e35c3ec4644327acc56f616d8957b01241052d4ed0e2591fdeb93ed452530b5036ece494c8

// 77376690-944a-45a8-bdc7-313363e66464
