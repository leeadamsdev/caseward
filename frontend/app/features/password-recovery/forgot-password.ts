import { emailField } from "~/components/forms/email-field";
import type { ForgotPasswordRequest } from "~/generated/api/models";
import { RequestPasswordReset202Response } from "~/generated/api/operations";
import { guestLoader } from "~/features/authentication/session";
import {
    rateLimit,
    requiredFields,
    responseBody,
    sessionRequest,
    validationErrors,
    type FormFailure,
} from "~/lib/api";

export const recoveryFields = [emailField] as const;

export type RecoveryRequestResult =
    FormFailure<"email"> | { status: "accepted"; email: string };

export async function requestPasswordReset(
    request: Request,
): Promise<RecoveryRequestResult | Response> {
    const { values, errors } = requiredFields(
        await request.formData(),
        recoveryFields,
    );
    if (Object.keys(errors).length > 0) return { status: "validation", errors };
    const email = values.email?.trim();

    const response = await sessionRequest(request, "/api/forgot-password", {
        values: { email: values.email ?? "" } satisfies ForgotPasswordRequest,
    });
    if (!(response instanceof Response)) return response;
    if (response.status === 429) return rateLimit(response);
    if (response.status === 419) return { status: "error", reason: "expired" };
    if (response.status === 403) {
        // Another tab may have signed in since this guest form was opened.
        const session = await guestLoader({ request });
        if (session instanceof Response) return session;
    }
    const body = await responseBody(response);
    if (response.status === 422) {
        const errors = validationErrors(body, recoveryFields);
        if (errors) return { status: "validation", errors };
    }
    if (
        response.status === 202 &&
        RequestPasswordReset202Response.safeParse(body).success &&
        email
    )
        return { status: "accepted", email };
    return { status: "error", reason: "server" };
}
