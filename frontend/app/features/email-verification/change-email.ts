import { redirect } from "react-router";
import { emailField } from "~/components/forms/email-field";
import { userSchema } from "~/features/authentication/session";
import type { UpdateEmailRequest } from "~/generated/api/operations.schemas";
import {
    UpdateUnverifiedEmail200Response,
    UpdateUnverifiedEmail403Response,
    UpdateUnverifiedEmail409Response,
} from "~/generated/api/operations";
import {
    rateLimit,
    requiredFields,
    responseBody,
    sessionRequest,
    validationErrors,
    type FormFailure,
} from "~/lib/api";

export const emailFields = [emailField] as const;
const correctionSchema = UpdateUnverifiedEmail200Response.extend({
    data: userSchema,
});

export type ChangeEmailResult = FormFailure<"email">;

export async function changeEmail({
    request,
}: {
    request: Request;
}): Promise<ChangeEmailResult | Response> {
    const data = await request.formData();
    const { values, errors } = requiredFields(data, emailFields);
    if (Object.keys(errors).length > 0) return { status: "validation", errors };
    const accountId = data.get("account_id");
    if (
        typeof accountId !== "string" ||
        !/^[1-9]\d*$/.test(accountId) ||
        !Number.isSafeInteger(Number(accountId))
    )
        return { status: "error", reason: "server" };
    const response = await sessionRequest(request, "/api/email", {
        method: "PATCH",
        values: {
            email: values.email ?? "",
            account_id: Number(accountId),
        } satisfies UpdateEmailRequest,
    });
    if (!(response instanceof Response)) return response;
    if (response.status === 401) return redirect("/login?reason=session");
    if (response.status === 419) return { status: "error", reason: "expired" };
    if (response.status === 429) return rateLimit(response);
    const body = await responseBody(response);
    if (
        response.status === 409 &&
        UpdateUnverifiedEmail409Response.pick({ code: true }).safeParse(body)
            .success
    )
        return redirect("/verify-email?account=changed");
    if (response.status === 422) {
        const errors = validationErrors(body, emailFields);
        return errors
            ? { status: "validation", errors }
            : { status: "error", reason: "server" };
    }
    if (
        response.status === 403 &&
        UpdateUnverifiedEmail403Response.pick({ code: true }).safeParse(body)
            .success
    )
        return redirect("/workspaces");
    if (response.status !== 200) return { status: "error", reason: "server" };
    const parsed = correctionSchema.safeParse(body);
    if (!parsed.success) return { status: "error", reason: "server" };
    const { data: user, meta } = parsed.data;
    return redirect(
        user.email_verified
            ? "/workspaces"
            : meta.verification_email_queued
              ? "/verify-email?updated=1"
              : "/verify-email?updated=1&queue=failed",
    );
}
