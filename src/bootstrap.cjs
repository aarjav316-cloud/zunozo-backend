/**
 * Bootstrap preload — runs BEFORE any ESM module evaluation.
 * Catches ALL uncaught errors and ensures they are printed
 * to stderr before the process exits, even on platforms like
 * Render where stdout/stderr buffers may not flush instantly.
 */

process.on("uncaughtException", (err) => {
  process.stderr.write(`\n[FATAL] Uncaught Exception:\n${err.stack || err}\n`, () => {
    process.exit(1);
  });
  // Fallback in case the write callback never fires
  setTimeout(() => process.exit(1), 3000);
});

process.on("unhandledRejection", (reason) => {
  const message =
    reason instanceof Error ? reason.stack : String(reason);
  process.stderr.write(`\n[FATAL] Unhandled Promise Rejection:\n${message}\n`, () => {
    process.exit(1);
  });
  setTimeout(() => process.exit(1), 3000);
});
