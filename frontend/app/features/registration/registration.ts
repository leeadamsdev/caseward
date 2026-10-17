export const registrationFields = [
    {
        name: "name",
        label: "Full name",
        type: "text",
        autoComplete: "name",
        placeholder: "e.g. Alex Chen",
    },
    {
        name: "email",
        label: "Email address",
        type: "email",
        autoComplete: "email",
        placeholder: "you@company.com",
    },
    {
        name: "password",
        label: "Password",
        type: "password",
        autoComplete: "new-password",
        placeholder: "Create a password",
    },
    {
        name: "password_confirmation",
        label: "Confirm password",
        type: "password",
        autoComplete: "new-password",
        placeholder: "Re-enter your password",
    },
] as const;

export type RegistrationFieldName = (typeof registrationFields)[number]["name"];
export type RegistrationErrors = Partial<
    Record<RegistrationFieldName, string[]>
>;

export type RegistrationResult =
    | { status: "created"; email: string }
    | { status: "validation"; errors: RegistrationErrors }
    | { status: "rate-limited"; retryAt: number; receivedAt: number }
    | { status: "error"; reason: "network" | "server" };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validationErrors(value: unknown): RegistrationErrors | undefined {
    if (!isRecord(value) || !isRecord(value.errors)) return;

    const errors: RegistrationErrors = {};
    for (const { name: field } of registrationFields) {
        const messages = value.errors[field];
        if (
            Array.isArray(messages) &&
            messages.length > 0 &&
            messages.every((message: unknown) => typeof message === "string")
        ) {
            errors[field] = messages;
        }
    }

    return Object.keys(errors).length > 0 ? errors : undefined;
}

export async function registerAccount(
    request: Request,
): Promise<RegistrationResult> {
    const formData = await request.formData();
    const values = Object.fromEntries(
        registrationFields.map(({ name: field }) => {
            const value = formData.get(field);
            return [field, typeof value === "string" ? value : ""];
        }),
    );
    const errors: RegistrationErrors = {};

    // Required fields and confirmation provide immediate feedback; PHP owns the validation policy.
    for (const { name: field, label } of registrationFields) {
        const value = values[field];
        if (
            !value ||
            ((field === "name" || field === "email") && !value.trim())
        )
            errors[field] = [`${label} is required.`];
    }
    if (
        !errors.password &&
        !errors.password_confirmation &&
        values.password !== values.password_confirmation
    ) {
        errors.password_confirmation = ["Passwords do not match."];
    }
    if (Object.keys(errors).length > 0) return { status: "validation", errors };

    let response: Response;
    try {
        response = await fetch("/api/register", {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(values),
            credentials: "omit",
            signal: AbortSignal.any([
                request.signal,
                AbortSignal.timeout(30_000),
            ]),
        });
    } catch {
        request.signal.throwIfAborted();
        return { status: "error", reason: "network" };
    }

    if (response.status === 429) {
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

    if (response.status !== 201 && response.status !== 422) {
        return { status: "error", reason: "server" };
    }

    let body: unknown;
    try {
        body = await response.json();
    } catch {
        return { status: "error", reason: "server" };
    }

    if (response.status === 422) {
        const errors = validationErrors(body);
        return errors
            ? { status: "validation", errors }
            : { status: "error", reason: "server" };
    }

    if (
        isRecord(body) &&
        isRecord(body.data) &&
        typeof body.data.id === "number" &&
        Number.isSafeInteger(body.data.id) &&
        body.data.id > 0 &&
        typeof body.data.name === "string" &&
        typeof body.data.email === "string" &&
        body.data.email.length > 0
    ) {
        return { status: "created", email: body.data.email };
    }

    return { status: "error", reason: "server" };
}
