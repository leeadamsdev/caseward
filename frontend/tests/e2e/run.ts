import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import pkg from "../../package.json" with { type: "json" };

const project = `caseward-e2e-${randomUUID()}`;
const root = fileURLToPath(new URL("../../../", import.meta.url));
const compose = [
    "compose",
    "--project-name",
    project,
    "-f",
    "compose.yaml",
    "-f",
    "compose.e2e.yaml",
];

let active: ChildProcess | undefined;
const interruption = new AbortController();
const wasInterrupted = () => interruption.signal.aborted;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
        interruption.abort();
        active?.kill(signal);
    });
}

async function run(args: string[]): Promise<number> {
    const child = spawn("docker", [...compose, ...args], {
        cwd: root,
        env: {
            ...process.env,
            PLAYWRIGHT_VERSION: pkg.devDependencies["@playwright/test"],
        },
        stdio: "inherit",
    });
    active = child;
    return new Promise((resolve) => {
        child.on("error", (error) => {
            console.error(error.message);
        });
        child.on("close", (code) => {
            active = undefined;
            resolve(code ?? 1);
        });
    });
}

console.log(`Running authentication smoke test in ${project}`);
let status = 1;
try {
    const startup = await run([
        "up",
        process.argv.includes("--no-build") ? "--no-build" : "--build",
        "--wait",
        "--wait-timeout",
        "300",
    ]);
    if (startup === 0 && !wasInterrupted()) {
        const preflight = await run([
            "exec",
            "-T",
            "backend",
            "php",
            "tests/e2e.php",
        ]);
        if (preflight === 0 && !wasInterrupted()) {
            status = await run([
                "exec",
                "-T",
                "frontend",
                "pnpm",
                "exec",
                "playwright",
                "test",
                "--config=playwright.e2e.config.ts",
            ]);
        }
    }
    if (status !== 0 && !wasInterrupted())
        await run(["logs", "--no-color", "--tail", "100"]);
} finally {
    // The UUID scopes cleanup to resources created by this invocation.
    const cleanup = await run(["down", "--volumes"]);
    process.exitCode = wasInterrupted() ? 1 : status === 0 ? cleanup : status;
}
