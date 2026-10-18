import { newPasswordFields } from "~/components/forms/new-password-fields";
import { guestLoader } from "~/features/authentication/session";
import {
    isRecord,
    rateLimit,
    requiredFields,
    responseBody,
    sessionRequest,
    validationErrors,
    type FormFailure,
} from "~/lib/api";

export const resetFields = [
    {
        ...newPasswordFields[0],
        label: "New password",
        placeholder: "Enter a new password",
    },
    { ...newPasswordFields[1], label: "Confirm new password" },
] as const;

export type ResetLink = { token: string; email: string };
export type ResetResult =
    | FormFailure<(typeof resetFields)[number]["name"]>
    | { status: "reset" }
    | { status: "invalid" };

export function resetLink(url: URL): ResetLink | undefined {
    const token = /^\/reset-password\/([a-f0-9]{64})$/.exec(url.pathname)?.[1];
    const addresses = url.searchParams.getAll("email");
    const email = addresses[0];
    if (
        !token ||
        addresses.length !== 1 ||
        !email?.trim() ||
        email.length > 254 ||
        email.includes("\0")
    )
        return;
    return { token, email };
}

export async function resetPassword(
    request: Request,
): Promise<ResetResult | Response> {
    const link = resetLink(new URL(request.url));
    if (!link) return { status: "invalid" };
    const { values, errors } = requiredFields(
        await request.formData(),
        resetFields,
    );
    if (
        !errors.password &&
        !errors.password_confirmation &&
        values.password !== values.password_confirmation
    )
        errors.password_confirmation = ["Passwords do not match."];
    if (Object.keys(errors).length > 0) return { status: "validation", errors };

    const response = await sessionRequest(request, "/api/reset-password", {
        values: { ...values, ...link },
    });
    if (!(response instanceof Response)) return response;
    if (response.status === 204) return { status: "reset" };
    if (response.status === 429) return rateLimit(response);
    if (response.status === 419) return { status: "error", reason: "expired" };
    if (response.status === 403) {
        const session = await guestLoader({ request });
        if (session instanceof Response) return session;
    }
    const body = await responseBody(response);
    if (response.status === 422) {
        if (
            (isRecord(body) && body.code === "invalid_password_reset_link") ||
            validationErrors(body, [{ name: "email" }, { name: "token" }])
        )
            return { status: "invalid" };
        const errors = validationErrors(body, resetFields);
        if (errors) return { status: "validation", errors };
    }
    return { status: "error", reason: "server" };
}
