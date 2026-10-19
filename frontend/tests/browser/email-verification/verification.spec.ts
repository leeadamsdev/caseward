import { expect, test } from "../fixtures";
import { checkAccessibility } from "../support/accessibility";
import { mockSignedInSession } from "../support/session";
import {
    unverifiedUser as user,
    verificationLink as link,
} from "../../fixtures/email-verification";

const password = "a long verification passphrase";

test("retains registration's restricted session and verifies only after deliberate confirmation", async ({
    page,
}) => {
    await page.route("**/api/register", async (route) => {
        expect(route.request().headers()["x-xsrf-token"]).toBe("test=token");
        await mockSignedInSession(page, user);
        await route.fulfill({
            status: 201,
            json: { data: user, meta: { verification_email_queued: true } },
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
        await expect.poll(() => posts).toBe(1);
        await page.keyboard.press("Enter");
        expect(posts).toBe(1);
    } finally {
        resume();
    }
    await expect(
        page.getByRole("heading", { name: "Email verified", exact: true }),
    ).toBeFocused();
    await checkAccessibility(page);
    await page.getByRole("link", { name: "Continue to workspaces" }).click();
    await expect(page).toHaveURL("/workspaces/new");
    await expect(
        page.getByRole("heading", { name: "Create a workspace", exact: true }),
    ).toBeVisible();
    await page.goto(link);
    await expect(
        page.getByRole("heading", { name: "Email already verified" }),
    ).toBeVisible();
    await expect(page.locator(".success-confetti")).toHaveCount(0);
    expect(posts).toBe(1);
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

test("acknowledges an initial queue failure without asking the user to register again", async ({
    page,
}) => {
    await page.route("**/api/register", async (route) => {
        await mockSignedInSession(page, user);
        await route.fulfill({
            status: 201,
            json: { data: user, meta: { verification_email_queued: false } },
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
    await expect(page).toHaveURL("/verify-email?queue=failed");
    await expect(
        page.getByText("Your account is saved", { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText(/We couldn’t queue your verification email/),
    ).toBeVisible();
    await expect(
        page.getByText("Check your inbox for a verification link:", {
            exact: true,
        }),
    ).toHaveCount(0);
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
