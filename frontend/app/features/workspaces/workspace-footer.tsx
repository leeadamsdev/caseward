import type { UserResource as User } from "~/generated/api/models";
import { SignOutForm } from "~/features/authentication/sign-out-form";

export function WorkspaceFooter({
    user,
    disabled = false,
}: {
    user: User;
    disabled?: boolean;
}) {
    return (
        <footer className="mt-6 border-t border-border pt-4 text-center">
            <p className="text-xs leading-5 text-muted-foreground">
                Signed in as{" "}
                <span className="font-medium wrap-anywhere">{user.email}</span>
            </p>
            <SignOutForm
                disabled={disabled}
                className="mt-1"
                buttonClassName="min-h-11 py-2 font-normal underline underline-offset-4"
            />
        </footer>
    );
}
