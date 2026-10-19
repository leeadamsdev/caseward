import { redirect } from "react-router";
import {
    UserResource,
    type UserResource as User,
} from "~/generated/api/operations.schemas";
import { GetSession200Response } from "~/generated/api/operations";
import { authReturnTo, withReturnTo } from "./return-to";
import { forgetInvitation } from "~/features/workspace-invitations/continuation";
import {
    apiRequest,
    responseBody,
    sessionRequest,
    type ApiFailure,
} from "~/lib/api";

// The interface cannot safely display blank identities or nonpositive account IDs.
export const userSchema = UserResource.refine(
    (user) =>
        user.id > 0 && Boolean(user.name.trim()) && Boolean(user.email.trim()),
);
const sessionSchema = GetSession200Response.extend({ data: userSchema });
export type SessionResult =
    | { status: "authenticated" | "unverified"; user: User }
    | { status: "guest" }
    | ApiFailure;

export async function loadSession(request: Request): Promise<SessionResult> {
    const response = await apiRequest(request, "/api/session");
    if (!(response instanceof Response)) return response;
    if (response.status === 401) return { status: "guest" };
    if (response.status === 200) {
        const parsed = sessionSchema.safeParse(await responseBody(response));
        if (parsed.success) {
            const user = parsed.data.data;
            return {
                status: user.email_verified ? "authenticated" : "unverified",
                user,
            };
        }
    }
    return { status: "error", reason: "server" };
}

export async function guestLoader({ request }: { request: Request }) {
    const session = await loadSession(request);
    if (session.status === "guest" || session.status === "error")
        return session;
    const returnTo = authReturnTo(
        new URL(request.url).searchParams.get("returnTo"),
    );
    return redirect(
        returnTo ??
            (session.status === "unverified" ? "/verify-email" : "/workspaces"),
    );
}

export async function verifiedSessionLoader({ request }: { request: Request }) {
    const session = await loadSession(request);
    if (session.status === "guest") return redirect("/login?reason=session");
    if (session.status === "unverified") return redirect("/verify-email");
    return session;
}

export async function signOut({ request }: { request: Request }) {
    const value = (await request.formData()).get("returnTo");
    const returnTo = authReturnTo(typeof value === "string" ? value : null);
    const response = await sessionRequest(request, "/api/logout");
    if (!(response instanceof Response)) return response;
    if (response.status === 204 || response.status === 401) {
        forgetInvitation();
        return redirect(withReturnTo("/login", returnTo));
    }
    return {
        status: "error",
        reason: response.status === 419 ? "expired" : "server",
    } satisfies ApiFailure;
}
