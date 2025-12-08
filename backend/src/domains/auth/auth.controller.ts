import { Request, Response } from "express";
import prisma from "../../shared/config/prisma.config.js";
import logger from "../../shared/utils/logger.util.js";
import { sts } from "../../types/common.types.js";
import { jwtService } from "../../shared/services/jwt.service.js";
import { CryptUtils } from "../../shared/utils/crypt.util.js";
import { ValidationUtil } from "../../shared/utils/validate.util.js";
import { PrismaUtil } from "../../shared/utils/prisma.util.js";
import crypto, { randomUUID } from "crypto";

// TTLs in ms
const RT_TTL = 15 * 24 * 60 * 60 * 1000; // 15 days
const AT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 day (dev)
const DEVICE_ID_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const ONE_DAY_TTL = 1 * 24 * 60 * 60 * 1000;

export class authController {
  static async sign_up(req: Request, res: Response) {
    try {
      logger.info("Sign up has started", {
        user: req.body.user,
      });

      const { user } = req.body;

      const user_validate = ValidationUtil.validateAuthBody(user, sts.SIGNUP);
      if (user_validate.length > 0) {
        logger.info("Missing required fields in SignUp request", {
          fields: user_validate,
        });
        return res
          .status(400)
          .json({ error: `Missing required fields: ${user_validate}` });
      }

      logger.info("Checking if User exits in the DB", {
        user: req.body.user.email,
      });

      const user_exits = await PrismaUtil.userExists(user.email);
      if (user_exits) {
        logger.info("User already exists in the DB", {
          user: req.body.user,
        });
        return res.status(409).json({ error: "User already exists in the DB" });
      }

      const password_hash = await CryptUtils.generateHash(user.password);
      const created_user = await PrismaUtil.createUser(
        user.email,
        user.name,
        password_hash
      );

      const user_id = await PrismaUtil.getUserId(user.email);

      const access_token = await jwtService.assign(
        {
          userId: user_id!,
          email: user.email,
        },
        AT_TTL / 1000
      );

      if (!access_token) {
        logger.error("Missing access token");
        return res.status(401).json({
          error: "Missing access token",
        });
      }

      logger.info("Created user record in the DB", {
        user: req.body.user.email,
      });

      const refresh_token = crypto.randomBytes(64).toString("hex");
      const refresh_token_hash = await CryptUtils.generateHash(refresh_token);
      const exp = new Date(Date.now() + RT_TTL);
      const device_id = randomUUID();

      await PrismaUtil.createSession(
        created_user.id,
        refresh_token_hash,
        device_id,
        exp
      );

      logger.info("User registered successfully", {
        user: req.body.user.email,
      });

      res.cookie("device_id", device_id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: DEVICE_ID_TTL,
      });

      res.cookie("access_token", access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: AT_TTL,
      });

