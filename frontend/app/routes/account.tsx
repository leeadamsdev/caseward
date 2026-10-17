import { Check } from "lucide-react";
import { AuthHeading, AuthShell } from "~/features/authentication/auth-shell";
import { accountLoader, signOut } from "~/features/authentication/session";
import { SessionError } from "~/features/authentication/session-error";
import { SignOutForm } from "~/features/authentication/sign-out-form";
import type { Route } from "./+types/account";

export const clientLoader = accountLoader;
export const clientAction = signOut;
export function meta() {
    return [{ title: "Your account | Caseward" }];
}

export default function Account({ loaderData }: Route.ComponentProps) {
    return (
        <AuthShell>
            {loaderData.status === "error" ? (
                <SessionError />
            ) : (
                <>
                    <AuthHeading
                        title="You’re signed in"
                        description="Welcome to Caseward."
                    />
                    <dl className="space-y-4 rounded-xl bg-accent p-4 text-sm">
                        <div>
                            <dt className="text-muted-foreground">Full name</dt>
                            <dd className="mt-1 font-medium wrap-anywhere">
                                {loaderData.user.name}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">
                                Email address
                            </dt>
                            <dd className="mt-1 font-medium wrap-anywhere">
                                {loaderData.user.email}
                            </dd>
                            <dd className="mt-2 inline-flex items-center gap-1 rounded-full bg-success-surface px-2 py-1 text-xs font-medium text-success">
                                <Check
                                    className="size-3.5"
                                    aria-hidden="true"
                                />
                                Email verified
                            </dd>
                        </div>
                    </dl>
                    <SignOutForm variant="primary" />
                </>
            )}
        </AuthShell>
    );
}
