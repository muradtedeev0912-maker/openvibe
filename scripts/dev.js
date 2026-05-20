// Dev runner: starts Vite, compiles Electron sources,
// waits for Vite to actually serve, then launches Electron.
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

const isWin = process.platform === "win32";
const npxCmd = isWin ? "npx.cmd" : "npx";
const DEV_URL = "http://localhost:3000";

function run(cmd, args, opts = {}) {
  const p = spawn(cmd, args, {
    stdio: "inherit",
    shell: isWin,
    ...opts,
  });
  p.on("exit", (code) => {
    if (code !== 0 && code !== null) process.exit(code);
  });
  return p;
}

async function probePort(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const sock = createConnection({ host, port });
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(ok);
    };
    sock.once("connect", () => finish(true));
    sock.once("error", () => finish(false));
    setTimeout(() => finish(false), timeoutMs);
  });
}

async function waitForServer(port, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await probePort("127.0.0.1", port)) return true;
    if (await probePort("::1", port)) return true;
    await sleep(150);
  }
  return false;
}

console.log("→ starting Vite dev server...");
const vite = run(npxCmd, ["vite"]);

console.log("→ compiling Electron sources...");
await new Promise((resolve, reject) => {
  const tsc = spawn(npxCmd, ["tsc", "-p", "tsconfig.node.json"], {
    stdio: "inherit",
    shell: isWin,
  });
  tsc.on("exit", (code) =>
    code === 0 ? resolve() : reject(new Error("tsc failed")),
  );
});

// preload must remain CommonJS — copy it as-is into dist
{
  const { mkdirSync, copyFileSync } = await import("node:fs");
  mkdirSync("dist/electron", { recursive: true });
  copyFileSync("electron/preload.cjs", "dist/electron/preload.cjs");
}

console.log(`→ waiting for ${DEV_URL}...`);
const ready = await waitForServer(3000);
if (!ready) {
  console.error("Vite did not become ready in time. Aborting.");
  vite.kill();
  process.exit(1);
}

console.log("→ launching Electron...");
const electron = run(npxCmd, ["electron", "."], {
  env: { ...process.env, VIBE_DEV_URL: DEV_URL },
});

function shutdown() {
  vite.kill();
  electron.kill();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
electron.on("exit", () => {
  vite.kill();
  process.exit(0);
});
