import { AuthShell } from "~/features/authentication/auth-shell";
import { SessionError } from "~/features/authentication/session-error";
import { ChangeEmailForm } from "~/features/email-verification/change-email-form";
import { changeEmail } from "~/features/email-verification/change-email";
import { waitingLoader } from "~/features/email-verification/verification";
import type { Route } from "./+types/change-email";

export const clientLoader = waitingLoader;
export const clientAction = changeEmail;

export function meta() {
    return [{ title: "Change email address | Caseward" }];
}

export default function ChangeEmail({ loaderData }: Route.ComponentProps) {
    return (
        <AuthShell>
            {loaderData.status === "error" ? (
                <SessionError />
            ) : (
                <ChangeEmailForm
                    key={loaderData.user.id}
                    user={loaderData.user}
                />
            )}
        </AuthShell>
    );
}
