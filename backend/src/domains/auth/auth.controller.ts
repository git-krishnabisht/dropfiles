import { Request, Response } from "express";
import prisma from "../../shared/config/prisma.config";
import logger from "../../shared/utils/logger.util";
import { sts } from "../../types/common.types";
import { jwtService } from "../../shared/services/jwt.service";
import { CryptUtils } from "../../shared/utils/crypt.util";
import { ValidationUtil } from "../../shared/utils/validate.util";
import { PrismaUtil } from "../../shared/utils/prisma.util";
import crypto, { randomUUID } from "crypto";

// TTLs in ms
const RT_TTL = 15 * 24 * 60 * 60 * 1000; // 15 days
const AT_TTL = 1 * 24 * 60 * 60 * 1000; // 1 day (dev)
const DEVICE_ID_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

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
        return res.status(409).json({ error: "User already exists in the DB" }); // 409 - conflit
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
      const { user } = req.body;

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
          `User ${user.email} doesn't exists in the DB, You need to sign in first`
        );
        return res.status(404).json({
          error: `User ${user.email} doesn't exists in the DB, You need to sign in first`,
        });
      }

      const valid_hash = CryptUtils.compareHash(user.password, password_hash);
      if (!valid_hash) {
        logger.info(`Invalid Password`);
        return res.status(401).json({
          error: `Invalid Password`,
        });
      }

      let device_id = req.cookies.device_id;
      if (!device_id) {
        device_id = randomUUID();
      }

      const user_id = await PrismaUtil.getUserId(user.email);

      if (!user_id) {
        return res.status(400).json({
          error: "Missing UserId",
        });
      }

      const session = await PrismaUtil.getSessionByDevice(device_id);
      if (session && session.userId === user_id) {
        await PrismaUtil.deleteSession(device_id);
      }

      const refresh_token = crypto.randomBytes(64).toString("hex");
      const refresh_token_hash = await CryptUtils.generateHash(refresh_token);
      const exp = new Date(Date.now() + RT_TTL);
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
        AT_TTL / 1000
      );

      logger.info(`User ${user.email} has Signed In Successfully`);

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

      res.cookie("device_id", device_id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: DEVICE_ID_TTL,
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

      if (!refresh_token || !device_id)
        return res
          .status(401)
          .json({ error: "Refresh Token or Device ID is Invalid" });

      const session = await prisma.session.findUnique({
        where: { deviceId: device_id },
        select: { user: true, refreshTokenHash: true },
      });
      if (!session)
        return res
          .status(401)
          .json({ error: "No Session available with this Device ID" });

      const valid_rt = await CryptUtils.compareHash(
        refresh_token,
        session.refreshTokenHash
      );
      if (!valid_rt) {
        await prisma.session.delete({ where: { deviceId: device_id } });
        return res.status(401).json({ error: "Invalid Refresh Token" });
      }

      const user = session.user;

      const new_access_token = await jwtService.assign(
        {
          userId: user.id,
          email: user.email,
        },
        AT_TTL / 1000
      );
      const new_refresh_token = crypto.randomBytes(64).toString("hex");
      const new_refresh_token_hash = await CryptUtils.generateHash(
        new_refresh_token
      );
      const exp = new Date(Date.now() + RT_TTL);

      await prisma.session.update({
        where: { deviceId: device_id },
        data: { refreshTokenHash: new_refresh_token_hash, expiresAt: exp },
      });

      res.cookie("access_token", new_access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: AT_TTL,
      });

      res.cookie("refresh_token", new_refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: RT_TTL,
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
      if (!device_id) {
        res.clearCookie("access_token");
        res.clearCookie("refresh_token");
        res.clearCookie("device_id");

        return res.status(200).json({
          status: "Signed Out",
        });
      }

      await PrismaUtil.deleteSession(device_id);
      res.clearCookie("access_token");
      res.clearCookie("refresh_token");
      res.clearCookie("device_id");

      return res.status(200).json({ status: "Signed out" });
    } catch (err) {
      logger.error("Error Signin Out", { err });
      return res.status(500).json({ success: false, error: "Internal error" });
    }
  }
}