      res.cookie("refresh_token", refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: RT_TTL,
      });

      return res
        .status(200)
        .json({ status: "User has registered successfully" });
    } catch (err) {
      logger.error("Error while Sign Up", { err });
      return res.status(500).json({ success: false, error: "Internal error" });
    }
  }

  static async sign_in(req: Request, res: Response) {
    try {
      const { user, rememberMe } = req.body;

      const NEW_RT_TTL = rememberMe ? RT_TTL : ONE_DAY_TTL;
      const NEW_AT_TTL = rememberMe ? AT_TTL : ONE_DAY_TTL;
      const NEW_DEVICE_ID_TTL = rememberMe ? DEVICE_ID_TTL : ONE_DAY_TTL;

      const user_validate = ValidationUtil.validateAuthBody(user, sts.SIGNIN);
      if (user_validate.length > 0) {
        logger.info(`Missing required fields: ${user_validate}`);
        return res.status(401).json({
          error: `Missing required fields: ${user_validate}`,
        });
      }

      const password_hash = await PrismaUtil.getPasswordHash(user.email);
      if (!password_hash) {
        logger.info(
          `User ${user.email} doesn't exists in the DB, You need to sign up first`
        );
        return res.status(404).json({
          error: `User ${user.email} doesn't exist in the DB, You need to sign up first`,
        });
      }

      const valid_hash = await CryptUtils.compareHash(
        user.password,
        password_hash
      );
      if (!valid_hash) {
        logger.info(`Invalid Password for user ${user.email}`);
        return res.status(401).json({
          error: `Invalid credentials`,
        });
      }

      let device_id = req.cookies.device_id;
      if (!device_id) {
        device_id = randomUUID();
      }

      const user_id = await PrismaUtil.getUserId(user.email);
      if (!user_id) {
        logger.error("User ID not found after validation");
        return res.status(400).json({
          error: "Missing UserId",
        });
      }

      const existingSession = await PrismaUtil.getSessionByDevice(device_id);
      if (existingSession) {
        logger.info("Deleting existing session for device", { device_id });
        await PrismaUtil.deleteSession(device_id);
      }

      const refresh_token = crypto.randomBytes(64).toString("hex");
      const refresh_token_hash = await CryptUtils.generateHash(refresh_token);
      const exp = new Date(Date.now() + NEW_RT_TTL);

      await PrismaUtil.createSession(
        user_id,
        refresh_token_hash,
        device_id,
        exp
      );

      const access_token = await jwtService.assign(
        {
          userId: user_id,
          email: user.email,
        },
        NEW_AT_TTL / 1000
      );

      logger.info(`User ${user.email} has Signed In Successfully`);

      res.cookie("access_token", access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: NEW_AT_TTL,
      });

      res.cookie("refresh_token", refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: NEW_RT_TTL,
      });

      res.cookie("device_id", device_id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: NEW_DEVICE_ID_TTL,
      });

      return res.status(200).json({
        status: `User ${user.email} has Signed In Successfully`,
      });
    } catch (err) {
      logger.error("Error while Sign In", { err });
      return res.status(500).json({ success: false, error: "Internal error" });
    }
  }

  static async refresh_token(req: Request, res: Response) {
    try {
      const refresh_token = req.cookies.refresh_token;
      const device_id = req.cookies.device_id;

      if (!refresh_token || !device_id) {
        return res
          .status(401)
          .json({ error: "Refresh Token or Device ID not present" });
      }

      const session = await prisma.session.findUnique({
        where: { deviceId: device_id },
        select: { user: true, refreshTokenHash: true, expiresAt: true },
      });

      if (!session) {
        return res
          .status(401)
          .json({ error: "No Session available with this Device ID" });
      }

      if (new Date() > session.expiresAt) {
        await prisma.session.delete({ where: { deviceId: device_id } });
        return res.status(401).json({ error: "Session expired" });
      }

      const valid_rt = await CryptUtils.compareHash(
        refresh_token,
        session.refreshTokenHash
      );

      if (!valid_rt) {
        logger.warn("Invalid refresh token attempt", { device_id });
        await prisma.session.delete({ where: { deviceId: device_id } });
        return res.status(401).json({ error: "Invalid Refresh Token" });
      }

      const user = session.user;

      const new_access_token = await jwtService.assign(
        {
          userId: user.id,
          email: user.email,
        },
        ONE_DAY_TTL / 1000
      );

      const new_refresh_token = crypto.randomBytes(64).toString("hex");
      const new_refresh_token_hash = await CryptUtils.generateHash(
        new_refresh_token
      );
      const exp = new Date(Date.now() + ONE_DAY_TTL);

      await prisma.session.update({
        where: { deviceId: device_id },
        data: { refreshTokenHash: new_refresh_token_hash, expiresAt: exp },
      });

      res.cookie("access_token", new_access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: ONE_DAY_TTL,
      });

      res.cookie("refresh_token", new_refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: ONE_DAY_TTL,
      });

      logger.info("Token refreshed successfully", {
        userId: user.id,
        device_id,
      });

      return res.status(200).json({
        status: "Token refreshed successfully",
      });
    } catch (err) {
      logger.error("Error while Refresh", { err });
      return res.status(500).json({ success: false, error: "Internal error" });
    }
  }

  static async sign_out(req: Request, res: Response) {
    try {
      const device_id = req.cookies.device_id;

      if (device_id) {
        await PrismaUtil.deleteSession(device_id);
        logger.info("Session deleted for device", { device_id });
      }

      res.clearCookie("access_token");
      res.clearCookie("refresh_token");
      res.clearCookie("device_id");

      return res.status(200).json({ status: "Signed out successfully" });
    } catch (err) {
      logger.error("Error Signing Out", { err });
      return res.status(500).json({ success: false, error: "Internal error" });
    }
  }

  static async authenticate(req: Request, res: Response) {
    const access_token = req.cookies.access_token;
    const user_id = req.jwtPayload?.userId;

    if (!access_token) {
      logger.error("access_token not present");
      return res.status(401).json({ error: "access_token not present" });
    }

    if (!user_id) {
      logger.error("user_id not present");
      return res.status(401).json({
        error: "user_id not present, hence unauthenticated and invalid token ",
      });
    }

    const decode = await jwtService.verify(access_token);
    if (!decode) {
      logger.error("user_id not present");
      return res.status(401).json({
        error:
          "user_id not present, hence unauthenticated and/or invalid token ",
      });
    }

    if (decode.userId !== user_id) {
      logger.error("Unauthorized, Invalid token");
      return res.status(401).json({ error: "Unauthorized, Invalid token" });
    }

    return res.status(200).json({ status: "Authorized" });
  }
}
