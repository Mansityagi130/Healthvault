import cors from "cors";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/request-logger.js";
import { requestIdMiddleware } from "./middleware/request-id.middleware.js";
import { apiRouter } from "./routes/index.js";
import { operationalRouter } from "./routes/operational.routes.js";

const allowedOrigins = Array.from(
  new Set([
    env.FRONTEND_URL,
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
  ])
);

export const app = express();

app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      if (env.NODE_ENV === "development" && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS policy error: Origin not allowed"));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(requestIdMiddleware);
app.use(requestLogger);

// Health & Metrics (mounted high up, no auth required)
app.use(operationalRouter);

app.use("/api", apiRouter);
app.use(errorHandler);
