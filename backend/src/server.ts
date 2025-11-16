import http from "http";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import logger from "./shared/utils/logger.util.js";
import { auth_router } from "./domains/auth/auth.routes.js";
import { file_router } from "./domains/files/files.routs.js";
import { pollS3Events } from "./workers/sqs-polling.worker.js";
import cookieParser from "cookie-parser";

import "./shared/config/env.config.js";
// import multer from "multer";
import { configureBucketCORS } from "./shared/services/s3.service.js";
import { protected_route } from "./shared/middleware/auth.middleware.js";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    origin: ["http://localhost:5173", "http://localhost:4173"],
  })
);
app.set("trust proxy", true);
configureBucketCORS();
const server = http.createServer(app);
const PORT = 50136;
// const storage = multer.memoryStorage();

app.use((req: Request, _: Response, next) => {
  logger.info("Incoming request", {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  });
  next();
});

app.use("/api/auth", auth_router);
app.use("/api/files", file_router);
app.get("/api/health", protected_route, (req: Request, res: Response) => {
  logger.info("Health check requested");
  res.send({ server: "running", timestamp: new Date().toISOString() });
});

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error("Unhandled error", {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
  });
  res.status(500).json({ error: "Internal server error" });
});

server.listen(PORT, () => {
  logger.info("Server started successfully", {
    port: PORT,
    environment: process.env.NODE_ENV || "development",
  });

  pollS3Events().catch((error) => {
    logger.error("SQS polling failed to start", { error: error.message });
  });
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});
