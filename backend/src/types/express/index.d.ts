import "express-serve-static-core";
import { jwtPayload } from "../common.types.js";

declare module "express-serve-static-core" {
  interface Request {
    jwtPayload?: jwtPayload;
  }
}
