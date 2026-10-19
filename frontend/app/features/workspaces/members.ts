import { redirect } from "react-router";
import { z } from "zod";
import {
    ListWorkspaceMembers200Response,
    ListWorkspaceInvitations200Response,
} from "~/generated/api/operations";
import {
    WorkspaceMemberResource,
    WorkspaceInvitationResource,
    WorkspaceResource,
} from "~/generated/api/operations.schemas";
import { apiRequest, responseBody, type ApiFailure } from "~/lib/api";
import { validPage, type Page } from "~/lib/pagination";
import {
    workspaceAccessRedirect,
    workspaceLoader,
    workspacePath,
} from "./workspaces";

export type Member = z.infer<typeof WorkspaceMemberResource>;
export type Invitation = z.infer<typeof WorkspaceInvitationResource>;
export type PageResult<T> = { status: "loaded"; page: Page<T> } | ApiFailure;

export const invitationSchema = WorkspaceInvitationResource.extend({
    id: WorkspaceResource.shape.id,
    email: z.string().trim().min(1),
    expires_at: z.iso.datetime({ offset: true }),
    last_queued_at: z.iso.datetime({ offset: true }).nullable(),
});
const memberPage = ListWorkspaceMembers200Response.extend({
    data: z.array(
        WorkspaceMemberResource.refine(
            (member) =>
                member.id > 0 &&
                Boolean(member.name.trim()) &&
                Boolean(member.email.trim()),
        ),
    ),
}).refine(validPage);
const invitationPage = ListWorkspaceInvitations200Response.extend({
    data: z.array(invitationSchema),
}).refine(validPage);

export function membersPath(workspaceId: string) {
    return `/w/${workspaceId}/members`;
}

export async function membersLoader(
    args: Parameters<typeof workspaceLoader>[0],
) {
    const url = new URL(args.request.url);
    const pages = ["membersPage", "invitationsPage"].map((key) => {
        const value = url.searchParams.get(key) ?? "1";
        return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))
            ? Number(value)
            : null;
    });
    const workspace = await workspaceLoader(args);
    if (
        workspace instanceof Response ||
        workspace.status === "error" ||
        workspace.result.status !== "loaded"
    )
        return workspace;
    const currentWorkspace = workspace.result.workspace;
    const path = membersPath(currentWorkspace.id);
    const [membersPage, invitationsPage] = pages;
    if (!membersPage || !invitationsPage) return redirect(path);

    async function load<T extends { id: string | number }>(
        resource: string,
        page: number,
        schema: z.ZodType<Page<T>>,
    ): Promise<PageResult<T> | Response> {
        const response = await apiRequest(
            args.request,
            `/api/workspaces/${currentWorkspace.id}/${resource}?page=${String(page)}`,
        );
        if (!(response instanceof Response)) return response;
        const body = await responseBody(response);
        const access = workspaceAccessRedirect(response, body);
        if (access) return access;
        if (response.status === 403 || response.status === 404)
            return redirect(workspacePath(currentWorkspace));
        const parsed = schema.safeParse(body);
        if (
            response.status !== 200 ||
            !parsed.success ||
            parsed.data.meta.current_page !== page
        )
            return { status: "error", reason: "server" };
        if (page > parsed.data.meta.last_page) {
            url.searchParams.set(
                resource === "members" ? "membersPage" : "invitationsPage",
                String(parsed.data.meta.last_page),
            );
            return redirect(url.pathname + url.search);
        }
        return { status: "loaded", page: parsed.data };
    }
    const [members, invitations] = await Promise.all([
        load("members", membersPage, memberPage),
        workspace.result.workspace.role === "owner"
            ? load("invitations", invitationsPage, invitationPage)
            : undefined,
    ]);
    if (members instanceof Response) return members;
    if (invitations instanceof Response) return invitations;
    return { ...workspace, members, invitations };
}
