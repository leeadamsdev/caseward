import { expect, test } from "./fixtures";
import { checkAccessibility } from "../support/accessibility";
import { mockWorkspaces as list } from "../support/session";
import { user } from "../../fixtures/account";
import { workspace } from "../../fixtures/workspaces";

for (const path of ["/workspaces", "/workspaces/new", `/w/${workspace.id}`]) {
    for (const verified of ["guest", "unverified"] as const) {
        test(`guards ${path} against a ${verified} session`, async ({
            page,
        }) => {
            await page.route("**/api/session", (route) =>
                route.fulfill(
                    verified === "guest"
                        ? { status: 401, json: {} }
                        : {
                              json: {
                                  data: { ...user, email_verified: false },
                              },
                          },
                ),
            );
            await page.goto(path);
            await expect(page).toHaveURL(
                verified === "guest"
                    ? "/login?reason=session"
                    : "/verify-email",
            );
        });
    }
}

test("handles missing and revoked workspace access without exposing its data", async ({
    page,
}) => {
    await page.goto(`/w/${workspace.id}`);
    await expect(
        page.getByRole("heading", { name: workspace.name, exact: true }),
    ).toBeVisible();
    await page.route(`**/api/workspaces/${workspace.id}`, (route) =>
        route.fulfill({ status: 404, json: {} }),
    );
    await page.reload();
    await expect(
        page.getByRole("heading", {
            name: "Workspace unavailable",
            exact: true,
        }),
    ).toBeVisible();
    await expect(page.getByText(workspace.name, { exact: true })).toHaveCount(
        0,
    );
    await page.goto("/w/not-an-id");
    await expect(
        page.getByRole("heading", {
            name: "Workspace unavailable",
            exact: true,
        }),
    ).toBeVisible();
    await page
        .getByRole("link", { name: "Choose a workspace", exact: true })
        .click();
    await expect(page).toHaveURL("/workspaces/new");
    await checkAccessibility(page);
});

for (const path of ["/workspaces", "/workspaces/new", `/w/${workspace.id}`]) {
    test(`keeps signing out recoverable from ${path}`, async ({ page }) => {
        await list(page, [workspace]);
        await page.goto(path);
        await page.route("**/api/logout", (route) =>
            route.fulfill({ status: 503, json: {} }),
        );
        await page
            .getByRole("button", { name: "Sign out", exact: true })
            .click();
        await expect(
            page.getByText("We couldn’t confirm you were signed out.", {
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Sign out", exact: true }),
        ).toBeEnabled();
        await expect(page.getByRole("alert")).toBeFocused();
        await page.route("**/api/logout", async (route) => {
            await page.route("**/api/session", (session) =>
                session.fulfill({ status: 401, json: {} }),
            );
            await route.fulfill({ status: 204 });
        });
        await page
            .getByRole("button", { name: "Sign out", exact: true })
            .click();
        await expect(page).toHaveURL("/login");
    });
}
