import { ForgotPasswordForm } from "~/features/password-recovery/forgot-password-form";
import { requestPasswordReset } from "~/features/password-recovery/forgot-password";
import type { Route } from "./+types/forgot-password";

export function meta() {
    return [{ title: "Forgot password | Caseward" }];
}

export function clientAction({ request }: Route.ClientActionArgs) {
    return requestPasswordReset(request);
}

export default function ForgotPassword() {
    return <ForgotPasswordForm />;
}
