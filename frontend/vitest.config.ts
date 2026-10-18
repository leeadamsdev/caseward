import { availableParallelism } from "node:os";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: { tsconfigPaths: true },
    test: {
        allowOnly: !process.env.CI,
        maxWorkers: Math.min(4, availableParallelism()),
        restoreMocks: true,
        projects: [
            {
                extends: true,
                test: {
                    name: "unit",
                    environment: "node",
                    include: ["tests/unit/**/*.test.ts"],
                },
            },
            {
                extends: true,
                test: {
                    name: "integration",
                    environment: "jsdom",
                    environmentOptions: {
                        jsdom: { url: "http://localhost/" },
                    },
                    include: ["tests/integration/**/*.test.{ts,tsx}"],
                    setupFiles: ["tests/support/setup-integration.ts"],
                },
            },
        ],
    },
});
