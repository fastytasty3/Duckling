import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { parse as parseYaml } from "yaml";
import router from "./routes";
import { logger } from "./lib/logger";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IS_PROD = process.env["NODE_ENV"] === "production";
const IS_TEST = process.env["NODE_ENV"] === "test";

// ---------------------------------------------------------------------------
// Allowed origins — comma-separated ALLOWED_ORIGINS env var, or Replit domains
// ---------------------------------------------------------------------------
function buildAllowedOrigins(): (string | RegExp)[] {
  const env = process.env["ALLOWED_ORIGINS"];
  if (env) return env.split(",").map(s => s.trim());

  // Replit dev/prod domains: *.replit.app and *.replit.dev
  return [/\.replit\.app$/, /\.replit\.dev$/];
}

const ALLOWED_ORIGINS = buildAllowedOrigins();

// ---------------------------------------------------------------------------
// Rate limiters
// In test mode: limits are raised so high that tests never hit them,
// but headers are still emitted (needed for security-header tests).
// ---------------------------------------------------------------------------
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: IS_TEST ? 100_000 : 200,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Слишком много запросов. Повторите позже." },
});

// Stricter limit on auth endpoints — 20 req / 15 min per IP (prod)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: IS_TEST ? 100_000 : 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Слишком много запросов на авторизацию. Повторите позже." },
});

// ---------------------------------------------------------------------------
// Load OpenAPI spec for Swagger UI
// ---------------------------------------------------------------------------
function loadOpenApiSpec(): object {
  try {
    const specPath = resolve(__dirname, "../../../../lib/api-spec/openapi.yaml");
    const raw = readFileSync(specPath, "utf-8");
    return parseYaml(raw) as object;
  } catch {
    return { openapi: "3.1.0", info: { title: "API", version: "0.0.0" }, paths: {} };
  }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app: Express = express();

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // needed for swagger-ui
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: IS_PROD ? { maxAge: 31536000, includeSubDomains: true } : false,
  }),
);

// CORS
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow same-origin requests (no origin header)
      if (!origin) return cb(null, true);
      const allowed = ALLOWED_ORIGINS.some(o =>
        typeof o === "string" ? o === origin : o.test(origin),
      );
      if (allowed) return cb(null, true);
      cb(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,
  }),
);

// Rate limiting
app.use(globalLimiter);
app.use("/api/auth", authLimiter);

// Request logging
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

// Swagger UI — API documentation
const apiSpec = loadOpenApiSpec();
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(apiSpec, { explorer: false }));

// API routes
app.use("/api", router);

// ---------------------------------------------------------------------------
// Global error handler — never expose stack traces or internal details
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  logger.error({ err: err.message }, "Unhandled error");

  // CORS errors
  if (err.message?.startsWith("CORS:")) {
    res.status(403).json({ error: "Доступ запрещён" });
    return;
  }

  // JSON parse errors
  if ("type" in err && (err as any).type === "entity.parse.failed") {
    res.status(400).json({ error: "Некорректный JSON" });
    return;
  }

  // Everything else — generic 500
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
});

export default app;
