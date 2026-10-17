import { redirect } from "react-router";
import { loadSession, signOut } from "~/features/authentication/session";
import {
    isRecord,
    rateLimit,
    responseBody,
    sessionPost,
    type ApiFailure,
    type RateLimit,
} from "~/lib/api";
import { verificationPath, verificationSignIn } from "./links";

export type VerificationResult =
    | { status: "verified" | "invalid" | "account-mismatch" | "email-mismatch" }
    | ApiFailure
    | RateLimit;

export async function waitingLoader({ request }: { request: Request }) {
    const session = await loadSession(request);
    if (session.status === "guest") return redirect("/login?reason=session");
    if (session.status === "authenticated") return redirect("/account");
    return session;
}

export async function verificationLoader({ request }: { request: Request }) {
    const url = new URL(request.url);
    const path = verificationPath(url.pathname + url.search);
    if (!path) return { status: "invalid" as const };
    const session = await loadSession(request);
    if (session.status === "guest") return redirect(verificationSignIn(path));
    return { ...session, path };
}

export async function verifyEmail({
    request,
}: {
    request: Request;
}): Promise<VerificationResult | Response> {
    const intent = (await request.clone().formData()).get("intent");
    if (intent === "logout") return signOut({ request });
    const url = new URL(request.url);
    const path = verificationPath(url.pathname + url.search);
    if (!path) return { status: "invalid" };
    if (intent !== "verify") return { status: "error", reason: "server" };

    // Preserve the signed query verbatim; opening a link never mutates the account.
    const response = await sessionPost(request, `/api${path}`);
    if (!(response instanceof Response)) return response;
    if (response.status === 204) return { status: "verified" };
    if (response.status === 401) return redirect(verificationSignIn(path));
    if (response.status === 419) return { status: "error", reason: "expired" };
    if (response.status === 429) return rateLimit(response);
    if (response.status === 403) {
        const body = await responseBody(response);
        if (isRecord(body)) {
            if (body.code === "invalid_verification_link")
                return { status: "invalid" };
            if (body.code === "verification_account_mismatch")
                return { status: "account-mismatch" };
            if (body.code === "verification_email_mismatch")
                return { status: "email-mismatch" };
        }
    }
    return { status: "error", reason: "server" };
}
