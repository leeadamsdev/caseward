import { useRevalidator } from "react-router";
import { Button } from "~/components/ui/button";
import { Notice } from "~/components/ui/notice";
import { AuthHeading } from "./auth-shell";

export function SessionError() {
    const revalidator = useRevalidator();
    const pending = revalidator.state !== "idle";
    return (
        <>
            <AuthHeading
                title="Connection problem"
                description="We couldn’t check your session."
            />
            <Notice tone="danger" role="alert" className="mb-5">
                <p>Check your connection and try again in a moment.</p>
            </Notice>
            <Button
                className="w-full"
                disabled={pending}
                onClick={() => {
                    void revalidator.revalidate();
                }}
            >
                {pending ? "Checking session…" : "Try again"}
            </Button>
            <p className="sr-only" role="status">
                {pending ? "Checking your session. Please wait." : ""}
            </p>
        </>
    );
}
