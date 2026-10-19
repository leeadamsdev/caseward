import { redirect } from "react-router";
import {
    CreateWorkspaceInvitation201Response,
    CreateWorkspaceInvitation409Response,
    CreateWorkspaceInvitation503Response,
} from "~/generated/api/operations";
import {
    WorkspaceResource,
    WorkspaceInvitationRequest,
} from "~/generated/api/operations.schemas";
import { signOut } from "~/features/authentication/session";
import {
    requiredFields,
    sessionRequest,
    responseBody,
    rateLimit,
    retryWindow,
    validationErrors,
    type FormFailure,
    type RetryWindow,
} from "~/lib/api";
import { workspaceAccessRedirect } from "./workspaces";
import { invitationSchema, membersPath, type Invitation } from "./members";

export const invitationFields = [
    {
        name: "email",
        label: "Email address",
        type: "email",
        autoComplete: "email",
        placeholder: "colleague@company.com",
    },
] as const;

export type InvitationResult =
    | FormFailure<"email">
    | { status: "queued"; invitation: Invitation; retry: RetryWindow }
    | { status: "revoked" }
    | { status: "queue-failed" }
    | { status: "unavailable" };

const queuedSchema = CreateWorkspaceInvitation201Response.extend({
    data: invitationSchema,
});

export async function invitationAction({
    request,
    params,
}: {
    request: Request;
    params: { workspaceId?: string };
}): Promise<InvitationResult | Response> {
    const data = await request.clone().formData();
    const intent = data.get("intent");
    if (intent === "logout") return signOut({ request });
    const workspaceId = params.workspaceId;
    if (
        !workspaceId ||
        !WorkspaceResource.shape.id.safeParse(workspaceId).success ||
        (intent !== "invite" && intent !== "resend" && intent !== "revoke")
    )
        return { status: "error", reason: "server" };
    const rawId = data.get("account_id");
    const account = WorkspaceInvitationRequest.safeParse({
        account_id:
            typeof rawId === "string" && /^[1-9]\d*$/.test(rawId)
                ? Number(rawId)
                : 0,
    });
    if (!account.success) return { status: "error", reason: "server" };
    const { values, errors } = requiredFields(data, invitationFields);
    if (intent === "invite" && Object.keys(errors).length)
        return { status: "validation", errors };
    const rawInvitationId = data.get("invitation_id");
    const invitationId =
        typeof rawInvitationId === "string" ? rawInvitationId : "";
    if (
        intent !== "invite" &&
        !WorkspaceResource.shape.id.safeParse(invitationId).success
    )
        return { status: "error", reason: "server" };

    const base = `/api/workspaces/${workspaceId}/invitations`;
    const response = await sessionRequest(
        request,
        intent === "invite"
            ? base
            : `${base}/${invitationId}${intent === "resend" ? "/resend" : ""}`,
        {
            method: intent === "revoke" ? "DELETE" : "POST",
            values:
                intent === "invite"
                    ? { ...account.data, email: values.email ?? "" }
                    : account.data,
        },
    );
    if (!(response instanceof Response)) return response;
    if (response.status === 419) return { status: "error", reason: "expired" };
    if (response.status === 429) return rateLimit(response);
    if (intent === "revoke" && response.status === 204)
        return { status: "revoked" };
    const body = await responseBody(response);
    const access = workspaceAccessRedirect(response, body);
    if (access) return access;
    if (response.status === 403 || response.status === 404)
        return redirect(`/w/${workspaceId}`);
    if (
        response.status === 409 &&
        CreateWorkspaceInvitation409Response.safeParse(body).success
    )
        return redirect(`${membersPath(workspaceId)}?account=changed`);
    if (response.status === 410) return { status: "unavailable" };
    if (response.status === 422 && intent === "invite") {
        const errors = validationErrors(body, invitationFields);
        if (errors) return { status: "validation", errors };
    }
    const failure = CreateWorkspaceInvitation503Response.safeParse(body);
    if (
        response.status === 503 &&
        failure.success &&
        failure.data.code === "invitation_queue_unavailable"
    )
        return { status: "queue-failed" };
    const queued = queuedSchema.safeParse(body);
    if (
        ((intent === "invite" && response.status === 201) ||
            (intent === "resend" && response.status === 200)) &&
        queued.success &&
        (intent === "invite"
            ? queued.data.data.email === values.email?.trim().toLowerCase()
            : queued.data.data.id === invitationId)
    )
        return {
            status: "queued",
            invitation: queued.data.data,
            retry: retryWindow(response),
        };
    return { status: "error", reason: "server" };
}
