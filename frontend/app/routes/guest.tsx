import { Outlet } from "react-router";
import { AuthShell } from "~/features/authentication/auth-shell";
import { guestLoader } from "~/features/authentication/session";
import { SessionError } from "~/features/authentication/session-error";
import type { Route } from "./+types/guest";

export const clientLoader = guestLoader;

export default function Guest({ loaderData }: Route.ComponentProps) {
    return (
        <AuthShell>
            {loaderData.status === "error" ? <SessionError /> : <Outlet />}
        </AuthShell>
    );
}
