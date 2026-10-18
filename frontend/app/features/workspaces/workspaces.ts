import { redirect } from "react-router";
import {
    verifiedSessionLoader,
    signOut,
} from "~/features/authentication/session";
import {
    apiRequest,
    isRecord,
    rateLimit,
    requiredFields,
    responseBody,
    sessionRequest,
    validationErrors,
    type ApiFailure,
    type FormFailure,
} from "~/lib/api";

export type Workspace = { id: string; name: string; role: "owner" | "member" };
export type WorkspacePage = {
    items: Workspace[];
    page: number;
    lastPage: number;
    total: number;
};
export type WorkspaceListResult =
    { status: "loaded"; page: WorkspacePage } | ApiFailure;
export type WorkspaceResult =
    | { status: "loaded"; workspace: Workspace }
    | { status: "missing" }
    | ApiFailure;
export type CreateWorkspaceResult = FormFailure<"name">;
const workspaceIdPattern = /^[0-7][0-9a-hjkmnp-tv-z]{25}$/i;

export const workspaceFields = [
    {
        name: "name",
        label: "Workspace name",
        type: "text",
        autoComplete: "organization",
        placeholder: "e.g. Acme Support",
    },
] as const;

function parseWorkspace(value: unknown): Workspace | undefined {
    if (!isRecord(value)) return;
    const { id, name, role } = value;
    if (
        typeof id === "string" &&
        workspaceIdPattern.test(id) &&
        typeof name === "string" &&
        name.trim() &&
        (role === "owner" || role === "member")
    )
        return { id, name, role };
}

function positiveInteger(value: unknown): value is number {
    return (
        typeof value === "number" && Number.isSafeInteger(value) && value > 0
    );
}

function parseWorkspacePage(value: unknown): WorkspacePage | undefined {
    if (!isRecord(value) || !Array.isArray(value.data) || !isRecord(value.meta))
        return;
    const { current_page, last_page, total } = value.meta;
    if (
        !positiveInteger(current_page) ||
        !positiveInteger(last_page) ||
        typeof total !== "number" ||
        !Number.isSafeInteger(total) ||
        total < 0 ||
        value.data.length > 25
    )
        return;
    const items: Workspace[] = [];
    for (const entry of value.data) {
        const workspace = parseWorkspace(entry);
        if (!workspace || items.some((item) => item.id === workspace.id))
            return;
        items.push(workspace);
    }
    if (
        last_page !== Math.max(1, Math.ceil(total / 25)) ||
        items.length > total ||
        (items.length === 0 && total > 0 && current_page <= last_page)
    )
        return;
    return { items, page: current_page, lastPage: last_page, total };
}

export function workspacePath(workspace: Workspace) {
    return `/w/${workspace.id}`;
}
export function workspacePagePath(page: number) {
    return page === 1 ? "/workspaces" : `/workspaces?page=${String(page)}`;
}

function accessRedirect(response: Response, body: unknown) {
    if (response.status === 401) return redirect("/login?reason=session");
    if (
        response.status === 403 &&
        isRecord(body) &&
        body.code === "email_unverified"
    )
        return redirect("/verify-email");
}

async function loadWorkspacePage(
    request: Request,
    pageNumber: number,
): Promise<WorkspaceListResult | Response> {
    const response = await apiRequest(
        request,
        `/api/workspaces?page=${String(pageNumber)}`,
    );
    if (!(response instanceof Response)) return response;
    const body = await responseBody(response);
    const redirected = accessRedirect(response, body);
    if (redirected) return redirected;
    const page = response.status === 200 ? parseWorkspacePage(body) : undefined;
    return page && page.page === pageNumber
        ? { status: "loaded", page }
        : { status: "error", reason: "server" };
}

async function loadWorkspaces(request: Request, pageNumber: number) {
    const session = await verifiedSessionLoader({ request });
    if (session instanceof Response || session.status === "error")
        return session;
    const workspaces = await loadWorkspacePage(request, pageNumber);
    if (workspaces instanceof Response) return workspaces;
    return { ...session, workspaces };
}

export function createWorkspaceLoader({ request }: { request: Request }) {
    return loadWorkspaces(request, 1);
}

export async function workspacesLoader({ request }: { request: Request }) {
    const rawPage = new URL(request.url).searchParams.get("page") ?? "1";
    const pageNumber = Number(rawPage);
    if (!/^[1-9]\d*$/.test(rawPage) || !positiveInteger(pageNumber))
        return redirect("/workspaces");
    const result = await loadWorkspaces(request, pageNumber);
    if (result instanceof Response || result.status === "error") return result;
    if (result.workspaces.status === "loaded") {
        const page = result.workspaces.page;
        if (page.total === 0) return redirect("/workspaces/new");
        if (page.page > page.lastPage)
            return redirect(workspacePagePath(page.lastPage));
    }
    return result;
}

export async function workspaceLoader({
    request,
    params,
}: {
    request: Request;
    params: { workspaceId?: string };
}) {
    const session = await verifiedSessionLoader({ request });
    if (session instanceof Response || session.status === "error")
        return session;
    let result: WorkspaceResult = { status: "missing" };
    if (params.workspaceId && workspaceIdPattern.test(params.workspaceId)) {
        const response = await apiRequest(
            request,
            `/api/workspaces/${params.workspaceId}`,
        );
        if (!(response instanceof Response)) result = response;
        else {
            const body = await responseBody(response);
            const redirected = accessRedirect(response, body);
            if (redirected) return redirected;
            const workspace = isRecord(body)
                ? parseWorkspace(body.data)
                : undefined;
            result =
                response.status === 404
                    ? { status: "missing" }
                    : response.status === 200 &&
                        workspace &&
                        workspace.id === params.workspaceId
                      ? { status: "loaded", workspace }
                      : { status: "error", reason: "server" };
        }
    }
    return { ...session, result };
}

export async function createWorkspace({
    request,
}: {
    request: Request;
}): Promise<CreateWorkspaceResult | Response> {
    const data = await request.clone().formData();
    if (data.get("intent") === "logout") return signOut({ request });
    if (data.get("intent") !== "create")
        return { status: "error", reason: "server" };
    const { values, errors } = requiredFields(data, workspaceFields);
    if (Object.keys(errors).length) return { status: "validation", errors };
    const accountId = data.get("account_id");
    if (typeof accountId !== "string" || !/^[1-9]\d*$/.test(accountId))
        return { status: "error", reason: "server" };
    const response = await sessionRequest(request, "/api/workspaces", {
        values: { ...values, account_id: accountId },
    });
    if (!(response instanceof Response)) return response;
    if (response.status === 419) return { status: "error", reason: "expired" };
    if (response.status === 429) return rateLimit(response);
    const body = await responseBody(response);
    const redirected = accessRedirect(response, body);
    if (redirected) return redirected;
    if (
        response.status === 409 &&
        isRecord(body) &&
        body.code === "account_context_changed"
    )
        return redirect("/workspaces/new?account=changed");
    if (response.status === 422) {
        const errors = validationErrors(body, workspaceFields);
        if (errors) return { status: "validation", errors };
    }
    const workspace =
        response.status === 201 && isRecord(body)
            ? parseWorkspace(body.data)
            : undefined;
    return workspace?.role === "owner"
        ? redirect(workspacePath(workspace))
        : { status: "error", reason: "server" };
}
