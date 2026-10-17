import { expect, test, type Page } from "@playwright/test";
import { checkAccessibility } from "./accessibility";
import { mockBrowserSession } from "./browser-session";

const fault = "Controlled route render failure: private diagnostic";
const loginModule = "**/assets/login-main-*.js";

async function openErrorPage(page: Page) {
    await mockBrowserSession(page);
    // Replace only the browser's route module to exercise the real root boundary.
    await page.route(loginModule, (route) =>
        route.fulfill({
            contentType: "application/javascript",
            body: `export default function Login() { throw new Error(${JSON.stringify(fault)}); }`,
        }),
    );
    await page.goto("/register");
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(
        page.getByRole("heading", { name: "Something went wrong" }),
    ).toBeFocused();
    await expect(page).toHaveTitle("Something went wrong | Caseward");
    await expect(page.getByRole("img", { name: "Caseward" })).toBeVisible();
    await expect(page.getByText(fault)).toHaveCount(0);
}

test.afterEach(async ({ page }) => {
    // React may report the deliberately injected render error to the browser.
    for (const error of await page.pageErrors()) {
        expect(error.message).toBe(fault);
    }
});

test("renders an accessible error screen and reloads the current page to recover", async ({
    page,
}) => {
    await openErrorPage(page);
    await expect(page.locator(".brand-wave-top")).toHaveCSS(
        "animation-name",
        "brand-wave",
    );
    await checkAccessibility(page);
    await page.unroute(loginModule);
    await page.keyboard.press("Tab");
    await expect(
        page.getByRole("button", { name: "Reload page" }),
    ).toBeFocused();
    const navigation = page.waitForEvent("request", {
        predicate: (request) => request.isNavigationRequest(),
    });
    await page.keyboard.press("Enter");
    expect(new URL((await navigation).url()).pathname).toBe("/login");
    await expect(page).toHaveURL("/login");
    await expect(
        page.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
});

test("fits a narrow screen, respects reduced motion and returns home with a document navigation", async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openErrorPage(page);
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(320);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await expect(page.getByRole("button", { name: "Reload page" })).toHaveCSS(
        "cursor",
        "pointer",
    );
    const home = page.getByRole("link", { name: "Return to home" });
    await expect(home).toHaveCSS("cursor", "pointer");
    await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
    });
    const heading = page.getByRole("heading", { name: "Something went wrong" });
    expect(
        await heading.evaluate((element) => element.scrollWidth),
    ).toBeLessThanOrEqual(
        await heading.evaluate((element) => element.clientWidth),
    );
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(320);
    await checkAccessibility(page);
    const navigation = page.waitForEvent("request", {
        predicate: (request) => request.isNavigationRequest(),
    });
    await home.click();
    expect(new URL((await navigation).url()).pathname).toBe("/");
    await expect(page).toHaveURL("/register");
    await expect(
        page.getByRole("heading", { name: "Create account", exact: true }),
    ).toBeVisible();
});
