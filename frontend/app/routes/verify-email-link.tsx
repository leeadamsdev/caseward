import { useEffect, useRef } from "react";
import { ButtonLink } from "~/components/ui/button";
import { CardHeading, CardPage } from "~/components/layout/card-page";
import { SessionError } from "~/features/authentication/session-error";
import { VerificationScreen } from "~/features/email-verification/verification-screen";
import {
    verificationLoader,
    verifyEmail,
} from "~/features/email-verification/verification";
import type { Route } from "./+types/verify-email-link";

export const clientLoader = verificationLoader;
export const clientAction = verifyEmail;
export function meta() {
    return [{ title: "Confirm your email | Caseward" }];
}
export default function VerifyEmailLink({
    loaderData,
    params,
}: Route.ComponentProps) {
    const headingRef = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        headingRef.current?.focus({ preventScroll: true });
    }, [loaderData.status]);
    return (
        <CardPage>
            {loaderData.status === "error" ? (
                <SessionError />
            ) : loaderData.status === "invalid" ? (
                <>
                    <CardHeading
                        ref={headingRef}
                        title="Link expired or invalid"
                        description="This verification link can no longer be used."
                    />
                    <ButtonLink to="/verify-email" className="w-full">
                        Back to verification
                    </ButtonLink>
                </>
            ) : (
                <VerificationScreen
                    key={loaderData.path}
                    user={loaderData.user}
                    path={loaderData.path}
                    accountId={params.id}
                    continuation={loaderData.continuation}
                />
            )}
        </CardPage>
    );
}
