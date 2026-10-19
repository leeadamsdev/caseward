import { expect, test } from "./fixtures";
import { checkAccessibility } from "../support/accessibility";
import {
    mockSignedInSession,
    mockWorkspaces as list,
} from "../support/session";
import type { WorkspaceResource as Workspace } from "../../../app/generated/api/models";
import { user } from "../../fixtures/account";
import { workspace, workspaceId as id } from "../../fixtures/workspaces";

for (const count of [0, 1]) {
    test(`routes a verified account with ${String(count)} workspaces consistently from entry pages`, async ({
        page,
    }) => {
        await list(
            page,
            Array.from({ length: count }, (_, index) => ({
                ...workspace,
                id: id(index + 1),
                name: `Support ${String(index + 1)}`,
            })),
        );
        for (const path of [
            "/",
            "/login",
            "/register",
            "/forgot-password",
            "/reset-password",
            "/verify-email",
            "/verify-email/change",
        ]) {
            await page.goto(path);
            await expect(page).toHaveURL(
                count === 0 ? "/workspaces/new" : "/workspaces",
            );
            await expect(
                page.getByRole("heading", {
                    name:
                        count === 0
                            ? "Create a workspace"
                            : "Choose a workspace",
                    exact: true,
                }),
            ).toBeVisible();
        }
        await page.reload();
        await expect(page).toHaveURL(
            count === 0 ? "/workspaces/new" : "/workspaces",
        );
        await checkAccessibility(page);
    });
}

test("keeps a successful sign-in recoverable when workspace loading fails", async ({
    page,
}) => {
    await page.unroute("**/api/session");
    let signIns = 0;
    await page.route("**/api/login", async (route) => {
        signIns++;
        await mockSignedInSession(page, user);
        await route.fulfill({ status: 204 });
    });
    await page.route("**/api/workspaces?*", (route) =>
        route.fulfill({ status: 503, json: {} }),
    );
    await page.goto("/login");
    await page.getByLabel("Email address", { exact: true }).fill(user.email);
    await page
        .getByLabel("Password", { exact: true })
        .fill("a long sign-in passphrase");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("/workspaces");
    await expect(page.getByRole("alert")).toContainText(
        "We couldn’t load your workspaces.",
    );
    await expect(
        page.getByRole("button", { name: "Create workspace", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
    await list(page, [workspace]);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(
        page.getByRole("link", { name: `Open ${workspace.name}`, exact: true }),
    ).toBeVisible();
    expect(signIns).toBe(1);
});

test("renders names as text and refuses unsafe workspace identifiers", async ({
    page,
}) => {
    const name = '<img src=x onerror="alert(1)">';
    await list(page, [{ ...workspace, name }]);
    await page.goto("/workspaces");
    await expect(
        page.getByRole("link", { name: `Open ${name}`, exact: true }),
    ).toBeVisible();
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    await list(page, [{ ...workspace, id: "https://attacker.example" }]);
    await page.reload();
    await expect(
        page.getByText("We couldn’t load your workspaces.", { exact: true }),
    ).toBeVisible();
    await expect(
        page.locator('a[href^="https://attacker.example"]'),
    ).toHaveCount(0);
});

test("opens workspaces with keyboard access and shows role information", async ({
    page,
}) => {
    const member: Workspace = {
        id: id(2),
        name: "Northstar Operations",
        role: "member",
    };
    await list(page, [workspace, member]);
    await page.route(`**/api/workspaces/${member.id}`, (route) =>
        route.fulfill({ json: { data: member } }),
    );
    await page.goto("/workspaces");
    await expect(page.getByText("Member", { exact: true })).toBeVisible();
    const link = page.getByRole("link", {
        name: `Open ${member.name}`,
        exact: true,
    });
    await link.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`/w/${member.id}`);
    await expect(
        page.getByRole("heading", { name: member.name, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Member", { exact: true })).toBeVisible();
    await checkAccessibility(page);
});

test("paginates without trusting server-supplied URLs and recovers from an out-of-range page", async ({
    page,
}) => {
    const items = Array.from({ length: 50 }, (_, index): Workspace => ({
        id: id(index + 1),
        name: `Workspace ${String(index + 1)}`,
        role: "owner",
    }));
    await list(page, items);
    await page.goto("/workspaces");
    await expect(
        page.getByRole("link", { name: /^Open Workspace / }),
    ).toHaveCount(25);
    await expect(
        page.getByRole("button", { name: "Previous", exact: true }),
    ).toBeDisabled();
    await page.getByRole("link", { name: "Next", exact: true }).click();
    await expect(page).toHaveURL("/workspaces?page=2");
    await expect(
        page.getByRole("heading", { name: "Choose a workspace" }),
    ).toBeInViewport();
    await expect(
        page.getByRole("link", { name: /^Open Workspace / }),
    ).toHaveCount(25);
    await expect(
        page.getByRole("button", { name: "Next", exact: true }),
    ).toBeDisabled();
    await page.goto("/workspaces?page=999");
    await expect(page).toHaveURL("/workspaces?page=2");
    await page.getByRole("link", { name: "Previous", exact: true }).click();
    await expect(page).toHaveURL("/workspaces");
});

test("keeps an inaccessible workspace list recoverable instead of treating it as an empty account", async ({
    page,
}) => {
    await page.route("**/api/workspaces?*", (route) => route.abort("failed"));
    await page.goto("/workspaces");
    await expect(page).toHaveURL("/workspaces");
    await expect(
        page.getByText("We couldn’t load your workspaces.", {
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Create workspace", exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByRole("link", { name: "Create a workspace", exact: true }),
    ).toHaveCount(0);
    await list(page, [workspace]);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(
        page.getByRole("link", {
            name: `Open ${workspace.name}`,
            exact: true,
        }),
    ).toBeVisible();
    await checkAccessibility(page);
});
