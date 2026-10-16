import { expect, test } from "@playwright/test";

test.afterEach(async ({ page }) => {
    expect(await page.pageErrors()).toEqual([]);
});

test("starts and renders the home page", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("Caseward");
    await expect(
        page
            .getByRole("main")
            .getByRole("heading", { name: "Caseward", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
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

    await expect(page).toHaveURL("/");
    await expect(
        page.getByRole("heading", { name: "Caseward", exact: true }),
    ).toBeVisible();
});
