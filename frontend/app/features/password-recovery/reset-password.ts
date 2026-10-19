import { newPasswordFields } from "~/components/forms/new-password-fields";
import type { ResetPasswordRequest } from "~/generated/api/models";
import { ResetPassword422Response } from "~/generated/api/operations";
import { guestLoader } from "~/features/authentication/session";
import { resetLink } from "./reset-link";
import {
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

export type ResetResult =
    | FormFailure<(typeof resetFields)[number]["name"]>
    | { status: "reset" }
    | { status: "invalid" };

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
        values: {
            ...link,
            password: values.password ?? "",
            password_confirmation: values.password_confirmation ?? "",
        } satisfies ResetPasswordRequest,
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
        const parsed = ResetPassword422Response.safeParse(body);
        if (
            (parsed.success && "code" in parsed.data) ||
            validationErrors(body, [{ name: "email" }, { name: "token" }])
        )
            return { status: "invalid" };
        const errors = validationErrors(body, resetFields);
        if (errors) return { status: "validation", errors };
    }
    return { status: "error", reason: "server" };
}
