import { Outlet } from "react-router";
import { CardPage } from "~/components/layout/card-page";
import { guestLoader } from "~/features/authentication/session";
import { SessionError } from "~/features/authentication/session-error";
import type { Route } from "./+types/guest";

export const clientLoader = guestLoader;

export { shouldRevalidateForm as shouldRevalidate } from "~/components/forms/revalidation";

export default function Guest({ loaderData }: Route.ComponentProps) {
    return (
        <CardPage>
            {loaderData.status === "error" ? <SessionError /> : <Outlet />}
        </CardPage>
    );
}
