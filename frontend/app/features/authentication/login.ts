import { redirect } from "react-router";
import type { LoginRequest } from "~/generated/api/operations.schemas";
import { emailField } from "~/components/forms/email-field";
import { authReturnTo } from "./return-to";
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
        values: {
            email: values.email ?? "",
            password: values.password ?? "",
            remember: formData.get("remember") === "on",
        } satisfies LoginRequest,
    });
    if (!(response instanceof Response)) return response;
    if (response.status === 204)
        return redirect(
            authReturnTo(new URL(request.url).searchParams.get("returnTo")) ??
                "/workspaces",
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
