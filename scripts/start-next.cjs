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

child.on("error", (error) => {
  console.error(
    "[NUBO start] failed:",
    error,
  );
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(
      `[NUBO start] stopped by ${signal}`,
    );
    process.exit(1);
  }

  process.exit(code ?? 0);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
}