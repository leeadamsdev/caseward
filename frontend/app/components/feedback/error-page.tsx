import { CircleAlert, House, RotateCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { PageShell } from "~/components/layout/page-shell";
import { Button, ButtonLink } from "~/components/ui/button";

export function ErrorPage() {
    const headingRef = useRef<HTMLHeadingElement>(null);

    useEffect(() => {
        document.title = "Something went wrong | Caseward";
        headingRef.current?.focus({ preventScroll: true });
    }, []);

    return (
        <PageShell>
            <div className="mx-auto flex size-20 items-center justify-center rounded-full border border-destructive/7 bg-danger-surface text-destructive sm:size-22">
                <CircleAlert
                    className="size-9 sm:size-10"
                    strokeWidth={1.6}
                    aria-hidden="true"
                />
            </div>
            <h1
                ref={headingRef}
                id="page-title"
                tabIndex={-1}
                className="mt-6 text-[1.75rem] leading-9 font-semibold tracking-tight wrap-anywhere outline-none sm:mt-7 sm:text-[2rem] sm:leading-10.5"
            >
                Something went wrong
            </h1>
            <p className="mx-auto mt-3.5 max-w-97.5 text-sm leading-6.25 text-pretty text-muted-foreground sm:text-[0.9375rem] sm:leading-6.5">
                We couldn’t display this page.
                <br />
                Reload it to try again, or return to home.
            </p>
            <div className="mx-auto mt-7 flex max-w-85 flex-col justify-center gap-3 sm:mt-7.5 sm:max-w-none sm:flex-row">
                <Button
                    onClick={() => {
                        window.location.reload();
                    }}
                >
                    <RotateCw className="size-4.5" aria-hidden="true" />
                    Reload page
                </Button>
                <ButtonLink to="/" reloadDocument variant="outline">
                    <House className="size-4.5" aria-hidden="true" />
                    Return to home
                </ButtonLink>
            </div>
        </PageShell>
    );
}
