import { test as base } from "../fixtures";

export const test = base.extend({
    page: async ({ page }, use) => {
        await page.goto("/register");
        await use(page);
    },
});

export { expect } from "../fixtures";
