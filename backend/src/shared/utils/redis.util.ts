import Redis from "ioredis";
import { config } from "../config/env.config.js";
import logger from "./logger.util.js";

export const rd = new Redis(config.redis.rdURI);

rd.on("error", (error) => {
  logger.error("Redis connection Error: ", error);
});

rd.on("connect", () => {
  logger.info("Redis Connection Successfull");
});

