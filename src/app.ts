import express from "express";
import helmet from "helmet";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { inspectTransaction, type RpcOptions } from "./adapters/rpc.js";
import { examples, inspectExample } from "./adapters/examples.js";
import { TxrayError } from "./domain/errors.js";
import { requestSchema } from "./domain/schema.js";
interface AppOptions extends RpcOptions {
  maxConcurrent?: number;
}
export function createApp(options: AppOptions = {}) {
  const app = express();
  let active = 0;
  let count = 0;
  let since = Date.now();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: null,
        },
      },
      strictTransportSecurity: false,
    }),
  );
  app.use((req, res, next) => {
    const host = req.headers.host;
    if (
      !host ||
      !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/.test(host) ||
      (req.headers.origin && req.headers.origin !== `http://${host}`) ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return next(
        new TxrayError(
          "FORBIDDEN",
          "Open txray through its local address.",
          403,
        ),
      );
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/api", (req, _res, next) => {
    if (req.method === "POST" && !req.is("application/json"))
      return next(
        new TxrayError("UNSUPPORTED_MEDIA_TYPE", "Send application/json.", 415),
      );
    next();
  });
  app.use(express.json({ limit: "16kb", strict: true }));
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, app: "txray", readOnly: true }),
  );
  app.get("/api/examples", (_req, res) => res.json(examples));
  app.get("/api/examples/:id", (req, res, next) => {
    const report = inspectExample(req.params.id);
    if (!report)
      return next(
        new TxrayError("EXAMPLE_NOT_FOUND", "Example not found.", 404),
      );
    res.json(report);
  });
  app.post("/api/transactions", async (req, res, next) => {
    try {
      const input = requestSchema.parse(req.body);
      if (active >= (options.maxConcurrent ?? 4))
        throw new TxrayError(
          "LOOKUP_BUSY",
          "Another lookup is in progress. Try again shortly.",
          429,
          2,
        );
      if (Date.now() - since >= 60000) {
        since = Date.now();
        count = 0;
      }
      if (count >= 30)
        throw new TxrayError(
          "LOCAL_RATE_LIMIT",
          "Limit of 30 live lookups per minute reached. Wait before retrying.",
          429,
          60,
        );
      active++;
      count++;
      try {
        res.json(await inspectTransaction(input, options));
      } finally {
        active--;
      }
    } catch (error) {
      next(error);
    }
  });
  const publicDir = fileURLToPath(new URL("../dist/public/", import.meta.url));
  app.get("/guide", (_req, res) =>
    res.sendFile("guide.html", { root: publicDir }),
  );
  app.get("/architecture", (_req, res) =>
    res.sendFile("architecture.html", { root: publicDir }),
  );
  app.use(express.static(publicDir, { index: "index.html", etag: false }));
  app.use((_req, _res, next) =>
    next(new TxrayError("NOT_FOUND", "Page or API route not found.", 404)),
  );
  const errors: express.ErrorRequestHandler = (
    error: unknown,
    _req,
    res,
    _next,
  ) => {
    let failure: TxrayError;
    if (error instanceof TxrayError) failure = error;
    else if (error instanceof z.ZodError)
      failure = new TxrayError(
        "INVALID_INPUT",
        "Enter a valid transaction signature and choose Mainnet or Devnet.",
        400,
      );
    else if (
      typeof error === "object" &&
      error !== null &&
      "type" in error &&
      error.type === "entity.too.large"
    )
      failure = new TxrayError(
        "BODY_TOO_LARGE",
        "Request body exceeds 16 KiB.",
        413,
      );
    else if (error instanceof SyntaxError)
      failure = new TxrayError(
        "INVALID_JSON",
        "Request body is not valid JSON.",
        400,
      );
    else
      failure = new TxrayError(
        "INTERNAL_ERROR",
        "txray could not complete this request.",
        500,
      );
    if (failure.retryAfter)
      res.setHeader("Retry-After", String(failure.retryAfter));
    res.status(failure.status).json({
      error: {
        code: failure.code,
        message: failure.message,
        ...(failure.retryAfter ? { retryAfter: failure.retryAfter } : {}),
      },
    });
  };
  app.use(errors);
  return app;
}
