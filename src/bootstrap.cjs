/**
 * Bootstrap preload — runs BEFORE any ESM module evaluation.
 * Uses console.log (stdout) instead of stderr because Render
 * does not reliably capture stderr output.
 */

// Track whether we've recorded a fatal error
let fatalError = null;

process.on("uncaughtException", (err) => {
  fatalError = err;
  console.log("\n========================================");
  console.log("[FATAL] Uncaught Exception:");
  console.log(err.stack || err.message || err);
  console.log("========================================\n");
  // Give stdout time to flush before exiting
  setTimeout(() => process.exit(1), 500);
});

process.on("unhandledRejection", (reason) => {
  fatalError = reason;
  console.log("\n========================================");
  console.log("[FATAL] Unhandled Promise Rejection:");
  if (reason instanceof Error) {
    console.log(reason.stack || reason.message);
  } else {
    console.log(String(reason));
  }
  console.log("========================================\n");
  setTimeout(() => process.exit(1), 500);
});

// This fires on ANY exit, including process.exit() calls
process.on("exit", (code) => {
  if (code !== 0) {
    // Use process.stdout.write which is SYNCHRONOUS inside 'exit' handler
    process.stdout.write(`\n[EXIT] Process exiting with code: ${code}\n`);
    if (fatalError) {
      const msg = fatalError.stack || fatalError.message || String(fatalError);
      process.stdout.write(`[EXIT] Last fatal error: ${msg}\n`);
    }
  }
});

console.log("[BOOTSTRAP] Error handlers registered");
