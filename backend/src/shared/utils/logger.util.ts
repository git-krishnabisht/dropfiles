import { createLogger, format, transports } from "winston";
import * as fs from "fs";
import * as path from "path";
import Transport from "winston-transport";

const logsDir = path.resolve(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const MAX_LOG_SIZE = 10 * 1024 * 1024;
const MAX_LOG_FILES = 5;

class JsonArrayTransport extends Transport {
  private filename: string;
  private logCache: any[] = [];
  private writeTimeout?: NodeJS.Timeout;
  private isWriting: boolean = false;
  private maxCacheSize: number = 100;
  private flushInterval: number = 5000;

  constructor(opts: any) {
    super(opts);
    const filename = opts.filename.startsWith("./logs/")
      ? path.resolve(process.cwd(), opts.filename)
      : path.resolve(logsDir, path.basename(opts.filename));

    this.filename = filename;
    this.maxCacheSize = opts.maxCacheSize || 100;
    this.flushInterval = opts.flushInterval || 5000;

    const logDir = path.dirname(this.filename);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    if (!fs.existsSync(this.filename)) {
      fs.writeFileSync(this.filename, "[]", "utf-8");
    }

    setInterval(() => this.flush(), this.flushInterval);
  }

  log(info: any, callback: () => void) {
    setImmediate(() => {
      const logEntry = {
        timestamp: info.timestamp,
        level: info.level,
        message: info.message,
        ...info.metadata,
      };

      this.logCache.push(logEntry);

      if (this.logCache.length >= this.maxCacheSize) {
        this.flush();
      }

      callback();
    });
  }

  private async flush() {
    if (this.isWriting || this.logCache.length === 0) {
      return;
    }

    this.isWriting = true;

    try {
      await this.rotateIfNeeded();

      const logsToWrite = [...this.logCache];
      this.logCache = [];

      let existingLogs: any[] = [];
      try {
        const content = fs.readFileSync(this.filename, "utf-8");
        if (content.trim()) {
          existingLogs = JSON.parse(content);
        }
      } catch (err) {
        existingLogs = [];
      }

      const allLogs = [...existingLogs, ...logsToWrite];

      const tempFile = `${this.filename}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(allLogs, null, 2), "utf-8");
      fs.renameSync(tempFile, this.filename);
    } catch (err) {
      console.error(`Failed to flush logs to ${this.filename}:`, err);
      this.logCache.unshift(...this.logCache);
    } finally {
      this.isWriting = false;
    }
  }

  private async rotateIfNeeded() {
    try {
      const stats = fs.statSync(this.filename);

      if (stats.size > MAX_LOG_SIZE) {
        for (let i = MAX_LOG_FILES - 1; i > 0; i--) {
          const oldFile = `${this.filename}.${i}`;
          const newFile = `${this.filename}.${i + 1}`;

          if (fs.existsSync(oldFile)) {
            if (i === MAX_LOG_FILES - 1) {
              fs.unlinkSync(oldFile);
            } else {
              fs.renameSync(oldFile, newFile);
            }
          }
        }

        fs.renameSync(this.filename, `${this.filename}.1`);
        fs.writeFileSync(this.filename, "[]", "utf-8");
      }
    } catch (err) {
      if ((err as any).code !== "ENOENT") {
        console.error(`Failed to rotate log ${this.filename}:`, err);
      }
    }
  }

  close() {
    if (this.writeTimeout) {
      clearTimeout(this.writeTimeout);
    }
    this.flush();
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
  level: process.env.LOG_LEVEL || "info",
  defaultMeta: {
    service: "dropfiles-backend",
    environment: process.env.NODE_ENV || "development",
  },
  transports: [
    new transports.Console({
      format: consoleFormat,
      level: "debug",
    }),
    new JsonArrayTransport({
      filename: "./logs/error.log.json",
      level: "error",
      format: structuredFormat,
      maxCacheSize: 50,
      flushInterval: 3000,
    }),
    new JsonArrayTransport({
      filename: "./logs/warn.log.json",
      level: "warn",
      format: structuredFormat,
      maxCacheSize: 50,
      flushInterval: 3000,
    }),
    new JsonArrayTransport({
      filename: "./logs/info.log.json",
      level: "info",
      format: structuredFormat,
      maxCacheSize: 100,
      flushInterval: 5000,
    }),
    new JsonArrayTransport({
      filename: "./logs/combined.log.json",
      format: structuredFormat,
      maxCacheSize: 100,
      flushInterval: 5000,
    }),
  ],
  exceptionHandlers: [
    new JsonArrayTransport({
      filename: "./logs/exceptions.log.json",
      format: structuredFormat,
      maxCacheSize: 10,
      flushInterval: 1000,
    }),
  ],
  rejectionHandlers: [
    new JsonArrayTransport({
      filename: "./logs/rejections.log.json",
      format: structuredFormat,
      maxCacheSize: 10,
      flushInterval: 1000,
    }),
  ],
});

process.on("SIGTERM", () => {
  logger.transports.forEach((transport) => {
    if (transport instanceof JsonArrayTransport) {
      transport.close();
    }
  });
});

process.on("SIGINT", () => {
  logger.transports.forEach((transport) => {
    if (transport instanceof JsonArrayTransport) {
      transport.close();
    }
  });
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
