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

    const decoded = await jwtService.verify(token);

    const jwt_validate = ValidationUtil.validateJWTPayload(decoded);

    if (jwt_validate.length > 0)
      throw new Error(`Missinig data in the access token ${jwt_validate}`);

    const userExists = await PrismaUtil.userExists(decoded.email);

    if (!userExists) return next("Unauthorized: User doesn't exist in DB");

    req.jwtPayload = decoded;

    next();
  } catch (err) {
    return next(`Unauthorized: ${err}`);
  }
};
