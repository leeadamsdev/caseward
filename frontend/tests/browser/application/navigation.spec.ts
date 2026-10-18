import { expect, test } from "../fixtures";

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
    await expect(page).toHaveTitle("Page not found | Caseward");
    await expect(page.getByRole("img", { name: "Caseward" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Go back" })).toBeVisible();

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

test("the missing-page back button safely returns home after a direct visit", async ({
    page,
}) => {
    await page.route("https://external.example/", (route) =>
        route.fulfill({
            contentType: "text/html",
            body: "<!doctype html><html lang='en'><title>External site</title><body>External site</body></html>",
        }),
    );
    await page.goto("https://external.example/");
    await page.goto("/missing");
    await page.getByRole("button", { name: "Go back" }).click();
    await expect(page).toHaveURL("/register");
    await expect(
        page.getByRole("heading", { name: "Create account", exact: true }),
    ).toBeVisible();
});
