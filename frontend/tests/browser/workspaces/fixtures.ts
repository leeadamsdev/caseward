import { test as base } from "../fixtures";
import { mockSignedInSession } from "../support/session";
import { user } from "../../fixtures/account";
import { workspace } from "../../fixtures/workspaces";

export const test = base.extend({
    page: async ({ page }, use) => {
        await mockSignedInSession(page, user);
        await page.route(`**/api/workspaces/${workspace.id}`, (route) =>
            route.fulfill({ json: { data: workspace } }),
        );
        await use(page);
    },
});

export { expect } from "../fixtures";
