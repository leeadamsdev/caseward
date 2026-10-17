import {
    apiRequest,
    rateLimit,
    requiredFields,
    responseBody,
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
    {
        name: "email",
        label: "Email address",
        type: "email",
        autoComplete: "email",
        placeholder: "you@company.com",
    },
    {
        name: "password",
        label: "Password",
        type: "password",
        autoComplete: "new-password",
        placeholder: "Create a password",
    },
    {
        name: "password_confirmation",
        label: "Confirm password",
        type: "password",
        autoComplete: "new-password",
        placeholder: "Re-enter your password",
    },
] as const;

export type RegistrationFieldName = (typeof registrationFields)[number]["name"];
export type RegistrationResult =
    { status: "created"; email: string } | FormFailure<RegistrationFieldName>;

export async function registerAccount(
    request: Request,
): Promise<RegistrationResult> {
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

    const response = await apiRequest(request, "/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
        credentials: "omit",
    });
    if (!(response instanceof Response)) return response;
    if (response.status === 429) return rateLimit(response);
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
    return user
        ? { status: "created", email: user.email }
        : { status: "error", reason: "server" };
}
