import { Outlet, type ShouldRevalidateFunctionArgs } from "react-router";
import { AuthShell } from "~/features/authentication/auth-shell";
import { guestLoader } from "~/features/authentication/session";
import { SessionError } from "~/features/authentication/session-error";
import { isRecord } from "~/lib/api";
import type { Route } from "./+types/guest";

export const clientLoader = guestLoader;

export function shouldRevalidate({
    actionResult,
    defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
    // An unavailable session recheck must not discard a failed form's input.
    if (
        isRecord(actionResult) &&
        (actionResult.status === "error" ||
            actionResult.status === "validation" ||
            actionResult.status === "rate-limited")
    )
        return false;
    return defaultShouldRevalidate;
}

export default function Guest({ loaderData }: Route.ComponentProps) {
    return (
        <AuthShell>
            {loaderData.status === "error" ? <SessionError /> : <Outlet />}
        </AuthShell>
    );
}
