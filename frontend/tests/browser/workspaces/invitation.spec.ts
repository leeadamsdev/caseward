import { test, expect } from "../fixtures";
import { mockSignedInSession } from "../support/session";
import { checkAccessibility } from "../support/accessibility";
import { user } from "../../fixtures/account";
import { workspace } from "../../fixtures/workspaces";
import {
    invitationPath as path,
    invitationPreview as preview,
} from "../../fixtures/invitations";
import { withReturnTo } from "../../../app/features/authentication/return-to";
import { verificationLink } from "../../fixtures/email-verification";

test("retains the invitation when recovering from an old verification link after email correction", async ({
    page,
}) => {
    await mockSignedInSession(page, { ...user, email_verified: false });
    await page.route(`**/api${verificationLink}`, (route) =>
        route.fulfill({
            status: 403,
            json: { code: "verification_email_mismatch" },
        }),
    );
    await page.goto(path);
    await expect(
        page.getByRole("heading", { name: "Verify your email first" }),
    ).toBeVisible();
    await page.goto(verificationLink);
    await page
        .getByRole("button", { name: "Verify email", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "Your email address changed" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Back to verification" }).click();
    await expect(page).toHaveURL(withReturnTo("/verify-email", path));
});

test("keeps a guest invitation through registration, sign-in and recovery navigation without exposing details", async ({
    page,
}) => {
    let previews = 0;
    await page.route(`**/api${path}`, (route) => {
        previews++;
        return route.fulfill({
            status: 403,
            json: { code: "invitation_account_mismatch" },
        });
    });
    await page.goto(path);
    await expect(
        page.getByRole("heading", { name: "You’ve been invited" }),
    ).toBeVisible();
    await expect(page.getByText(workspace.name)).toHaveCount(0);
    await checkAccessibility(page);
    await page
        .getByRole("link", { name: "Create an account", exact: true })
        .click();
    await expect(page).toHaveURL(withReturnTo("/register", path));
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(withReturnTo("/login", path));
    await expect(
        page.getByText(/bring you back to review your invitation/),
    ).toBeVisible();
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await page.getByRole("link", { name: "Back to sign in" }).click();
    await expect(page).toHaveURL(withReturnTo("/login", path));
    expect(previews).toBe(0);
});

test("preserves unverified intent through email correction and cancellation", async ({
    page,
}) => {
    await mockSignedInSession(page, { ...user, email_verified: false });
    await page.goto(path);
    await expect(
        page.getByRole("heading", { name: "Verify your email first" }),
    ).toBeVisible();
    await checkAccessibility(page);
    await page.getByRole("link", { name: "Continue verification" }).click();
    await expect(page).toHaveURL(withReturnTo("/verify-email", path));
    await page.getByRole("button", { name: "Change email address" }).click();
    await expect(page).toHaveURL(withReturnTo("/verify-email/change", path));
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page).toHaveURL(withReturnTo("/verify-email", path));
});

test("requires explicit acceptance and renders accessible confirmation on small screens", async ({
    page,
}) => {
    await mockSignedInSession(page, user);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.route(`**/api${path}`, (route) =>
        route.fulfill({ json: { data: preview } }),
    );
    let mutations = 0;
    await page.route(`**/api${path}/accept`, (route) => {
        mutations++;
        return route.fulfill({
            json: { data: { ...workspace, role: "member" } },
        });
    });
    await page.goto(path);
    await page.addStyleTag({ content: "html {font-size:200%}" });
    await expect(
        page.getByRole("heading", { name: `Join ${workspace.name}` }),
    ).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
        ),
    ).toBe(false);
    await checkAccessibility(page);
    expect(mutations).toBe(0);
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(
        page.getByRole("heading", { name: "You’re in!" }),
    ).toBeFocused();
    await expect(
        page.getByRole("link", { name: "Open workspace" }),
    ).toHaveAttribute("href", `/w/${workspace.id}`);
    await checkAccessibility(page);
    expect(mutations).toBe(1);
});

test("switches accounts without revealing the invited workspace or address", async ({
    page,
}) => {
    await mockSignedInSession(page, user);
    await page.route(`**/api${path}`, (route) =>
        route.fulfill({
            status: 403,
            json: { code: "invitation_account_mismatch" },
        }),
    );
    await page.route("**/api/logout", async (route) => {
        await page.route("**/api/session", (next) =>
            next.fulfill({ status: 401, json: {} }),
        );
        await route.fulfill({ status: 204 });
    });
    await page.goto(path);
    await expect(
        page.getByRole("heading", { name: "Use your invited account" }),
    ).toBeVisible();
    await expect(page.getByText(user.email, { exact: false })).toBeVisible();
    await expect(page.getByText(workspace.name)).toHaveCount(0);
    await checkAccessibility(page);
    await page.getByRole("button", { name: "Switch account" }).click();
    await expect(page).toHaveURL(withReturnTo("/login", path));
});

test("refreshes stale account identity and requires another explicit acceptance", async ({
    page,
}) => {
    await mockSignedInSession(page, user);
    await page.route(`**/api${path}`, (route) =>
        route.fulfill({ json: { data: preview } }),
    );
    await page.route(`**/api${path}/accept`, async (route) => {
        await mockSignedInSession(page, {
            ...user,
            id: 8,
            name: "Other colleague",
            email: "other@caseward.test",
        });
        await page.route(`**/api${path}`, (next) =>
            next.fulfill({
                status: 403,
                json: { code: "invitation_account_mismatch" },
            }),
        );
        await route.fulfill({
            status: 409,
            json: { code: "account_context_changed" },
        });
    });
    await page.goto(path);
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(
        page.getByRole("heading", { name: "Use your invited account" }),
    ).toBeVisible();
    await expect(page.getByText(/other@caseward.test/)).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Accept invitation" }),
    ).toHaveCount(0);
    await expect(page.getByText(user.email, { exact: false })).toHaveCount(0);
});

test("shows unavailable and transient failures with clear recovery", async ({
    page,
}) => {
    await mockSignedInSession(page, user);
    await page.route(`**/api${path}`, (route) =>
        route.fulfill({ status: 410, json: {} }),
    );
    await page.goto(path);
    await expect(
        page.getByRole("heading", { name: "Invitation unavailable" }),
    ).toBeVisible();
    await checkAccessibility(page);
    await page.route(`**/api${path}`, (route) => route.abort());
    await page.reload();
    await expect(
        page.getByRole("heading", { name: "We couldn’t load the invitation" }),
    ).toBeVisible();
    await page.route(`**/api${path}`, (route) =>
        route.fulfill({ json: { data: { ...preview, accepted: true } } }),
    );
    await page.getByRole("button", { name: "Check invitation" }).click();
    await expect(
        page.getByRole("heading", { name: "Already joined" }),
    ).toBeVisible();
});
