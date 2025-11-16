import jwt from "jsonwebtoken";
import { jwtPayload } from "../../types/common.types.js";
import { config } from "../config/env.config.js";
import logger from "../utils/logger.util.js";
import { ValidationUtil } from "../utils/validate.util.js";

export class jwtService {
  static async assign(payload: jwtPayload, ttl: number) {
    logger.info("Generating JWT token", {
      email: payload.email,
    });

    const jwt_validate = ValidationUtil.validateJWTPayload(payload);

    if (jwt_validate.length > 0) {
      logger.info("Missing required fields JWT payload", {
        fields: jwt_validate,
      });
      throw new Error(`Missing required fields: ${jwt_validate}`);
    }

    const token = jwt.sign(payload, config.jwt.privateKey, {
      algorithm: "RS256",
      expiresIn: ttl,
    });

    return token;
  }

  static async verify(token: string) {
    logger.info("Verifying JWT token");

    if (!token) {
      throw new Error("Missing token in the arguement");
    }

    const decoded = jwt.verify(token, config.jwt.publicKey, {
      algorithms: ["RS256"],
    });

    logger.info("Decoded JWT access token", { payload: decoded });
    return decoded as jwtPayload;
  }
}
