import type { Page, Response } from "@playwright/test";

export async function sessionCookieExpiry(response: Response) {
    const cookie = (await response.headersArray()).find(
        ({ name, value }) =>
            name.toLowerCase() === "set-cookie" &&
            value.startsWith("caseward_session="),
    );
    const expires = /;\s*expires=([^;]+)/i.exec(cookie?.value ?? "")?.[1];
    const deadline = Date.parse(expires ?? "");
    if (!Number.isFinite(deadline))
        throw new Error("Response has no persistent session cookie expiry");
    return deadline;
}

export async function protectedStatus(page: Page) {
    return page.evaluate(
        async () =>
            (
                await fetch("/api/user", {
                    headers: { Accept: "application/json" },
                })
            ).status,
    );
}
