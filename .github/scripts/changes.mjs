import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { affectedJobs } from "./ci-paths.mjs";

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const base =
    process.env.GITHUB_EVENT_NAME === "pull_request"
        ? event.pull_request?.base?.sha
        : event.before;
let jobs = { backend: true, frontend: true, integration: true };
if (
    process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" &&
    base &&
    !/^0+$/.test(base)
) {
    if (
        !/^[a-f0-9]{40}$/.test(base) ||
        !/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? "")
    ) {
        throw new Error("Invalid comparison commit");
    }
    execFileSync("git", ["fetch", "--no-tags", "--depth=1", "origin", base], {
        stdio: "inherit",
        env: {
            ...process.env,
            ...(process.env.GITHUB_TOKEN
                ? {
                      GIT_CONFIG_COUNT: "1",
                      GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
                      GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${process.env.GITHUB_TOKEN}`).toString("base64")}`,
                  }
                : {}),
        },
    });
    // Disabling rename detection includes both sides of moves across feature boundaries.
    const paths = execFileSync(
        "git",
        [
            "diff",
            "--no-renames",
            "--name-only",
            "-z",
            base,
            process.env.GITHUB_SHA,
        ],
        { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    )
        .split("\0")
        .filter(Boolean);
    jobs = affectedJobs(paths);
}
for (const [name, enabled] of Object.entries(jobs)) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${enabled}\n`);
}
console.log(jobs);
