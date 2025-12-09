import dotenv from "dotenv";
import logger from "../utils/logger.util.js";

dotenv.config({ path: "../.env" });

const requiredEnvVars = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_REGION",
  "S3_BUCKET",
  "SQS_QUEUE_URL",
  "PRIVATE_KEY",
  "PUBLIC_KEY",
  "CLOUD_DB_URI",
  "CLOUD_RD_URI",
];

const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  logger.error("Missing required environment variables:", missingVars);
  process.exit(1);
}

export const config = {
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    region: process.env.AWS_REGION!,
    bucket: process.env.S3_BUCKET!,
    sqs: process.env.SQS_QUEUE_URL!,
  },
  jwt: {
    privateKey: process.env.PRIVATE_KEY!.replace(/\\n/g, "\n"),
    publicKey: process.env.PUBLIC_KEY!.replace(/\\n/g, "\n"),
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  },
  postgres: {
    dbURI: process.env.CLOUD_DB_URI!,
  },
  redis: {
    rdURI: process.env.CLOUD_RD_URI!,
  },
};
