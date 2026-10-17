import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

if (process.env.CASEWARD_E2E !== "1") {
    throw new Error(
        "Use pnpm run test:e2e to start the isolated E2E environment.",
    );
}

export default defineConfig({
    ...config,
    testDir: "./tests/e2e",
    testIgnore: [],
    fullyParallel: false,
    workers: 1,
    timeout: 60_000,
    globalTimeout: 120_000,
    outputDir: "test-results/e2e",
    reporter: [
        ["list"],
        ["html", { open: "never", outputFolder: "playwright-report/e2e" }],
    ],
    use: { ...config.use, reducedMotion: "reduce" },
});
