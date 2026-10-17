import { redirect } from "react-router";
import {
    apiRequest,
    isRecord,
    responseBody,
    sessionPost,
    type ApiFailure,
} from "~/lib/api";

export type User = { id: number; name: string; email: string };
export type SessionResult =
    { status: "authenticated"; user: User } | { status: "guest" } | ApiFailure;

export function parseUser(value: unknown): User | undefined {
    if (!isRecord(value) || !isRecord(value.data)) return;
    const { id, name, email } = value.data;
    if (
        typeof id === "number" &&
        Number.isSafeInteger(id) &&
        id > 0 &&
        typeof name === "string" &&
        name.trim() &&
        typeof email === "string" &&
        email.trim()
    )
        return { id, name, email };
}

export async function loadSession(request: Request): Promise<SessionResult> {
    const response = await apiRequest(request, "/api/user");
    if (!(response instanceof Response)) return response;
    if (response.status === 401) return { status: "guest" };
    if (response.status === 200) {
        const user = parseUser(await responseBody(response));
        if (user) return { status: "authenticated", user };
    }
    return { status: "error", reason: "server" };
}

export async function guestLoader({ request }: { request: Request }) {
    const session = await loadSession(request);
    return session.status === "authenticated" ? redirect("/account") : session;
}

export async function accountLoader({ request }: { request: Request }) {
    const session = await loadSession(request);
    return session.status === "guest"
        ? redirect("/login?reason=session")
        : session;
}

export async function signOut({ request }: { request: Request }) {
    const response = await sessionPost(request, "/api/logout");
    if (!(response instanceof Response)) return response;
    if (response.status === 204 || response.status === 401)
        return redirect("/login");
    return {
        status: "error",
        reason: response.status === 419 ? "expired" : "server",
    } satisfies ApiFailure;
}
