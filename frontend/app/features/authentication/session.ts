import { redirect } from "react-router";
import {
    verificationPath,
    verificationSignIn,
} from "~/features/email-verification/links";
import {
    apiRequest,
    isRecord,
    responseBody,
    sessionRequest,
    type ApiFailure,
} from "~/lib/api";

export type User = {
    id: number;
    name: string;
    email: string;
    email_verified: boolean;
};
export type SessionResult =
    | { status: "authenticated" | "unverified"; user: User }
    | { status: "guest" }
    | ApiFailure;

export function parseUser(value: unknown): User | undefined {
    if (!isRecord(value) || !isRecord(value.data)) return;
    const { id, name, email, email_verified } = value.data;
    if (
        typeof id === "number" &&
        Number.isSafeInteger(id) &&
        id > 0 &&
        typeof name === "string" &&
        name.trim() &&
        typeof email === "string" &&
        email.trim() &&
        typeof email_verified === "boolean"
    )
        return { id, name, email, email_verified };
}

export async function loadSession(request: Request): Promise<SessionResult> {
    const response = await apiRequest(request, "/api/session");
    if (!(response instanceof Response)) return response;
    if (response.status === 401) return { status: "guest" };
    if (response.status === 200) {
        const user = parseUser(await responseBody(response));
        if (user)
            return {
                status: user.email_verified ? "authenticated" : "unverified",
                user,
            };
    }
    return { status: "error", reason: "server" };
}

export async function guestLoader({ request }: { request: Request }) {
    const session = await loadSession(request);
    if (session.status === "guest" || session.status === "error")
        return session;
    const returnTo = verificationPath(
        new URL(request.url).searchParams.get("returnTo"),
    );
    return redirect(
        returnTo ??
            (session.status === "unverified" ? "/verify-email" : "/account"),
    );
}

export async function accountLoader({ request }: { request: Request }) {
    const session = await loadSession(request);
    if (session.status === "guest") return redirect("/login?reason=session");
    if (session.status === "unverified") return redirect("/verify-email");
    return session;
}

export async function signOut({ request }: { request: Request }) {
    const value = (await request.formData()).get("returnTo");
    const returnTo = verificationPath(typeof value === "string" ? value : null);
    const response = await sessionRequest(request, "/api/logout");
    if (!(response instanceof Response)) return response;
    if (response.status === 204 || response.status === 401)
        return redirect(verificationSignIn(returnTo));
    return {
        status: "error",
        reason: response.status === 419 ? "expired" : "server",
    } satisfies ApiFailure;
}
