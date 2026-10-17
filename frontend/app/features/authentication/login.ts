import { redirect } from "react-router";
import { verificationPath } from "~/features/email-verification/links";
import {
    rateLimit,
    requiredFields,
    responseBody,
    sessionPost,
    validationErrors,
    type FormFailure,
} from "~/lib/api";

export const loginFields = [
    {
        name: "email",
        label: "Email address",
        type: "email",
        autoComplete: "username",
        placeholder: "you@company.com",
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
    const { values, errors } = requiredFields(
        await request.formData(),
        loginFields,
    );
    if (Object.keys(errors).length > 0) return { status: "validation", errors };
    const response = await sessionPost(request, "/api/login", values);
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
