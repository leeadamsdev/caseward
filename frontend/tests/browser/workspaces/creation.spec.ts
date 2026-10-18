import { expect, test } from "./fixtures";
import { checkAccessibility } from "../support/accessibility";
import {
    mockSignedInSession,
    mockWorkspaces as list,
} from "../support/session";
import { user } from "../../fixtures/account";
import { workspace } from "../../fixtures/workspaces";

test("can create another workspace without redirecting or interpreting unrelated query parameters", async ({
    page,
}) => {
    await list(page, [workspace]);
    await page.goto("/workspaces/new?page=999");
    await expect(page).toHaveURL("/workspaces/new?page=999");
    await expect(
        page.getByLabel("Workspace name", { exact: true }),
    ).toBeVisible();
    await page
        .getByRole("link", { name: "Back to workspaces", exact: true })
        .click();
    await expect(page).toHaveURL("/workspaces");
});

test("routes a new account into creation and opens the real workspace destination", async ({
    page,
}) => {
    let requests = 0;
    let release = () => {};
    const pending = new Promise<void>((resolve) => {
        release = resolve;
    });
    await page.route("**/api/workspaces", async (route) => {
        requests++;
        expect(route.request().postDataJSON()).toEqual({
            name: "Acme Support",
            account_id: "7",
        });
        expect(route.request().headers()["x-xsrf-token"]).toBe("test=token");
        await pending;
        await list(page, [workspace]);
        await route.fulfill({ status: 201, json: { data: workspace } });
    });
    await page.goto("/workspaces");
    await expect(page).toHaveURL("/workspaces/new");
    await expect(page).toHaveTitle("Create a workspace | Caseward");
    await expect(
        page.getByText("You’ll be the workspace owner.", { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole("link", { name: "Back to workspaces" }),
    ).toHaveCount(0);
    await expect(page.getByText(user.email, { exact: true })).toBeVisible();
    await checkAccessibility(page);
    await page
        .getByLabel("Workspace name", { exact: true })
        .fill(workspace.name);
    await page
        .getByRole("button", { name: "Create workspace", exact: true })
        .click();
    try {
        await expect(
            page.getByRole("button", {
                name: "Creating workspace…",
                exact: true,
            }),
        ).toBeDisabled();
        await expect(
            page.getByLabel("Workspace name", { exact: true }),
        ).toBeDisabled();
        await expect(
            page.getByRole("button", { name: "Sign out", exact: true }),
        ).toBeDisabled();
        await expect.poll(() => requests).toBe(1);
        await page.keyboard.press("Enter");
        expect(requests).toBe(1);
    } finally {
        release();
    }
    await expect(page).toHaveURL(`/w/${workspace.id}`);
    await expect(
        page.getByRole("heading", { name: workspace.name, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Owner", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page).toHaveTitle(`${workspace.name} | Caseward`);
    await page
        .getByRole("link", { name: "Choose a workspace", exact: true })
        .click();
    await expect(
        page.getByRole("link", { name: `Open ${workspace.name}`, exact: true }),
    ).toBeVisible();
    await checkAccessibility(page);
    expect(requests).toBe(1);
});

test("validates locally and preserves backend validation, hints and the entered name", async ({
    page,
}) => {
    await list(page, [workspace]);
    await page.goto("/workspaces/new");
    await expect(
        page.getByRole("link", { name: "Back to workspaces", exact: true }),
    ).toBeVisible();
    const name = page.getByLabel("Workspace name", { exact: true });
    await page
        .getByRole("button", { name: "Create workspace", exact: true })
        .click();
    await expect(name).toBeFocused();
    await expect(name).toHaveAccessibleDescription(
        /Workspace name is required/,
    );
    await name.fill("  Équipe 東京  ");
    await page.route("**/api/workspaces", (route) => {
        expect(route.request().postDataJSON()).toEqual({
            name: "  Équipe 東京  ",
            account_id: "7",
        });
        return route.fulfill({
            status: 422,
            json: {
                errors: {
                    name: ["The name may not be greater than 100 characters."],
                },
            },
        });
    });
    await page
        .getByRole("button", { name: "Create workspace", exact: true })
        .click();
    await expect(name).toBeFocused();
    await expect(name).toHaveValue("  Équipe 東京  ");
    await expect(name).toHaveAccessibleDescription(
        /Use your business or team name.*100 characters/,
    );
    await checkAccessibility(page);
});

test("focuses an accessible expired-token error without losing the workspace name", async ({
    page,
}) => {
    await page.route("**/api/workspaces", (route) =>
        route.fulfill({ status: 419, json: {} }),
    );
    await page.goto("/workspaces/new");
    await page
        .getByLabel("Workspace name", { exact: true })
        .fill(workspace.name);
    await page
        .getByRole("button", { name: "Create workspace", exact: true })
        .click();
    await expect(page.getByRole("alert")).toBeFocused();
    await expect(
        page.getByLabel("Workspace name", { exact: true }),
    ).toHaveValue(workspace.name);
    await checkAccessibility(page);
});

test("finds a created workspace after its response is interrupted without sending another creation", async ({
    page,
}) => {
    let requests = 0;
    await page.route("**/api/workspaces", async (route) => {
        requests++;
        await list(page, [workspace]);
        await route.abort("failed");
    });
    await page.goto("/workspaces/new");
    await page
        .getByLabel("Workspace name", { exact: true })
        .fill(workspace.name);
    await page
        .getByRole("button", { name: "Create workspace", exact: true })
        .click();
    await expect(page.getByRole("alert")).toBeFocused();
    await checkAccessibility(page);
    await page
        .getByRole("link", { name: "Check workspaces", exact: true })
        .click();
    await page
        .getByRole("link", { name: `Open ${workspace.name}`, exact: true })
        .click();
    await expect(page).toHaveURL(`/w/${workspace.id}`);
    expect(requests).toBe(1);
});

test("retains failed form input during a session outage", async ({ page }) => {
    await page.goto("/workspaces/new");
    await page
        .getByLabel("Workspace name", { exact: true })
        .fill(workspace.name);
    await page.route("**/api/session", (route) =>
        route.fulfill({ status: 503, json: {} }),
    );
    await page.route("**/api/workspaces", (route) =>
        route.fulfill({ status: 503, json: {} }),
    );
    await page
        .getByRole("button", { name: "Create workspace", exact: true })
        .click();
    await expect(page.getByRole("alert")).toBeFocused();
    await expect(
        page.getByLabel("Workspace name", { exact: true }),
    ).toHaveValue(workspace.name);
});

for (const state of ["guest", "unverified"] as const) {
    test(`handles a session becoming ${state} during creation`, async ({
        page,
    }) => {
        await page.goto("/workspaces/new");
        await page.route("**/api/workspaces", async (route) => {
            await page.route("**/api/session", (session) =>
                session.fulfill(
                    state === "guest"
                        ? { status: 401, json: {} }
                        : {
                              json: {
                                  data: { ...user, email_verified: false },
                              },
                          },
                ),
            );
            await route.fulfill({
                status: state === "guest" ? 401 : 403,
                json: { code: "email_unverified" },
            });
        });
        await page
            .getByLabel("Workspace name", { exact: true })
            .fill(workspace.name);
        await page
            .getByRole("button", { name: "Create workspace", exact: true })
            .click();
        await expect(page).toHaveURL(
            state === "guest" ? "/login?reason=session" : "/verify-email",
        );
    });
}

test("resets a stale form when another tab switches the account", async ({
    page,
}) => {
    await page.goto("/workspaces/new");
    await page
        .getByLabel("Workspace name", { exact: true })
        .fill("Private workspace");
    await page.route("**/api/workspaces", async (route) => {
        expect(route.request().postDataJSON()).toEqual({
            name: "Private workspace",
            account_id: "7",
        });
        await mockSignedInSession(page, {
            ...user,
            id: 8,
            email: "other@example.com",
        });
        await route.fulfill({
            status: 409,
            json: { code: "account_context_changed" },
        });
    });
    await page
        .getByRole("button", { name: "Create workspace", exact: true })
        .click();
    await expect(page).toHaveURL("/workspaces/new?account=changed");
    await expect(
        page.getByText("Your signed-in account changed", { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText("other@example.com", { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByLabel("Workspace name", { exact: true }),
    ).toHaveValue("");
});
