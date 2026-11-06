import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import apiRouter from "./routes/index.js";
import { errorHandler } from "./shared/middlewares/errorHandler.js";
import { NotFoundError } from "./shared/errors/AppError.js";
import { env } from "./config/env.config.js";
import { validateBrowserOrigin } from "./shared/middlewares/validateBrowserOrigin.js";
import { getAllowedOrigins } from "./config/cors.config.js";
import { validateCsrf } from "./shared/middlewares/csrf.js";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: getAllowedOrigins(env.NODE_ENV, env.FRONTEND_URL),
    credentials: true,
  })
);
app.use(cookieParser());
app.use(validateBrowserOrigin);
app.use(validateCsrf);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

if (env.NODE_ENV !== "test") {
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
}

app.use("/api/v1", apiRouter);

app.use((_req, _res, next) => {
  next(new NotFoundError("Rute API yang diminta tidak ditemukan."));
});

app.use(errorHandler);

export default app;
