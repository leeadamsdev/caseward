import { expect, test, type Page } from "@playwright/test";
import { checkAccessibility } from "./accessibility";
import { mockBrowserSession, mockSignedInSession } from "./browser-session";

const account = {
    name: "Alex Chen",
    email: "alex.chen@example.com",
    password: "  a long Unicode passphrase 🔐  ",
    password_confirmation: "  a long Unicode passphrase 🔐  ",
};
const created = {
    data: {
        id: 1,
        name: account.name,
        email: account.email,
        email_verified: false,
    },
    meta: { verification_email_sent: true },
};

async function registeredSession(page: Page) {
    await mockSignedInSession(page, created.data);
}

async function fillRegistration(page: Page) {
    await page.getByLabel("Full name", { exact: true }).fill(account.name);
    await page.getByLabel("Email address", { exact: true }).fill(account.email);
    await page.getByLabel("Password", { exact: true }).fill(account.password);
    await page
        .getByLabel("Confirm password", { exact: true })
        .fill(account.password_confirmation);
}

test.beforeEach(async ({ page }) => {
    await mockBrowserSession(page);
    await page.goto("/register");
});

test.afterEach(async ({ page }) => {
    expect(await page.pageErrors()).toEqual([]);
});

test("shows the branded ready state and supports keyboard password visibility", async ({
    page,
}) => {
    await expect(
        page.getByRole("img", { name: "Caseward", exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole("heading", { name: "Create account", exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText("15–128 characters", { exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByRole("button", {
            name: "Password requirements",
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Create account", exact: true }),
    ).toBeEnabled();
    await fillRegistration(page);
    await page
        .getByRole("button", { name: "Show password", exact: true })
        .focus();
    await page.keyboard.press("Space");
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
        "type",
        "text",
    );
    await expect(
        page.getByLabel("Confirm password", { exact: true }),
    ).toHaveAttribute("type", "password");
    await expect(
        page.getByRole("button", { name: "Hide password", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
        "type",
        "password",
    );
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
        account.password,
    );
    await checkAccessibility(page);
});

test("opens password help on demand and restores keyboard focus", async ({
    page,
}) => {
    const help = page.getByRole("button", {
        name: "Password requirements",
        exact: true,
    });
    const popup = page.getByRole("dialog", {
        name: "Password requirements",
        exact: true,
    });
    await page.getByLabel("Password", { exact: true }).fill(account.password);
    await expect(help).toHaveAttribute("aria-expanded", "false");
    await help.focus();
    await page.keyboard.press("Enter");
    await expect(popup).toBeVisible();
    await expect(help).toHaveAttribute("aria-expanded", "true");
    await expect(popup.getByRole("listitem")).toHaveCount(3);
    await expect(popup).toContainText("15\u2013128 characters");
    await expect(popup).toContainText(
        "Spaces and Unicode characters are supported",
    );
    await expect(popup).toContainText(
        "No mandatory uppercase, number, or symbol rules",
    );
    await expect(
        page.getByRole("button", { name: "Close password help", exact: true }),
    ).toBeFocused();
    // Browser-resolved colours cover color-mix backgrounds that axe cannot always evaluate.
    const guidanceContrast = await page
        .getByRole("dialog", { name: "Password requirements", exact: true })
        .evaluate((element) => {
            const item = element.querySelector("li");
            const context = document.createElement("canvas").getContext("2d");
            if (!item || !context)
                throw new Error("Password guidance is unavailable");
            const luminance = () => {
                const [r = 0, g = 0, b = 0] = Array.from(
                    context.getImageData(0, 0, 1, 1).data,
                )
                    .slice(0, 3)
                    .map((value) => value / 255)
                    .map((value) =>
                        value <= 0.04045
                            ? value / 12.92
                            : ((value + 0.055) / 1.055) ** 2.4,
                    );
                return r * 0.2126 + g * 0.7152 + b * 0.0722;
            };
            context.fillStyle = getComputedStyle(element).backgroundColor;
            context.fillRect(0, 0, 1, 1);
            const background = luminance();
            context.fillStyle = getComputedStyle(item).color;
            context.fillRect(0, 0, 1, 1);
            const foreground = luminance();
            return (
                (Math.max(background, foreground) + 0.05) /
                (Math.min(background, foreground) + 0.05)
            );
        });
    expect(guidanceContrast).toBeGreaterThanOrEqual(4.5);
    await checkAccessibility(page);
    await page.keyboard.press("Escape");
    await expect(popup).toBeHidden();
    await expect(help).toBeFocused();
    await help.click();
    await page.getByLabel("Email address", { exact: true }).click();
    await expect(popup).toBeHidden();
    await expect(
        page.getByLabel("Email address", { exact: true }),
    ).toBeFocused();
    await help.click();
    await page
        .getByRole("button", { name: "Close password help", exact: true })
        .click();
    await expect(popup).toBeHidden();
    await expect(help).toBeFocused();
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
        account.password,
    );
    await expect(page.getByRole("alert")).toHaveCount(0);
});

test.describe("password help on touch devices", () => {
    test.use({ viewport: { width: 320, height: 640 }, hasTouch: true });

    test("fits the viewport with larger text and respects reduced motion", async ({
        page,
    }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.evaluate(() => {
            document.documentElement.style.fontSize = "200%";
        });
        const help = page.getByRole("button", {
            name: "Password requirements",
            exact: true,
        });
        const popup = page.getByRole("dialog", {
            name: "Password requirements",
            exact: true,
        });
        await help.tap();
        await expect(popup).toBeVisible();
        const bounds = await popup.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds?.x).toBeGreaterThanOrEqual(16);
        expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(
            304,
        );
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth,
            ),
        ).toBe(false);
        expect(await page.evaluate(() => document.getAnimations().length)).toBe(
            0,
        );
        await checkAccessibility(page);
        await page
            .getByRole("button", { name: "Close password help", exact: true })
            .tap();
        await expect(popup).toBeHidden();
    });
});

test("animates the background and respects reduced motion", async ({
    page,
}) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const waves = page.locator(".brand-wave");
    const initialTransform = await waves
        .first()
        .evaluate((element) => getComputedStyle(element).transform);
    await expect
        .poll(() =>
            waves
                .first()
                .evaluate((element) => getComputedStyle(element).transform),
        )
        .not.toBe(initialTransform);
    await page.getByLabel("Full name", { exact: true }).fill(account.name);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
        account.name,
    );
    await expect
        .poll(() => page.evaluate(() => document.getAnimations().length))
        .toBe(0);
    await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    await expect(
        page.getByLabel("Email address", { exact: true }),
    ).toBeFocused();
    await expect(page.getByRole("alert")).toBeVisible();
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test("requires all fields and focuses the first invalid field", async ({
    page,
}) => {
    await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    await expect(page.getByRole("alert")).toContainText(
        "Please fix the errors below",
    );
    await expect(page.getByLabel("Full name", { exact: true })).toBeFocused();
    for (const label of [
        "Full name",
        "Email address",
        "Password",
        "Confirm password",
    ]) {
        await expect(page.getByLabel(label, { exact: true })).toHaveAttribute(
            "aria-invalid",
            "true",
        );
    }
    await expect(
        page.getByLabel("Full name", { exact: true }),
    ).toHaveAccessibleDescription("Full name is required.");
    await checkAccessibility(page);
});

test("shows mismatched confirmation against the confirmation field", async ({
    page,
}) => {
    await fillRegistration(page);
    await page
        .getByLabel("Confirm password", { exact: true })
        .fill("a different long passphrase");
    await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    await expect(
        page.getByLabel("Confirm password", { exact: true }),
    ).toBeFocused();
    await expect(
        page.getByLabel("Confirm password", { exact: true }),
    ).toHaveAccessibleDescription(/Passwords do not match/);
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
        "aria-invalid",
        "false",
    );
});

test("prevents duplicate submissions, preserves passwords and confirms the server email", async ({
    page,
}) => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
        release = resolve;
    });
    let requests = 0;
    await page.route("**/api/register", async (route) => {
        requests++;
        expect(route.request().method()).toBe("POST");
        expect(route.request().headers()["x-xsrf-token"]).toBe("test=token");
        const payload: unknown = route.request().postDataJSON();
        expect(payload).toEqual(account);
        await pending;
        await registeredSession(page);
        await route.fulfill({ status: 201, json: created });
    });
    await fillRegistration(page);
    await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    await expect(
        page.getByRole("button", { name: "Creating account…", exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole("form")).toHaveAttribute("aria-busy", "true");
    await expect(
        page.getByLabel("Email address", { exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Enter");
    expect(requests).toBe(1);
    release?.();
    await expect(
        page.getByRole("heading", { name: "Check your email", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(account.email, { exact: true })).toBeVisible();
    await expect(page).toHaveURL("/verify-email");
    await expect(page.locator("input[type=password]")).toHaveCount(0);
    await expect(
        page.getByRole("heading", { name: "Check your email", exact: true }),
    ).toBeFocused();
    const storage = await page.evaluate(() => ({
        local: Object.keys(localStorage),
        session: Object.keys(sessionStorage),
    }));
    expect(storage).toEqual({ local: [], session: [] });
    await checkAccessibility(page);
});

test("renders backend validation, retains values and recovers after correction", async ({
    page,
}) => {
    await page.route("**/api/register", async (route) => {
        await route.fulfill({
            status: 422,
            json: {
                errors: {
                    email: ["An account with this email already exists."],
                    password: ["Password must be at least 15 characters long."],
                },
            },
        });
    });
    await fillRegistration(page);
    await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    await expect(
        page.getByLabel("Email address", { exact: true }),
    ).toBeFocused();
    await expect(
        page.getByLabel("Email address", { exact: true }),
    ).toHaveAccessibleDescription("An account with this email already exists.");
    await expect(
        page.getByLabel("Password", { exact: true }),
    ).toHaveAccessibleDescription(/Password must be at least 15/);
    await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
        account.name,
    );
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
        account.password,
    );
    await page.route("**/api/register", async (route) => {
        await registeredSession(page);
        await route.fulfill({ status: 201, json: created });
    });
    await page
        .getByLabel("Email address", { exact: true })
        .fill("another@example.com");
    await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "Check your email", exact: true }),
    ).toBeVisible();
    // The confirmation uses the validated response, rather than echoing the submitted address.
    await expect(page.getByText(account.email, { exact: true })).toBeVisible();
});

for (const header of ["seconds", "date", "missing"]) {
    test(`honours Retry-After (${header}) and enables a manual retry`, async ({
        page,
    }) => {
        await page.clock.install({ time: new Date("2026-10-17T12:00:00Z") });
        await page.route("**/api/register", async (route) => {
            const headers =
                header === "missing"
                    ? {}
                    : {
                          "Retry-After":
                              header === "seconds"
                                  ? "3"
                                  : "Sat, 17 Oct 2026 12:00:03 GMT",
                      };
            await route.fulfill({
                status: 429,
                headers,
                json: { message: "Too Many Attempts." },
            });
        });
        await fillRegistration(page);
        await page
            .getByRole("button", { name: "Create account", exact: true })
            .click();
        await expect(
            page.getByText("Too many attempts", { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Create account", exact: true }),
        ).toBeDisabled();
        await expect(
            page.getByLabel("Full name", { exact: true }),
        ).toBeDisabled();
        await checkAccessibility(page);
        await page.clock.fastForward(header === "missing" ? 61_000 : 4_000);
        await expect(
            page.getByText("Too many attempts", { exact: true }),
        ).toHaveCount(0);
        await expect(
            page.getByText("You can try again", { exact: true }),
        ).toHaveCount(0);
        await expect(
            page
                .getByRole("status")
                .filter({ hasText: "You can try again now." }),
        ).toHaveText("You can try again now.");
        await expect(
            page.getByRole("button", { name: "Create account", exact: true }),
        ).toBeEnabled();
        await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
            account.password,
        );
        await page.route("**/api/register", async (route) => {
            await registeredSession(page);
            await route.fulfill({ status: 201, json: created });
        });
        await page
            .getByRole("button", { name: "Create account", exact: true })
            .click();
        await expect(
            page.getByRole("heading", {
                name: "Check your email",
                exact: true,
            }),
        ).toBeVisible();
    });
}

for (const failure of [
    "network",
    "server",
    "invalid-success",
    "invalid-validation",
    "html",
]) {
    test(`handles ${failure} failures safely and allows retry`, async ({
        page,
    }) => {
        await page.route("**/api/register", async (route) => {
            if (failure === "network") {
                await route.abort("failed");
            } else if (failure === "html") {
                await route.fulfill({
                    status: 201,
                    contentType: "text/html",
                    body: "<h1>Internal diagnostic</h1>",
                });
            } else {
                await route.fulfill({
                    status:
                        failure === "server"
                            ? 500
                            : failure === "invalid-validation"
                              ? 422
                              : 201,
                    json: {
                        data: { email: 123 },
                        errors: { email: "Internal diagnostic" },
                    },
                });
            }
        });
        await fillRegistration(page);
        await page
            .getByRole("button", { name: "Create account", exact: true })
            .click();
        await expect(page.getByRole("alert")).toContainText(
            "We couldn’t confirm your account was created.",
        );
        await expect(page.getByRole("alert")).toBeFocused();
        await expect(page.getByText("Internal diagnostic")).toHaveCount(0);
        await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
            account.password,
        );
        await expect(
            page.getByRole("button", { name: "Create account", exact: true }),
        ).toBeEnabled();
        if (failure === "network")
            await expect(page.getByRole("alert")).toContainText(
                "may still have reached us",
            );
        await page.route("**/api/register", async (route) => {
            await registeredSession(page);
            await route.fulfill({ status: 201, json: created });
        });
        await page
            .getByRole("button", { name: "Create account", exact: true })
            .click();
        await expect(
            page.getByRole("heading", {
                name: "Check your email",
                exact: true,
            }),
        ).toBeVisible();
    });
}

test.describe("mobile validation", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("keeps the card unclipped when focusing an error", async ({
        page,
    }) => {
        await page.route("**/api/register", async (route) => {
            await route.fulfill({
                status: 422,
                json: { errors: { email: ["Enter a valid email address."] } },
            });
        });
        await fillRegistration(page);
        await page
            .getByRole("button", { name: "Create account", exact: true })
            .click();

        await expect(
            page.getByLabel("Email address", { exact: true }),
        ).toBeFocused();
        await expect(page.getByRole("alert")).toBeVisible();
        expect(
            await page
                .getByRole("main")
                .evaluate((element) => [element.scrollLeft, element.scrollTop]),
        ).toEqual([0, 0]);
    });
});

test("works at narrow widths and increased zoom without horizontal scrolling", async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(
        page.getByRole("button", { name: "Create account", exact: true }),
    ).toBeVisible();
    await checkAccessibility(page);
    const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
    );
    expect(overflow).toBe(false);
    await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
    });
    await expect(
        page.getByRole("button", { name: "Create account", exact: true }),
    ).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
        ),
    ).toBe(false);
    const longEmail = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.example.com`;
    await page.route("**/api/register", async (route) => {
        await mockSignedInSession(page, { ...created.data, email: longEmail });
        await route.fulfill({
            status: 201,
            json: { ...created, data: { ...created.data, email: longEmail } },
        });
    });
    await fillRegistration(page);
    await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "Check your email", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(longEmail, { exact: true })).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
        ),
    ).toBe(false);
});
