import { useRevalidator } from "react-router";
import { Button } from "~/components/ui/button";
import { Notice } from "~/components/ui/notice";

export function WorkspaceLoadError({ title }: { title: string }) {
    const revalidator = useRevalidator();
    const pending = revalidator.state !== "idle";
    return (
        <>
            <Notice tone="danger" role="alert" title={title} className="mb-5">
                <p>Check your connection and try again.</p>
            </Notice>
            <Button
                className="w-full"
                disabled={pending}
                onClick={() => {
                    void revalidator.revalidate();
                }}
            >
                {pending ? "Trying again…" : "Try again"}
            </Button>
            <p role="status" className="sr-only">
                {pending
                    ? "Loading your workspace information. Please wait."
                    : ""}
            </p>
        </>
    );
}
