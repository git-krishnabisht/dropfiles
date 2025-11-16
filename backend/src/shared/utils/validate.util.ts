import { jwtPayload, User } from "../../types/common.types";
import logger from "../../shared/utils/logger.util";
import { sts } from "../../types/common.types";

export class ValidationUtil {
  static validateAuthBody(user: User, mode: sts) {
    logger.info("Validating SignUp body", {
      user: user,
      valid_req: true ? user : false,
    });
    const missing: string[] = [];

    if (!user.email || user.email.trim() === "") {
      missing.push("email");
    }

    if (mode === sts.SIGNUP) {
      if (!user.name || user.name.trim() === "") {
        missing.push("name");
      }
    }

    if (!user.password || user.password.trim() === "") {
      missing.push("password");
    }

    return missing.join(", ");
  }

  static validateJWTPayload(payload: jwtPayload) {
    logger.info("Validating JWT payload", {
      payload: payload,
    });

    const missing: string[] = [];

    if (!payload.email || payload.email.trim() === "") {
      missing.push("email");
    }

    return missing.join(", ");
  }
}
