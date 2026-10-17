import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
    await page.route("**/api/user", (route) =>
        route.fulfill({ status: 401, json: { message: "Unauthenticated." } }),
    );
});

test.afterEach(async ({ page }) => {
    expect(await page.pageErrors()).toEqual([]);
});

test("starts and opens registration from the home page", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL("/register");
    await expect(page).toHaveTitle("Create account | Caseward");
    await expect(
        page
            .getByRole("main")
            .getByRole("heading", { name: "Create account", exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText("Loading Caseward…", { exact: true }),
    ).toHaveCount(0);
    await expect(page.locator("body")).toHaveCSS(
        "font-family",
        /Inter Variable/,
    );
});

test("handles unknown deep links and returns home using the keyboard", async ({
    page,
}) => {
    await page.goto("/unknown/nested/page");

    await expect(
        page.getByRole("heading", { name: "Page not found", exact: true }),
    ).toBeVisible();

    await page.reload();

    await expect(
        page.getByRole("heading", { name: "Page not found", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(
        page.getByRole("link", { name: "Return to home" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL("/register");
    await expect(
        page.getByRole("heading", { name: "Create account", exact: true }),
    ).toBeVisible();
});
