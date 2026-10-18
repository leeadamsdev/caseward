import { availableParallelism } from "node:os";
import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/browser",
    testMatch: "**/*.spec.ts",
    forbidOnly: Boolean(process.env.CI),
    fullyParallel: true,
    workers: process.env.CI ? Math.min(4, availableParallelism()) : 2,
    globalTimeout: 300_000,
    reporter: [["list"], ["html", { open: "never" }]],
    use: {
        browserName: "chromium",
        reducedMotion: "reduce",
        baseURL: "http://127.0.0.1:4173",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    webServer: {
        command: "pnpm run build && node tests/support/serve.ts",
        url: "http://127.0.0.1:4173",
        timeout: 120_000,
    },
});
