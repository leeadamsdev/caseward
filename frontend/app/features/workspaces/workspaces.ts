import { redirect } from "react-router";
import { z } from "zod";
import {
    WorkspaceResource,
    type WorkspaceResource as Workspace,
    type CreateWorkspaceRequest,
} from "~/generated/api/operations.schemas";
import {
    CreateWorkspace201Response,
    CreateWorkspace409Response,
    GetWorkspace200Response,
    ListWorkspaces200Response,
    ListWorkspaces403Response,
} from "~/generated/api/operations";
import {
    verifiedSessionLoader,
    signOut,
} from "~/features/authentication/session";
import {
    apiRequest,
    rateLimit,
    requiredFields,
    responseBody,
    sessionRequest,
    validationErrors,
    type ApiFailure,
    type FormFailure,
} from "~/lib/api";

type WorkspacePage = {
    items: Workspace[];
    page: number;
    lastPage: number;
    total: number;
};
export type WorkspaceListResult =
    { status: "loaded"; page: WorkspacePage } | ApiFailure;
type WorkspaceResult =
    | { status: "loaded"; workspace: Workspace }
    | { status: "missing" }
    | ApiFailure;
export type CreateWorkspaceResult = FormFailure<"name">;
const workspaceSchema = WorkspaceResource.refine((workspace) =>
    Boolean(workspace.name.trim()),
);
const workspaceResponseSchema = GetWorkspace200Response.extend({
    data: workspaceSchema,
});
const creationSchema = CreateWorkspace201Response.extend({
    data: workspaceSchema,
});
const pageSchema = ListWorkspaces200Response.extend({
    data: z.array(workspaceSchema),
}).refine(
    ({ data, meta }) =>
        meta.per_page > 0 &&
        data.length <= meta.per_page &&
        data.length <= meta.total &&
        new Set(data.map((workspace) => workspace.id)).size === data.length &&
        meta.last_page === Math.max(1, Math.ceil(meta.total / meta.per_page)) &&
        !(
            data.length === 0 &&
            meta.total > 0 &&
            meta.current_page <= meta.last_page
        ),
);

export const workspaceFields = [
    {
        name: "name",
        label: "Workspace name",
        type: "text",
        autoComplete: "organization",
        placeholder: "e.g. Acme Support",
    },
] as const;

function positiveInteger(value: unknown): value is number {
    return (
        typeof value === "number" && Number.isSafeInteger(value) && value > 0
    );
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
        ListWorkspaces403Response.pick({ code: true }).safeParse(body).success
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
    const parsed = pageSchema.safeParse(body);
    return response.status === 200 &&
        parsed.success &&
        parsed.data.meta.current_page === pageNumber
        ? {
              status: "loaded",
              page: {
                  items: parsed.data.data,
                  page: parsed.data.meta.current_page,
                  lastPage: parsed.data.meta.last_page,
                  total: parsed.data.meta.total,
              },
          }
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
    if (
        params.workspaceId &&
        WorkspaceResource.shape.id.safeParse(params.workspaceId).success
    ) {
        const response = await apiRequest(
            request,
            `/api/workspaces/${params.workspaceId}`,
        );
        if (!(response instanceof Response)) result = response;
        else {
            const body = await responseBody(response);
            const redirected = accessRedirect(response, body);
            if (redirected) return redirected;
            const parsed = workspaceResponseSchema.safeParse(body);
            const workspace = parsed.success ? parsed.data.data : undefined;
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
    if (
        typeof accountId !== "string" ||
        !/^[1-9]\d*$/.test(accountId) ||
        !Number.isSafeInteger(Number(accountId))
    )
        return { status: "error", reason: "server" };
    const response = await sessionRequest(request, "/api/workspaces", {
        values: {
            name: values.name ?? "",
            account_id: Number(accountId),
        } satisfies CreateWorkspaceRequest,
    });
    if (!(response instanceof Response)) return response;
    if (response.status === 419) return { status: "error", reason: "expired" };
    if (response.status === 429) return rateLimit(response);
    const body = await responseBody(response);
    const redirected = accessRedirect(response, body);
    if (redirected) return redirected;
    if (
        response.status === 409 &&
        CreateWorkspace409Response.pick({ code: true }).safeParse(body).success
    )
        return redirect("/workspaces/new?account=changed");
    if (response.status === 422) {
        const errors = validationErrors(body, workspaceFields);
        if (errors) return { status: "validation", errors };
    }
    const parsed = creationSchema.safeParse(body);
    const workspace =
        response.status === 201 && parsed.success
            ? parsed.data.data
            : undefined;
    return workspace?.role === "owner"
        ? redirect(workspacePath(workspace))
        : { status: "error", reason: "server" };
}
