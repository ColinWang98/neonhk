import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

let serverProcess;
let browserProcess;
let stopping = false;

const port = await findAvailablePort(3000, 3020);
const url = `http://127.0.0.1:${port}`;

console.log("Street Fragment Explorer");
console.log(`Starting local server on ${url}`);
console.log("Close this launcher window to stop the server.");

serverProcess = spawn(
  "npm",
  ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)],
  {
    cwd: projectRoot,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"]
  }
);

serverProcess.stdout.on("data", (data) => process.stdout.write(data));
serverProcess.stderr.on("data", (data) => process.stderr.write(data));

serverProcess.on("exit", (code, signal) => {
  if (!stopping) {
    console.log(`Server exited (${signal || code}).`);
    process.exit(code || 0);
  }
});

await waitForHttp(url, 30_000);
console.log(`Opening ${url}`);

browserProcess = openAppWindow(url);

browserProcess.on("exit", () => {
  console.log("Browser window process ended. Stopping server.");
  stopAndExit(0);
});

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => stopAndExit(0));
}

process.on("exit", () => {
  stopServer();
});

function openAppWindow(targetUrl) {
  const chrome = spawn(
    "open",
    ["-n", "-W", "-a", "Google Chrome", "--args", `--app=${targetUrl}`],
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

function stopAndExit(code) {
  if (stopping) return;
  stopping = true;
  stopServer();
  process.exit(code);
}

function stopServer() {
  if (!serverProcess?.pid) return;

  try {
    process.kill(-serverProcess.pid, "SIGTERM");
  } catch {
    try {
      serverProcess.kill("SIGTERM");
    } catch {
      // The server is already gone.
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

        setTimeout(check, 350);
      });

      req.setTimeout(1000, () => {
        req.destroy();
      });
    };

    check();
  });
}
