import { expect, test as base } from "@playwright/test";
import { mockBrowserSession } from "./support/session";

export const test = base.extend<{ allowedPageErrors: string[] }>({
    allowedPageErrors: [[], { option: true }],
    page: async ({ page, allowedPageErrors }, use) => {
        await mockBrowserSession(page);
        await use(page);
        const unexpected = (await page.pageErrors()).filter(
            (error) => !allowedPageErrors.includes(error.message),
        );
        expect(unexpected).toEqual([]);
    },
});

export { expect };
