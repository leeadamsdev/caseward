import { CardPage } from "~/components/layout/card-page";
import { InvitationScreen } from "~/features/workspace-invitations/invitation-screen";
import {
    invitationLoader,
    acceptInvitation,
} from "~/features/workspace-invitations/invitation";
import type { Route } from "./+types/workspace-invitation";

export const clientLoader = invitationLoader;
export const clientAction = acceptInvitation;
export { shouldRevalidateInvitation as shouldRevalidate } from "~/features/workspace-invitations/invitation";
export function meta() {
    return [{ title: "Workspace invitation | Caseward" }];
}
export default function WorkspaceInvitation({
    loaderData,
}: Route.ComponentProps) {
    return (
        <CardPage>
            <InvitationScreen
                key={
                    "path" in loaderData
                        ? `${loaderData.path}:${"user" in loaderData ? String(loaderData.user.id) : "guest"}`
                        : loaderData.status
                }
                data={loaderData}
            />
        </CardPage>
    );
}
