import { spawn, execSync } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

let webProcess;
let sidecarProcess;
let stopping = false;

// --- Cleanup: kill any existing next-server on ports 3000-3020 ---
function killExistingServers() {
  try {
    const pids = execSync(
      `lsof -ti :3000-3020 2>/dev/null | xargs ps -o pid,command -p 2>/dev/null | grep next-server | awk '{print $1}'`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    if (pids) {
      console.log(`Cleaning up existing next-server processes: ${pids}`);
      pids.split("\n").forEach((pid) => {
        try { process.kill(Number(pid), "SIGKILL"); } catch {}
      });
      execSync("sleep 1");
    }
  } catch {}
}

killExistingServers();

const webPort = await findAvailablePort(3000, 3020);
const sidecarPort = Number(process.env.COSYVOICE_PORT || 7860);
const webUrl = `http://127.0.0.1:${webPort}/cosyvoice`;
const sidecarUrl = `http://127.0.0.1:${sidecarPort}`;

console.log("CosyVoice Studio");
console.log(`Starting CosyVoice sidecar on ${sidecarUrl}`);
console.log(`Starting web UI on ${webUrl}`);
console.log("Close this launcher window to stop both processes.");

const sidecarAlreadyRunning = await waitForHttp(`${sidecarUrl}/health`, 1_500).then(
  () => true,
  () => false
);

if (sidecarAlreadyRunning) {
  console.log("CosyVoice sidecar already running; using the existing process.");
} else {
  sidecarProcess = spawn("scripts/start-cosyvoice3-sidecar.sh", {
    cwd: projectRoot,
    detached: true,
    env: { ...process.env, COSYVOICE_PORT: String(sidecarPort) },
    stdio: ["ignore", "pipe", "pipe"]
  });

  sidecarProcess.stdout.on("data", (data) => process.stdout.write(`[cosyvoice] ${data}`));
  sidecarProcess.stderr.on("data", (data) => process.stderr.write(`[cosyvoice] ${data}`));
  sidecarProcess.on("exit", (code, signal) => {
    if (!stopping) {
      console.log(`CosyVoice sidecar exited (${signal || code}).`);
    }
  });
}

webProcess = spawn(
  "npm",
  ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(webPort)],
  {
    cwd: projectRoot,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"]
  }
);

webProcess.stdout.on("data", (data) => process.stdout.write(`[web] ${data}`));
webProcess.stderr.on("data", (data) => process.stderr.write(`[web] ${data}`));
webProcess.on("exit", (code, signal) => {
  if (!stopping) {
    console.log(`Web server exited (${signal || code}).`);
    stopAndExit(code || 0);
  }
});

await waitForHttp(webUrl, 60_000);
console.log(`Opening ${webUrl}`);

openAppWindow(webUrl);
if (!sidecarAlreadyRunning) {
  waitForHttp(`${sidecarUrl}/health`, 180_000).then(
    () => console.log("CosyVoice sidecar is ready."),
    (error) => console.log(`CosyVoice sidecar is still not ready: ${error.message}`)
  );
}

// Kill all children on ANY exit — including terminal window close (SIGHUP)
function cleanup() {
  if (stopping) return;
  stopping = true;
  stopChildren();
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    cleanup();
    process.exit(0);
  });
}

process.on("exit", cleanup);

function openAppWindow(targetUrl) {
  const chrome = spawn(
    "open",
    ["-n", "-a", "Google Chrome", "--args", `--app=${targetUrl}`],
    {
      cwd: projectRoot,
      stdio: "ignore"
    }
  );

  chrome.on("error", () => {
    spawn("open", [targetUrl], {
      cwd: projectRoot,
      stdio: "ignore"
    });
  });

  return chrome;
}

function stopChildren() {
  stopProcess(webProcess);
  if (!sidecarAlreadyRunning) {
    stopProcess(sidecarProcess);
  }
}

function stopProcess(child) {
  if (!child?.pid) return;

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      // Already stopped.
    }
  }
}

async function findAvailablePort(start, end) {
  for (let candidate = start; candidate <= end; candidate += 1) {
    if (await isPortFree(candidate)) return candidate;
  }

  throw new Error(`No available port found between ${start} and ${end}.`);
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

function waitForHttp(targetUrl, timeoutMs) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(targetUrl, (res) => {
        res.resume();
        resolve();
      });

      req.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for ${targetUrl}`));
          return;
        }

        setTimeout(check, 700);
      });

      req.setTimeout(1000, () => {
        req.destroy();
      });
    };

    check();
  });
}
