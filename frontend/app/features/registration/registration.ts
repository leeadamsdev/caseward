import { redirect } from "react-router";
import { emailField } from "~/components/forms/email-field";
import { newPasswordFields } from "~/components/forms/new-password-fields";
import {
    isRecord,
    rateLimit,
    requiredFields,
    responseBody,
    sessionRequest,
    validationErrors,
    type FormFailure,
} from "~/lib/api";
import { parseUser } from "~/features/authentication/session";

export const registrationFields = [
    {
        name: "name",
        label: "Full name",
        type: "text",
        autoComplete: "name",
        placeholder: "e.g. Alex Chen",
    },
    emailField,
    ...newPasswordFields,
] as const;

export type RegistrationFieldName = (typeof registrationFields)[number]["name"];
export type RegistrationResult = FormFailure<RegistrationFieldName>;

export async function registerAccount(
    request: Request,
): Promise<RegistrationResult | Response> {
    const { values, errors } = requiredFields(
        await request.formData(),
        registrationFields,
    );
    if (
        !errors.password &&
        !errors.password_confirmation &&
        values.password !== values.password_confirmation
    )
        errors.password_confirmation = ["Passwords do not match."];
    if (Object.keys(errors).length > 0) return { status: "validation", errors };

    const response = await sessionRequest(request, "/api/register", { values });
    if (!(response instanceof Response)) return response;
    if (response.status === 429) return rateLimit(response);
    if (response.status === 419) return { status: "error", reason: "expired" };
    if (response.status !== 201 && response.status !== 422)
        return { status: "error", reason: "server" };
    const body = await responseBody(response);
    if (response.status === 422) {
        const errors = validationErrors(body, registrationFields);
        return errors
            ? { status: "validation", errors }
            : { status: "error", reason: "server" };
    }
    const user = parseUser(body);
    if (
        !user ||
        !isRecord(body) ||
        !isRecord(body.meta) ||
        typeof body.meta.verification_email_sent !== "boolean"
    )
        return { status: "error", reason: "server" };
    return redirect(
        user.email_verified
            ? "/account"
            : body.meta.verification_email_sent
              ? "/verify-email"
              : "/verify-email?delivery=failed",
    );
}
