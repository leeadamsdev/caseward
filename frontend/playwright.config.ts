import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./tests",
    testIgnore: "**/e2e/**",
    forbidOnly: Boolean(process.env.CI),
    fullyParallel: true,
    workers: 2,
    globalTimeout: 300_000,
    reporter: [["list"], ["html", { open: "never" }]],
    use: {
        browserName: "chromium",
        baseURL: "http://127.0.0.1:4173",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    webServer: {
        command: "pnpm run build && node tests/serve.ts",
        url: "http://127.0.0.1:4173",
        timeout: 120_000,
    },
});
