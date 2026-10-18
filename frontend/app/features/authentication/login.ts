import { redirect } from "react-router";
import { emailField } from "~/components/forms/email-field";
import { verificationPath } from "~/features/email-verification/links";
import {
    rateLimit,
    requiredFields,
    responseBody,
    sessionRequest,
    validationErrors,
    type FormFailure,
} from "~/lib/api";

export const loginFields = [
    {
        ...emailField,
        autoComplete: "username",
    },
    {
        name: "password",
        label: "Password",
        type: "password",
        autoComplete: "current-password",
        placeholder: "Enter your password",
    },
] as const;

export type LoginResult = FormFailure<(typeof loginFields)[number]["name"]>;

export async function signIn(
    request: Request,
): Promise<LoginResult | Response> {
    const formData = await request.formData();
    const { values, errors } = requiredFields(formData, loginFields);
    if (Object.keys(errors).length > 0) return { status: "validation", errors };
    const response = await sessionRequest(request, "/api/login", {
        values: { ...values, remember: formData.get("remember") === "on" },
    });
    if (!(response instanceof Response)) return response;
    if (response.status === 204)
        return redirect(
            verificationPath(
                new URL(request.url).searchParams.get("returnTo"),
            ) ?? "/account",
        );
    if (response.status === 429) return rateLimit(response);
    if (response.status === 419) return { status: "error", reason: "expired" };
    if (response.status === 422) {
        const errors = validationErrors(
            await responseBody(response),
            loginFields,
        );
        if (errors) return { status: "validation", errors };
    }
    return { status: "error", reason: "server" };
}
