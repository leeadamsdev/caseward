import { test, expect } from "./fixtures";
import { checkAccessibility } from "../support/accessibility";
import { workspace } from "../../fixtures/workspaces";
import { member, invitation, memberPage } from "../../fixtures/members";

const path = `/w/${workspace.id}/members`;
test.beforeEach(async ({ page }) => {
    await page.route(`**/api/workspaces/${workspace.id}/members?*`, (route) =>
        route.fulfill({ json: memberPage([member]) }),
    );
    await page.route(
        `**/api/workspaces/${workspace.id}/invitations?*`,
        (route) => route.fulfill({ json: memberPage([invitation]) }),
    );
});

test("opens from a workspace and supports keyboard dialog dismissal and focus restoration", async ({
    page,
}) => {
    await page.goto(`/w/${workspace.id}`);
    await page.getByRole("link", { name: "View members" }).click();
    await expect(page).toHaveURL(path);
    const trigger = page.getByRole("button", { name: "Invite colleague" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Invite a colleague" });
    await expect(dialog).toBeVisible();
    await expect(
        dialog.getByRole("textbox", { name: "Email address" }),
    ).toBeFocused();
    await checkAccessibility(page);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    const revoke = page.getByRole("button", {
        name: `Revoke invitation for ${invitation.email}`,
    });
    await revoke.click();
    const revokeDialog = page.getByRole("dialog", {
        name: "Revoke invitation?",
    });
    await expect(revokeDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(revokeDialog).not.toBeVisible();
    await expect(revoke).toBeFocused();
});

test("fits mobile, long addresses, and enlarged text and provides accessible revoke confirmation", async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.route(
        `**/api/workspaces/${workspace.id}/invitations?*`,
        (route) =>
            route.fulfill({
                json: memberPage([
                    {
                        ...invitation,
                        email: "a-very-long-colleague-address@a-very-long-company-name.caseward.test",
                    },
                ]),
            }),
    );
    await page.goto(path);
    await page.addStyleTag({ content: "html { font-size: 200%; }" });
    await expect(
        page.getByRole("heading", { name: "Members", exact: true }),
    ).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
        ),
    ).toBe(false);
    await checkAccessibility(page);
    await page.getByRole("button", { name: /Revoke invitation for/ }).click();
    const dialog = page.getByRole("dialog", { name: "Revoke invitation?" });
    await expect(dialog).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
        ),
    ).toBe(false);
    await checkAccessibility(page);
    await dialog.getByRole("button", { name: "Keep invitation" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(
        page.getByRole("button", { name: /Revoke invitation for/ }),
    ).toBeFocused();
});

test("hides invitation controls and private data for members", async ({
    page,
}) => {
    await page.route(`**/api/workspaces/${workspace.id}`, (route) =>
        route.fulfill({ json: { data: { ...workspace, role: "member" } } }),
    );
    let invitationRequests = 0;
    await page.route(
        `**/api/workspaces/${workspace.id}/invitations?*`,
        (route) => {
            invitationRequests++;
            return route.fulfill({
                status: 403,
                json: { message: "Forbidden" },
            });
        },
    );
    await page.goto(path);
    await expect(
        page.getByRole("heading", { name: "Workspace members" }),
    ).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Invite colleague" }),
    ).toHaveCount(0);
    await expect(
        page.getByRole("heading", { name: "Invitations", exact: true }),
    ).toHaveCount(0);
    expect(invitationRequests).toBe(0);
    await checkAccessibility(page);
});
