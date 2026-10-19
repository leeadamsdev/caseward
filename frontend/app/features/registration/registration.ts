import { redirect } from "react-router";
import { emailField } from "~/components/forms/email-field";
import { newPasswordFields } from "~/components/forms/new-password-fields";
import {
    rateLimit,
    requiredFields,
    responseBody,
    sessionRequest,
    validationErrors,
    type FormFailure,
} from "~/lib/api";
import { userSchema } from "~/features/authentication/session";
import { Register201Response } from "~/generated/api/operations";
import type { RegisterRequest } from "~/generated/api/models";

const registrationSchema = Register201Response.extend({ data: userSchema });

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

type RegistrationFieldName = (typeof registrationFields)[number]["name"];
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

    const payload = {
        name: values.name ?? "",
        email: values.email ?? "",
        password: values.password ?? "",
        password_confirmation: values.password_confirmation ?? "",
    } satisfies RegisterRequest;
    const response = await sessionRequest(request, "/api/register", {
        values: payload,
    });
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
    const parsed = registrationSchema.safeParse(body);
    if (!parsed.success) return { status: "error", reason: "server" };
    const { data: user, meta } = parsed.data;
    return redirect(
        user.email_verified
            ? "/workspaces"
            : meta.verification_email_sent
              ? "/verify-email"
              : "/verify-email?delivery=failed",
    );
}
