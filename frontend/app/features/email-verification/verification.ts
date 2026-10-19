import { redirect } from "react-router";
import {
    ResendVerificationEmail202Response,
    ResendVerificationEmail503Response,
    VerifyEmail403Response,
} from "~/generated/api/operations";
import { loadSession, signOut } from "~/features/authentication/session";
import {
    rateLimit,
    responseBody,
    sessionRequest,
    retryWindow,
    type ApiFailure,
    type RateLimit,
    type RetryWindow,
} from "~/lib/api";
import { verificationPath, verificationSignIn } from "./links";

export type VerificationResult =
    | { status: "verified" | "invalid" | "account-mismatch" | "email-mismatch" }
    | ApiFailure
    | RateLimit;

export type ResendResult =
    | { status: "queued"; retry: RetryWindow }
    | RateLimit
    | {
          status: "error";
          reason: ApiFailure["reason"] | "queue";
          retry?: RetryWindow;
      };

export async function waitingAction({
    request,
}: {
    request: Request;
}): Promise<ResendResult | Response> {
    const data = await request.clone().formData();
    if (data.get("intent") === "logout") return signOut({ request });
    if (data.get("intent") !== "resend")
        return { status: "error", reason: "server" };
    const response = await sessionRequest(
        request,
        "/api/email/verification-notification",
    );
    if (!(response instanceof Response)) return response;
    if (response.status === 204) return redirect("/workspaces");
    if (response.status === 202) {
        const parsed = ResendVerificationEmail202Response.safeParse(
            await responseBody(response),
        );
        return parsed.success
            ? { status: "queued", retry: retryWindow(response) }
            : { status: "error", reason: "server" };
    }
    if (response.status === 401) {
        const value = data.get("returnTo");
        const path = verificationPath(typeof value === "string" ? value : null);
        return redirect(
            path ? verificationSignIn(path) : "/login?reason=session",
        );
    }
    if (response.status === 419) return { status: "error", reason: "expired" };
    if (response.status === 429) return rateLimit(response);
    const body = await responseBody(response);
    const failure = ResendVerificationEmail503Response.pick({
        code: true,
    }).safeParse(body);
    if (
        response.status === 503 &&
        failure.success &&
        failure.data.code === "verification_queue_unavailable"
    )
        return {
            status: "error",
            reason: "queue",
            retry: retryWindow(response),
        };
    return { status: "error", reason: "server" };
}

export async function waitingLoader({ request }: { request: Request }) {
    const session = await loadSession(request);
    if (session.status === "guest") return redirect("/login?reason=session");
    if (session.status === "authenticated") return redirect("/workspaces");
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
    const response = await sessionRequest(request, `/api${path}`);
    if (!(response instanceof Response)) return response;
    if (response.status === 204) return { status: "verified" };
    if (response.status === 401) return redirect(verificationSignIn(path));
    if (response.status === 419) return { status: "error", reason: "expired" };
    if (response.status === 429) return rateLimit(response);
    if (response.status === 403) {
        const parsed = VerifyEmail403Response.pick({ code: true }).safeParse(
            await responseBody(response),
        );
        if (parsed.success) {
            switch (parsed.data.code) {
                case "invalid_verification_link":
                    return { status: "invalid" };
                case "verification_account_mismatch":
                    return { status: "account-mismatch" };
                case "verification_email_mismatch":
                    return { status: "email-mismatch" };
            }
        }
    }
    return { status: "error", reason: "server" };
}
