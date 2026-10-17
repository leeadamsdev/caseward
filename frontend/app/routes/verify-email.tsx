import { AuthShell } from "~/features/authentication/auth-shell";
import { SessionError } from "~/features/authentication/session-error";
import { VerificationWaiting } from "~/features/email-verification/verification-waiting";
import {
    waitingLoader,
    waitingAction,
} from "~/features/email-verification/verification";
import type { Route } from "./+types/verify-email";

export const clientLoader = waitingLoader;
export const clientAction = waitingAction;
export function meta() {
    return [{ title: "Verify your email | Caseward" }];
}
export default function VerifyEmail({ loaderData }: Route.ComponentProps) {
    return (
        <AuthShell>
            {loaderData.status === "error" ? (
                <SessionError />
            ) : (
                <VerificationWaiting user={loaderData.user} />
            )}
        </AuthShell>
    );
}
