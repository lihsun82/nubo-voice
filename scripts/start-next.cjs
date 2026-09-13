const { spawn } = require("node:child_process");

const isCloud =
  process.env.NUBO_RUNTIME_MODE === "cloud" ||
  Boolean(process.env.RAILWAY_ENVIRONMENT_ID) ||
  Boolean(process.env.RAILWAY_PROJECT_ID) ||
  Boolean(process.env.RAILWAY_SERVICE_ID);

const host =
  process.env.NUBO_BIND_HOST ||
  (isCloud ? "0.0.0.0" : "127.0.0.1");

const port = process.env.PORT || "3000";

const nextBin = require.resolve(
  "next/dist/bin/next",
);

console.log(
  `[NUBO start] mode=${isCloud ? "cloud" : "desktop"} host=${host} port=${port}`,
);

const child = spawn(
  process.execPath,
  [
    nextBin,
    "start",
    "-H",
    host,
    "-p",
    port,
  ],
  {
    stdio: "inherit",
    env: process.env,
  },
);

let shutdownSignal = null;
let shutdownTimer = null;

function clearShutdownTimer() {
  if (!shutdownTimer) return;
  clearTimeout(shutdownTimer);
  shutdownTimer = null;
}

function beginGracefulShutdown(signal) {
  if (shutdownSignal) return;
  shutdownSignal = signal;
  console.log(`[NUBO start] graceful shutdown requested by ${signal}`);

  if (!child.killed) {
    child.kill(signal);
  }

  // Railway gives the container a short grace period. If Next.js does not
  // exit by itself, terminate the child without turning a planned deploy into
  // an application crash notification.
  shutdownTimer = setTimeout(() => {
    if (!child.killed) {
      try {
        child.kill("SIGKILL");
      } catch {}
    }
    process.exit(0);
  }, 8000);
  shutdownTimer.unref?.();
}

child.on("error", (error) => {
  clearShutdownTimer();
  console.error(
    "[NUBO start] failed:",
    error,
  );
  process.exit(1);
});

child.on("exit", (code, signal) => {
  clearShutdownTimer();

  if (shutdownSignal) {
    console.log(
      `[NUBO start] graceful shutdown complete (${signal || `code ${code ?? 0}`})`,
    );
    process.exit(0);
  }

  if (signal) {
    console.error(
      `[NUBO start] stopped unexpectedly by ${signal}`,
    );
    process.exit(1);
  }

  process.exit(code ?? 0);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => beginGracefulShutdown(signal));
}
