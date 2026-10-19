import { redirect, type ShouldRevalidateFunctionArgs } from "react-router";
import { z } from "zod";
import {
    GetWorkspaceInvitation200Response,
    GetWorkspaceInvitation403Response,
    AcceptWorkspaceInvitation200Response,
    AcceptWorkspaceInvitation409Response,
} from "~/generated/api/operations";
import {
    WorkspaceResource,
    WorkspaceInvitationRequest,
    type UserResource,
} from "~/generated/api/operations.schemas";
import { loadSession, signOut } from "~/features/authentication/session";
import { withReturnTo } from "~/features/authentication/return-to";
import { shouldRevalidateForm } from "~/components/forms/revalidation";
import {
    apiRequest,
    sessionRequest,
    responseBody,
    rateLimit,
    isRecord,
    type ApiFailure,
    type RateLimit,
} from "~/lib/api";
import { forgetInvitation, rememberInvitation } from "./continuation";
import { invitationPath } from "./links";

const workspace = WorkspaceResource.extend({
    name: WorkspaceResource.shape.name.refine((value) => Boolean(value.trim())),
});
const previewSchema = GetWorkspaceInvitation200Response.extend({
    data: GetWorkspaceInvitation200Response.shape.data.extend({
        workspace: workspace.omit({ role: true }),
        email: z.string().trim().min(1),
        expires_at: z.iso.datetime({ offset: true }),
    }),
});
const acceptedSchema = AcceptWorkspaceInvitation200Response.extend({
    data: workspace,
});
type Preview = z.infer<typeof previewSchema>["data"];
export type InvitationData =
    | { status: "guest"; path: string }
    | { status: "unverified"; path: string; user: UserResource }
    | { status: "mismatch"; path: string; user: UserResource }
    | { status: "ready"; path: string; user: UserResource; preview: Preview }
    | { status: "unavailable" }
    | ApiFailure
    | RateLimit;
export type AcceptResult =
    | { status: "accepted"; workspace: z.infer<typeof workspace> }
    | { status: "unavailable" }
    | ApiFailure
    | RateLimit;

export async function invitationLoader({
    request,
}: {
    request: Request;
}): Promise<InvitationData | Response> {
    const path = invitationPath(new URL(request.url).pathname);
    if (!path) return { status: "unavailable" };
    const session = await loadSession(request);
    if (session.status === "error") return session;
    if (session.status === "guest") return { ...session, path };
    if (session.status === "unverified") {
        rememberInvitation(path, session.user.id);
        return { status: "unverified", user: session.user, path };
    }
    const response = await apiRequest(request, `/api${path}`);
    if (!(response instanceof Response)) return response;
    if (response.status === 401) return redirect(withReturnTo("/login", path));
    if (response.status === 410) {
        forgetInvitation(path);
        return { status: "unavailable" };
    }
    if (response.status === 429) return rateLimit(response);
    const body = await responseBody(response);
    if (response.status === 403) {
        const parsed = GetWorkspaceInvitation403Response.pick({
            code: true,
        }).safeParse(body);
        if (parsed.success)
            return parsed.data.code === "email_unverified"
                ? redirect(withReturnTo("/verify-email", path))
                : { status: "mismatch", path, user: session.user };
    }
    const preview = previewSchema.safeParse(body);
    if (
        response.status === 200 &&
        preview.success &&
        preview.data.data.email === session.user.email
    )
        return {
            status: "ready",
            path,
            user: session.user,
            preview: preview.data.data,
        };
    return { status: "error", reason: "server" };
}

export async function acceptInvitation({
    request,
}: {
    request: Request;
}): Promise<AcceptResult | Response> {
    const data = await request.clone().formData();
    if (data.get("intent") === "logout") return signOut({ request });
    const path = invitationPath(new URL(request.url).pathname);
    if (!path) return { status: "unavailable" };
    const rawId = data.get("account_id");
    const account = WorkspaceInvitationRequest.safeParse({
        account_id:
            typeof rawId === "string" && /^[1-9]\d*$/.test(rawId)
                ? Number(rawId)
                : 0,
    });
    const expectedWorkspace = WorkspaceResource.shape.id.safeParse(
        data.get("workspace_id"),
    );
    if (
        data.get("intent") !== "accept" ||
        !account.success ||
        !expectedWorkspace.success
    )
        return { status: "error", reason: "server" };
    const response = await sessionRequest(request, `/api${path}/accept`, {
        values: account.data,
    });
    if (!(response instanceof Response)) return response;
    if (response.status === 401) return redirect(withReturnTo("/login", path));
    if (response.status === 419) return { status: "error", reason: "expired" };
    if (response.status === 429) return rateLimit(response);
    if (response.status === 410) {
        forgetInvitation(path);
        return { status: "unavailable" };
    }
    const body = await responseBody(response);
    if (response.status === 403) {
        const parsed = GetWorkspaceInvitation403Response.pick({
            code: true,
        }).safeParse(body);
        if (parsed.success)
            return redirect(
                parsed.data.code === "email_unverified"
                    ? withReturnTo("/verify-email", path)
                    : `${path}?account=changed`,
            );
    }
    if (
        response.status === 409 &&
        AcceptWorkspaceInvitation409Response.pick({ code: true }).safeParse(
            body,
        ).success
    )
        return redirect(`${path}?account=changed`);
    const accepted = acceptedSchema.safeParse(body);
    if (
        response.status === 200 &&
        accepted.success &&
        accepted.data.data.id === expectedWorkspace.data
    ) {
        forgetInvitation(path);
        return { status: "accepted", workspace: accepted.data.data };
    }
    return { status: "error", reason: "server" };
}

export function shouldRevalidateInvitation(args: ShouldRevalidateFunctionArgs) {
    // Acceptance already returns the authoritative workspace. An extra GET must
    // not replace confirmed success with a transient session or network failure.
    if (
        isRecord(args.actionResult) &&
        (args.actionResult.status === "accepted" ||
            args.actionResult.status === "unavailable")
    )
        return false;
    return shouldRevalidateForm(args);
}
