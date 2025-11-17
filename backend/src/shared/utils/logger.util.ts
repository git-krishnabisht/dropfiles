import { createLogger, format, transports } from "winston";
import * as fs from "fs";
import * as path from "path";
import Transport from "winston-transport";

const logsDir = path.resolve(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

class JsonArrayTransport extends Transport {
  private filename: string;
  private logCache: Map<string, any[]> = new Map();
  private writeTimeout: Map<string, NodeJS.Timeout> = new Map();

  constructor(opts: any) {
    super(opts);
    const filename = opts.filename.startsWith("./logs/")
      ? path.resolve(process.cwd(), opts.filename)
      : path.resolve(logsDir, path.basename(opts.filename));

    this.filename = filename;

    const logDir = path.dirname(this.filename);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  log(info: any, callback: () => void) {
    setImmediate(() => {
      if ((this as any).level && info.level !== (this as any).level) {
        callback();
        return;
      }

      const logEntry = {
        timestamp: info.timestamp,
        level: info.level,
        message: info.message,
        ...info.metadata,
      };

      const absolutePath = this.filename;

      if (!this.logCache.has(absolutePath)) {
        let logs: any[] = [];

        if (fs.existsSync(absolutePath)) {
          try {
            const content = fs.readFileSync(absolutePath, "utf-8");
            if (content.trim()) {
              logs = JSON.parse(content);
            }
          } catch (err) {
            logs = [];
          }
        }

        this.logCache.set(absolutePath, logs);
      }

      const logs = this.logCache.get(absolutePath)!;
      logs.push(logEntry);

      if (this.writeTimeout.has(absolutePath)) {
        clearTimeout(this.writeTimeout.get(absolutePath)!);
      }

      const timeout = setTimeout(() => {
        try {
          fs.writeFileSync(
            absolutePath,
            JSON.stringify(logs, null, 2),
            "utf-8"
          );
        } catch (err) {
          console.error(`Failed to write logs to ${absolutePath}:`, err);
        }
        this.writeTimeout.delete(absolutePath);
      }, 100);

      this.writeTimeout.set(absolutePath, timeout);

      callback();
    });
  }
}

const structuredFormat = format.combine(
  format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  format.errors({ stack: true }),
  format.metadata({ fillExcept: ["timestamp", "level", "message"] })
);

const consoleFormat = format.combine(
  format.colorize(),
  format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  format.printf(({ timestamp, level, message, metadata }) => {
    const metaStr =
      metadata && Object.keys(metadata).length
        ? `\n${JSON.stringify(metadata, null, 2)}`
        : "";
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

const logger = createLogger({
  level: process.env.LOG_LEVEL || "debug",
  defaultMeta: {
    service: "dropfiles-backend",
    environment: process.env.NODE_ENV || "development",
  },
  transports: [
    new transports.Console({
      format: consoleFormat,
    }),
    new JsonArrayTransport({
      filename: "./logs/error.log.json",
      level: "error",
      format: structuredFormat,
    }),
    new JsonArrayTransport({
      filename: "./logs/debug.log.json",
      level: "debug",
      format: structuredFormat,
    }),
    new JsonArrayTransport({
      filename: "./logs/info.log.json",
      level: "info",
      format: structuredFormat,
    }),
    new JsonArrayTransport({
      filename: "./logs/combined.log.json",
      format: structuredFormat,
    }),
  ],
  exceptionHandlers: [
    new JsonArrayTransport({
      filename: "./logs/exceptions.log.json",
      format: structuredFormat,
    }),
  ],
  rejectionHandlers: [
    new JsonArrayTransport({
      filename: "./logs/rejections.log.json",
      format: structuredFormat,
    }),
  ],
});

export const logRequest = (req: any) => {
  logger.info("Incoming request", {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });
};

export const logError = (error: Error, context?: Record<string, any>) => {
  logger.error(error.message, {
    error: error.name,
    stack: error.stack,
    ...context,
  });
};

export const logPrismaError = (error: any, operation?: string) => {
  logger.error("Prisma Error", {
    operation,
    code: error.code,
    message: error.message,
    meta: error.meta,
    clientVersion: error.clientVersion,
  });
};

export default logger;
