import { expect, test } from "../fixtures";
import { checkAccessibility } from "../support/accessibility";
import { mockSignedInSession } from "../support/session";
import {
    unverifiedUser as user,
    verificationLink as link,
} from "../../fixtures/email-verification";
import { signIn } from "../../support/forms";

const password = "a long verification passphrase";

test("routes unverified sign-ins and protected pages to verification", async ({
    page,
}) => {
    await page.route("**/api/login", async (route) => {
        await mockSignedInSession(page, user);
        await route.fulfill({ status: 204 });
    });
    await page.goto("/login");
    await signIn(page, { email: user.email, password });
    await expect(page).toHaveURL("/verify-email");
    for (const path of ["/workspaces", "/register", "/login"]) {
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
    await expect(page).toHaveURL("/workspaces/new");
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
    await signIn(page, { email: user.email, password });
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
    await signIn(page, { email: user.email, password });
    await expect(page).toHaveURL("/workspaces/new");
    await page.route("**/api/session", (route) =>
        route.fulfill({ json: { data: { ...user, email_verified: "true" } } }),
    );
    await page.reload();
    await expect(
        page.getByRole("heading", { name: "Connection problem" }),
    ).toBeVisible();
    await expect(page.getByText(user.email, { exact: true })).toHaveCount(0);
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
        await expect(page).toHaveURL("/workspaces/new");
    }
    await page.goto("/email/verify/7/not-a-hash");
    await expect(
        page.getByRole("heading", { name: "Link expired or invalid" }),
    ).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Verify email", exact: true }),
    ).toHaveCount(0);
});
