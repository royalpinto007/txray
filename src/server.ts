import { z } from "zod";
import { createApp } from "./app.js";
try {
  const port = z.coerce
    .number()
    .int()
    .min(1024)
    .max(65535)
    .parse(process.env.PORT ?? 4450);
  const server = createApp().listen(port, "127.0.0.1", () => {
    console.log(`txray: http://127.0.0.1:${port}`);
    console.log("Read-only. No wallet, keys or funds required.");
  });
  server.requestTimeout = 16000;
  server.headersTimeout = 10000;
  server.on("error", (error: NodeJS.ErrnoException) => {
    console.error(
      error.code === "EADDRINUSE"
        ? `Port ${port} is already in use. Set another PORT.`
        : "Could not start txray.",
    );
    process.exitCode = 1;
  });
} catch {
  console.error("PORT must be an integer between 1024 and 65535.");
  process.exitCode = 1;
}
