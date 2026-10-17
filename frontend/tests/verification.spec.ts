import { expect, test, type Page } from "@playwright/test";
import { checkAccessibility } from "./accessibility";
import { mockBrowserSession, mockSignedInSession } from "./browser-session";

const user = {
    id: 7,
    name: "Alex Chen",
    email: "alex.chen@example.com",
    email_verified: false,
};
const link = `/email/verify/7/${"a".repeat(40)}?expires=1790000000&signature=${"b".repeat(64)}`;
const password = "a long verification passphrase";

async function signIn(page: Page) {
    await page.getByLabel("Email address", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test.use({ reducedMotion: "reduce" });
test.beforeEach(async ({ page }) => {
    await mockBrowserSession(page);
});
test.afterEach(async ({ page }) => {
    expect(await page.pageErrors()).toEqual([]);
});

test("retains registration's restricted session and verifies only after deliberate confirmation", async ({
    page,
}) => {
    await page.route("**/api/register", async (route) => {
        expect(route.request().headers()["x-xsrf-token"]).toBe("test=token");
        await mockSignedInSession(page, user);
        await route.fulfill({
            status: 201,
            json: { data: user, meta: { verification_email_sent: true } },
        });
    });
    await page.goto("/register");
    await page.getByLabel("Full name", { exact: true }).fill(user.name);
    await page.getByLabel("Email address", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password", { exact: true }).fill(password);
    await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    await expect(page).toHaveURL("/verify-email");
    await expect(
        page.getByRole("heading", { name: "Check your email" }),
    ).toBeFocused();
    await expect(page.getByText(user.email, { exact: true })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL("/verify-email");
    await checkAccessibility(page);

    let posts = 0;
    let resume = () => {};
    const submission = new Promise<void>((resolve) => {
        resume = resolve;
    });
    await page.route(`**/api${link}`, async (route) => {
        posts++;
        expect(route.request().method()).toBe("POST");
        expect(route.request().headers()["x-xsrf-token"]).toBe("test=token");
        expect(new URL(route.request().url()).search).toBe(
            new URL(link, "https://caseward.test").search,
        );
        await submission;
        await mockSignedInSession(page, { ...user, email_verified: true });
        await route.fulfill({ status: 204 });
    });
    await page.goto(link);
    await expect(
        page.getByRole("heading", { name: "Confirm your email" }),
    ).toBeFocused();
    expect(posts).toBe(0);
    await checkAccessibility(page);
    try {
        await page
            .getByRole("button", { name: "Verify email", exact: true })
            .click();
        await expect(
            page.getByRole("button", { name: /Verifying email/ }),
        ).toBeDisabled();
        await expect(
            page.getByRole("button", { name: "Switch account" }),
        ).toBeDisabled();
        await page.keyboard.press("Enter");
        expect(posts).toBe(1);
    } finally {
        resume();
    }
    await expect(
        page.getByRole("heading", { name: "Email verified", exact: true }),
    ).toBeFocused();
    await checkAccessibility(page);
    await page.getByRole("link", { name: "Continue to your account" }).click();
    await expect(page).toHaveURL("/account");
    await expect(
        page.getByText("Email verified", { exact: true }),
    ).toBeVisible();
    await page.goto(link);
    await expect(
        page.getByRole("heading", { name: "Email already verified" }),
    ).toBeVisible();
    await expect(page.locator(".success-confetti")).toHaveCount(0);
    expect(posts).toBe(1);
});

test("routes unverified sign-ins and protected pages to verification", async ({
    page,
}) => {
    await page.route("**/api/login", async (route) => {
        await mockSignedInSession(page, user);
        await route.fulfill({ status: 204 });
    });
    await page.goto("/login");
    await signIn(page);
    await expect(page).toHaveURL("/verify-email");
    for (const path of ["/account", "/register", "/login"]) {
        await page.goto(path);
        await expect(page).toHaveURL("/verify-email");
        await expect(page.getByText(user.email, { exact: true })).toBeVisible();
    }
    await page.getByRole("button", { name: "I’ve verified my email" }).click();
    await expect(
        page
            .getByRole("status")
            .filter({ hasText: "Your email isn’t verified yet." }),
    ).toBeFocused();
    await mockSignedInSession(page, { ...user, email_verified: true });
    await page.getByRole("button", { name: "I’ve verified my email" }).click();
    await expect(page).toHaveURL("/account");
});

test("preserves the signed link through sign-in after opening it while signed out", async ({
    page,
}) => {
    await page.route("**/api/login", async (route) => {
        await mockSignedInSession(page, user);
        await route.fulfill({ status: 204 });
    });
    await page.goto(link);
    await expect(
        page.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe(link);
    await expect(
        page.getByText(/Sign in to the account this link was sent to/),
    ).toBeVisible();
    await signIn(page);
    await expect(page).toHaveURL(link);
    await expect(
        page.getByRole("heading", { name: "Confirm your email" }),
    ).toBeVisible();
});

test("keeps a different account private and preserves the link while switching accounts", async ({
    page,
}) => {
    await mockSignedInSession(page, {
        ...user,
        id: 9,
        email: "other@example.com",
        email_verified: true,
    });
    await page.route("**/api/logout", async (route) => {
        await page.unroute("**/api/session");
        await route.fulfill({ status: 204 });
    });
    await page.goto(link);
    await expect(
        page.getByRole("heading", { name: "Different account signed in" }),
    ).toBeVisible();
    await expect(
        page.getByText("other@example.com", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(user.email, { exact: true })).toHaveCount(0);
    await expect(
        page.getByRole("button", { name: "Verify email", exact: true }),
    ).toHaveCount(0);
    await checkAccessibility(page);
    await page
        .getByRole("button", { name: "Sign in with another account" })
        .click();
    await expect(
        page.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe(link);
});

for (const [code, title] of [
    ["invalid_verification_link", "Link expired or invalid"],
    ["verification_email_mismatch", "Your email address changed"],
    ["verification_account_mismatch", "Different account signed in"],
] as const) {
    test(`handles ${code} without exposing backend diagnostics`, async ({
        page,
    }) => {
        await mockSignedInSession(page, user);
        await page.route(`**/api${link}`, (route) =>
            route.fulfill({
                status: 403,
                json: { code, message: "Private diagnostic" },
            }),
        );
        await page.goto(link);
        await page
            .getByRole("button", { name: "Verify email", exact: true })
            .click();
        await expect(page.getByRole("heading", { name: title })).toBeFocused();
        await expect(page.getByText("Private diagnostic")).toHaveCount(0);
        await checkAccessibility(page);
    });
}

test("checks server state after an interrupted verification rather than replaying the request", async ({
    page,
}) => {
    await mockSignedInSession(page, user);
    let posts = 0;
    await page.route(`**/api${link}`, async (route) => {
        posts++;
        await route.abort("failed");
    });
    await page.goto(link);
    await page
        .getByRole("button", { name: "Verify email", exact: true })
        .click();
    await expect(page.getByRole("alert")).toBeFocused();
    await expect(page.getByRole("alert")).toContainText(
        "Your request may have reached us.",
    );
    await mockSignedInSession(page, { ...user, email_verified: true });
    await page
        .getByRole("button", { name: "Check verification status" })
        .click();
    await expect(
        page.getByRole("heading", { name: "Email already verified" }),
    ).toBeVisible();
    expect(posts).toBe(1);
});

test("clears an expired link's result when navigating to a newer signed link", async ({
    page,
}) => {
    await mockSignedInSession(page, user);
    const newerLink = link.replace("b".repeat(64), "c".repeat(64));
    await page.route(`**/api${link}`, (route) =>
        route.fulfill({
            status: 403,
            json: { code: "invalid_verification_link" },
        }),
    );
    let posts = 0;
    await page.route(`**/api${newerLink}`, async (route) => {
        posts++;
        await mockSignedInSession(page, { ...user, email_verified: true });
        await route.fulfill({ status: 204 });
    });
    await page.goto(link);
    await page
        .getByRole("button", { name: "Verify email", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "Link expired or invalid" }),
    ).toBeVisible();
    // Navigate within the SPA without reloading and clearing its component state.
    await page.evaluate((path) => {
        history.pushState(null, "", path);
        dispatchEvent(new PopStateEvent("popstate"));
    }, newerLink);
    await expect(page).toHaveURL(newerLink);
    await expect(
        page.getByRole("heading", { name: "Confirm your email" }),
    ).toBeFocused();
    expect(posts).toBe(0);
    await page
        .getByRole("button", { name: "Verify email", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "Email verified", exact: true }),
    ).toBeVisible();
    expect(posts).toBe(1);
});

test("honours verification rate limits and supports an explicit retry", async ({
    page,
}) => {
    await page.clock.install();
    await mockSignedInSession(page, user);
    await page.route(`**/api${link}`, (route) =>
        route.fulfill({
            status: 429,
            headers: { "Retry-After": "3" },
            json: {},
        }),
    );
    await page.goto(link);
    await page
        .getByRole("button", { name: "Verify email", exact: true })
        .click();
    await expect(
        page.getByRole("button", { name: "Verify email", exact: true }),
    ).toBeDisabled();
    await expect(
        page.getByText("Too many attempts", { exact: true }),
    ).toBeVisible();
    await page.clock.fastForward(4_000);
    await expect(
        page.getByText("Too many attempts", { exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByText("You can try again", { exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByRole("button", { name: "Verify email", exact: true }),
    ).toBeEnabled();
});

test("retains the link when the verification session expires", async ({
    page,
}) => {
    await mockSignedInSession(page, user);
    await page.route(`**/api${link}`, async (route) => {
        await page.unroute("**/api/session");
        await route.fulfill({ status: 401, json: {} });
    });
    await page.goto(link);
    await page
        .getByRole("button", { name: "Verify email", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe(link);
});

test("acknowledges an initial delivery failure without asking the user to register again", async ({
    page,
}) => {
    await page.route("**/api/register", async (route) => {
        await mockSignedInSession(page, user);
        await route.fulfill({
            status: 201,
            json: { data: user, meta: { verification_email_sent: false } },
        });
    });
    await page.goto("/register");
    await page.getByLabel("Full name", { exact: true }).fill(user.name);
    await page.getByLabel("Email address", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password", { exact: true }).fill(password);
    await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    await expect(page).toHaveURL("/verify-email?delivery=failed");
    await expect(
        page.getByText("Your account is saved", { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText(/We couldn’t send your verification email/),
    ).toBeVisible();
    await expect(
        page.getByText("Check your inbox for a verification link:", {
            exact: true,
        }),
    ).toHaveCount(0);
});

test("rejects unsafe return destinations and malformed verification state", async ({
    page,
}) => {
    await page.route("**/api/login", async (route) => {
        await mockSignedInSession(page, { ...user, email_verified: true });
        await route.fulfill({ status: 204 });
    });
    await page.goto(
        "/login?returnTo=" +
            encodeURIComponent(
                "//evil.example/email/verify/7/" + "a".repeat(40),
            ),
    );
    await signIn(page);
    await expect(page).toHaveURL("/account");
    await page.route("**/api/session", (route) =>
        route.fulfill({ json: { data: { ...user, email_verified: "true" } } }),
    );
    await page.reload();
    await expect(
        page.getByRole("heading", { name: "Connection problem" }),
    ).toBeVisible();
    await expect(page.getByText(user.email, { exact: true })).toHaveCount(0);
});

test("keeps verification pages accessible with narrow viewports and enlarged text", async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await mockSignedInSession(page, {
        ...user,
        email: "a-very-long-email-address-for-testing@example.com",
    });
    for (const path of ["/verify-email", link]) {
        await page.goto(path);
        await page.evaluate(() => {
            document.documentElement.style.fontSize = "200%";
        });
        expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBe(320);
        expect(await page.evaluate(() => document.getAnimations().length)).toBe(
            0,
        );
        await checkAccessibility(page);
    }
});

test("rejects external and noncanonical return paths for existing sessions", async ({
    page,
}) => {
    await mockSignedInSession(page, { ...user, email_verified: true });
    for (const returnTo of [
        "https://evil.example" + link,
        "//evil.example" + link,
        link + "\n",
        "/api/logout",
    ]) {
        await page.goto(
            "/login?" + new URLSearchParams({ returnTo }).toString(),
        );
        await expect(page).toHaveURL("/account");
    }
    await page.goto("/email/verify/7/not-a-hash");
    await expect(
        page.getByRole("heading", { name: "Link expired or invalid" }),
    ).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Verify email", exact: true }),
    ).toHaveCount(0);
});

for (const status of [419, 503]) {
    test(`recovers from a ${String(status)} verification response through an explicit retry`, async ({
        page,
    }) => {
        await mockSignedInSession(page, user);
        let posts = 0;
        await page.route(`**/api${link}`, async (route) => {
            posts++;
            await route.fulfill({
                status,
                json: { message: "Private diagnostic" },
            });
        });
        await page.goto(link);
        await page
            .getByRole("button", { name: "Verify email", exact: true })
            .click();
        await expect(page.getByRole("alert")).toBeFocused();
        await expect(page.getByText("Private diagnostic")).toHaveCount(0);
        expect(posts).toBe(1);
        await page.route(`**/api${link}`, async (route) => {
            await mockSignedInSession(page, { ...user, email_verified: true });
            await route.fulfill({ status: 204 });
        });
        await page
            .getByRole("button", { name: "Verify email", exact: true })
            .click();
        await expect(
            page.getByRole("heading", { name: "Email verified", exact: true }),
        ).toBeVisible();
    });
}
