import { ResetPasswordForm } from "~/features/password-recovery/reset-password-form";
import { resetLink } from "~/features/password-recovery/reset-link";
import { resetPassword } from "~/features/password-recovery/reset-password";
import type { Route } from "./+types/reset-password";

export function meta() {
    return [{ title: "Reset password | Caseward" }];
}

export function clientLoader({ request }: Route.ClientLoaderArgs) {
    return resetLink(new URL(request.url)) ?? null;
}

export function clientAction({ request }: Route.ClientActionArgs) {
    return resetPassword(request);
}

export default function ResetPassword({ loaderData }: Route.ComponentProps) {
    return (
        <ResetPasswordForm
            key={
                loaderData
                    ? `${loaderData.token}:${loaderData.email}`
                    : "invalid"
            }
            link={loaderData ?? undefined}
        />
    );
}
