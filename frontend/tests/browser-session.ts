import type { Page } from "@playwright/test";
import type { User } from "../app/features/authentication/session";
import type { Workspace } from "../app/features/workspaces/workspaces";

export async function mockWorkspaces(page: Page, items: Workspace[] = []) {
    await page.route("**/api/workspaces?*", (route) => {
        const current = Number(
            new URL(route.request().url()).searchParams.get("page"),
        );
        return route.fulfill({
            json: {
                data: items.slice((current - 1) * 25, current * 25),
                meta: {
                    current_page: current,
                    last_page: Math.max(1, Math.ceil(items.length / 25)),
                    total: items.length,
                },
            },
        });
    });
}

export async function mockBrowserSession(page: Page) {
    // Never let an unexpected API call reach a real backend during browser tests.
    await page.route("**/api/**", async (route) => {
        const request = route.request();
        if (
            new URL(request.url()).pathname === "/api/session" &&
            request.method() === "GET"
        ) {
            await route.fulfill({
                status: 401,
                json: { message: "Unauthenticated." },
            });
            return;
        }
        await route.abort("blockedbyclient");
        throw new Error(
            `Unexpected API request: ${request.method()} ${request.url()}`,
        );
    });
    await page.route("**/sanctum/csrf-cookie", (route) =>
        route.fulfill({
            status: 204,
            headers: {
                "Set-Cookie": "XSRF-TOKEN=test%3Dtoken; Path=/; SameSite=Lax",
            },
        }),
    );
    await mockWorkspaces(page);
}

export async function mockSignedInSession(page: Page, user: User) {
    await page.route("**/api/session", (route) =>
        route.fulfill({ json: { data: user } }),
    );
}
