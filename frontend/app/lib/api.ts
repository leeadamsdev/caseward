export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type ApiFailure = {
    status: "error";
    reason: "network" | "server" | "expired";
};
export type RateLimit = {
    status: "rate-limited";
    retryAt: number;
    receivedAt: number;
};
export type FormErrors<Field extends string> = Partial<Record<Field, string[]>>;
export type FormFailure<Field extends string> =
    | ApiFailure
    | RateLimit
    | { status: "validation"; errors: FormErrors<Field> };

export async function apiRequest(
    request: Request,
    path: string,
    init?: Omit<RequestInit, "headers"> & { headers?: Record<string, string> },
): Promise<Response | ApiFailure> {
    try {
        return await fetch(path, {
            credentials: "same-origin",
            ...init,
            headers: { Accept: "application/json", ...init?.headers },
            cache: "no-store",
            signal: AbortSignal.any([
                request.signal,
                AbortSignal.timeout(30_000),
            ]),
        });
    } catch {
        request.signal.throwIfAborted();
        return { status: "error", reason: "network" };
    }
}

export async function sessionPost(
    request: Request,
    path: string,
    values?: Record<string, string>,
): Promise<Response | ApiFailure> {
    const bootstrap = await apiRequest(request, "/sanctum/csrf-cookie");
    if (!(bootstrap instanceof Response)) return bootstrap;
    if (bootstrap.status !== 204) return { status: "error", reason: "server" };

    const cookie = document.cookie
        .split("; ")
        .find((entry) => entry.startsWith("XSRF-TOKEN="));
    let token: string;
    try {
        token = decodeURIComponent(cookie?.slice("XSRF-TOKEN=".length) ?? "");
    } catch {
        return { status: "error", reason: "server" };
    }
    if (!token) return { status: "error", reason: "server" };

    return apiRequest(request, path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-XSRF-TOKEN": token },
        body: JSON.stringify(values ?? {}),
    });
}

export async function responseBody(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        return undefined;
    }
}

export function validationErrors<Field extends string>(
    value: unknown,
    fields: readonly { name: Field }[],
): FormErrors<Field> | undefined {
    if (!isRecord(value) || !isRecord(value.errors)) return;
    const errors: FormErrors<Field> = {};
    for (const { name } of fields) {
        const messages = value.errors[name];
        if (
            Array.isArray(messages) &&
            messages.length > 0 &&
            messages.every(
                (message: unknown) =>
                    typeof message === "string" && message.trim().length > 0,
            )
        ) {
            errors[name] = messages;
        }
    }
    return Object.keys(errors).length > 0 ? errors : undefined;
}

export function rateLimit(response: Response): RateLimit {
    const receivedAt = Date.now();
    const header = response.headers.get("Retry-After")?.trim() ?? "";
    const retryAt = /^\d+$/.test(header)
        ? receivedAt + Number(header) * 1000
        : Date.parse(header);
    return {
        status: "rate-limited",
        receivedAt,
        retryAt: Number.isFinite(retryAt)
            ? Math.max(receivedAt, retryAt)
            : receivedAt + 60_000,
    };
}

export function requiredFields<Field extends string>(
    formData: FormData,
    fields: readonly { name: Field; label: string; type: string }[],
) {
    const values: Record<string, string> = {};
    const errors: FormErrors<Field> = {};
    for (const { name, label, type } of fields) {
        const value = formData.get(name);
        values[name] = typeof value === "string" ? value : "";
        // PHP owns the validation policy; only required fields provide immediate feedback here.
        if (!values[name] || (type !== "password" && !values[name].trim()))
            errors[name] = [`${label} is required.`];
    }
    return { values, errors };
}
