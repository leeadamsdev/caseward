import { redirect } from "react-router";
import { parseUser } from "~/features/authentication/session";
import {
    isRecord,
    rateLimit,
    requiredFields,
    responseBody,
    sessionRequest,
    validationErrors,
    type FormFailure,
} from "~/lib/api";

export const emailFields = [
    {
        name: "email",
        label: "Email address",
        type: "email",
        autoComplete: "email",
        placeholder: "you@company.com",
    },
] as const;

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
    if (typeof accountId !== "string" || !/^[1-9]\d*$/.test(accountId))
        return { status: "error", reason: "server" };
    const response = await sessionRequest(request, "/api/email", {
        method: "PATCH",
        values: { ...values, account_id: accountId },
    });
    if (!(response instanceof Response)) return response;
    if (response.status === 401) return redirect("/login?reason=session");
    if (response.status === 419) return { status: "error", reason: "expired" };
    if (response.status === 429) return rateLimit(response);
    const body = await responseBody(response);
    if (
        response.status === 409 &&
        isRecord(body) &&
        body.code === "account_context_changed"
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
        isRecord(body) &&
        body.code === "email_already_verified"
    )
        return redirect("/account");
    if (response.status !== 200) return { status: "error", reason: "server" };
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
              ? "/verify-email?updated=1"
              : "/verify-email?updated=1&delivery=failed",
    );
}
