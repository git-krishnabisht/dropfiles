import { Request, Response, NextFunction } from "express";
import { jwtService } from "../services/jwt.service.js";
import logger from "../utils/logger.util.js";
import { ValidationUtil } from "../utils/validate.util.js";
import { PrismaUtil } from "../utils/prisma.util.js";

export const protected_route = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.cookies.access_token;

    if (!token) {
      logger.error("No access token found in cookies");
      return res.status(401).json({ error: "Access token required" });
    }

    let decoded;
    try {
      decoded = await jwtService.verify(token);
    } catch (jwtError) {
      logger.error("JWT verification failed", {
        error: jwtError instanceof Error ? jwtError.message : "Unknown error",
      });
      return res.status(401).json({
        error: "Invalid or expired token",
      });
    }

    const jwt_validate = ValidationUtil.validateJWTPayload(decoded);

    if (jwt_validate.length > 0) {
      logger.error("Invalid JWT payload structure", {
        missingFields: jwt_validate,
      });
      return res.status(401).json({
        error: `Invalid token payload: missing ${jwt_validate}`,
      });
    }

    const userExists = await PrismaUtil.userExists(decoded.email);

    if (!userExists) {
      logger.warn("Token valid but user not found in DB", {
        email: decoded.email,
      });
      return res.status(401).json({
        error: "User not found",
      });
    }

    req.jwtPayload = decoded;

    next();
  } catch (err) {
    logger.error("Unexpected error in auth middleware", {
      error: err instanceof Error ? err.message : "Unknown error",
      stack: err instanceof Error ? err.stack : undefined,
    });
    return res.status(500).json({
      error: "Authentication error",
    });
  }
};
