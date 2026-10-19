import { verificationPath } from "~/features/email-verification/links";
import { invitationPath } from "~/features/workspace-invitations/links";

// Only these explicit confirmation journeys may resume after authentication.
export function authReturnTo(value: string | null) {
    return verificationPath(value) ?? invitationPath(value);
}

export function withReturnTo(path: string, value: string | undefined) {
    const returnTo = authReturnTo(value ?? null);
    return returnTo
        ? `${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams({ returnTo })}`
        : path;
}
