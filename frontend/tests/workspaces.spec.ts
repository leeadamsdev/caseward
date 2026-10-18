import { expect, test } from "@playwright/test";
import { checkAccessibility } from "./accessibility";
import {
    mockBrowserSession,
    mockSignedInSession,
    mockWorkspaces as list,
} from "./browser-session";
import type { Workspace } from "../app/features/workspaces/workspaces";

const user = {
    id: 7,
    name: "Alex Chen",
    email: "alex.chen@example.com",
    email_verified: true,
};
const id = (number: number) =>
    `01${"0".repeat(22)}${String(number).padStart(2, "0")}`;
const workspace: Workspace = { id: id(1), name: "Acme Support", role: "owner" };

test.use({ reducedMotion: "reduce" });
test.beforeEach(async ({ page }) => {
    await mockBrowserSession(page);
    await mockSignedInSession(page, user);
    await page.route(`**/api/workspaces/${workspace.id}`, (route) =>
        route.fulfill({ json: { data: workspace } }),
    );
});
test.afterEach(async ({ page }) => {
    expect(await page.pageErrors()).toEqual([]);
});

for (const count of [0, 1, 2]) {
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
    let release: (() => void) | undefined;
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
    await expect(
        page.getByRole("button", { name: "Creating workspace…", exact: true }),
    ).toBeDisabled();
    await expect(
        page.getByLabel("Workspace name", { exact: true }),
    ).toBeDisabled();
    await expect(
        page.getByRole("button", { name: "Sign out", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Enter");
    expect(requests).toBe(1);
    release?.();
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

test("keeps the name through a cooldown and removes the warning when it ends", async ({
    page,
}) => {
    await page.clock.install();
    let requests = 0;
    await page.route("**/api/workspaces", (route) => {
        requests++;
        return route.fulfill({
            status: 429,
            headers: { "Retry-After": "2" },
            json: {},
        });
    });
    await page.goto("/workspaces/new");
    await page
        .getByLabel("Workspace name", { exact: true })
        .fill(workspace.name);
    await page
        .getByRole("button", { name: "Create workspace", exact: true })
        .click();
    await expect(
        page.getByText("Too many attempts", { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByLabel("Workspace name", { exact: true }),
    ).toBeDisabled();
    await expect(
        page.getByRole("button", { name: "Sign out", exact: true }),
    ).toBeEnabled();
    await page.clock.fastForward(3_000);
    await expect(
        page.getByText("Too many attempts", { exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByLabel("Workspace name", { exact: true }),
    ).toHaveValue(workspace.name);
    await expect(
        page.getByLabel("Workspace name", { exact: true }),
    ).toBeEnabled();
    expect(requests).toBe(1);
    await checkAccessibility(page);
});

for (const failure of [
    "network",
    "server",
    "malformed",
    "wrong-role",
    "csrf",
    "expired",
] as const) {
    test(`recovers from ${failure} creation failure without replaying the request`, async ({
        page,
    }) => {
        let requests = 0;
        await page.route("**/api/workspaces", (route) => {
            requests++;
            if (failure === "network") return route.abort("failed");
            return route.fulfill({
                status:
                    failure === "expired"
                        ? 419
                        : failure === "server"
                          ? 503
                          : 201,
                json:
                    failure === "wrong-role"
                        ? { data: { ...workspace, role: "member" } }
                        : {},
            });
        });
        if (failure === "csrf")
            await page.route("**/sanctum/csrf-cookie", (route) =>
                route.fulfill({ status: 503 }),
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
        expect(requests).toBe(failure === "csrf" ? 0 : 1);
        if (failure !== "expired")
            await expect(
                page.getByRole("link", {
                    name: "Check workspaces",
                    exact: true,
                }),
            ).toBeVisible();
        await checkAccessibility(page);
    });
}

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

for (const failure of ["server", "network", "malformed"] as const) {
    test(`never treats a ${failure} list failure as an empty account and supports retry`, async ({
        page,
    }) => {
        await page.route("**/api/workspaces?*", (route) =>
            failure === "network"
                ? route.abort("failed")
                : route.fulfill({
                      status: failure === "server" ? 503 : 200,
                      json: {},
                  }),
        );
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
        await page
            .getByRole("button", { name: "Try again", exact: true })
            .click();
        await expect(
            page.getByRole("link", {
                name: `Open ${workspace.name}`,
                exact: true,
            }),
        ).toBeVisible();
    });
}

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

test("brings the destination heading into view when leaving a long workspace list", async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await list(page, [
        ...Array.from({ length: 24 }, (_, index) => ({
            ...workspace,
            id: id(index + 2),
            name: `Support ${String(index + 2)}`,
        })),
        workspace,
    ]);
    await page.goto("/workspaces");
    await page.addStyleTag({ content: "html { font-size: 200%; }" });
    await page
        .getByRole("link", { name: "Create a workspace", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "Create a workspace", exact: true }),
    ).toBeInViewport();
    await page
        .getByRole("link", { name: "Back to workspaces", exact: true })
        .click();
    await page
        .getByRole("link", { name: `Open ${workspace.name}`, exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: workspace.name, exact: true }),
    ).toBeInViewport();
});

test("fits narrow viewports and enlarged text with reduced motion", async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await list(page, [
        {
            ...workspace,
            name: "Équipe de support et opérations clientèle 東京".repeat(2),
        },
    ]);
    for (const path of [
        "/workspaces",
        "/workspaces/new",
        `/w/${workspace.id}`,
    ]) {
        await page.goto(path);
        await page.addStyleTag({ content: "html { font-size: 200%; }" });
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth,
            ),
        ).toBe(false);
        expect(await page.evaluate(() => document.getAnimations().length)).toBe(
            0,
        );
        await checkAccessibility(page);
    }
});
