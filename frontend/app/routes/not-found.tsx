import { ArrowLeft, House } from "lucide-react";
import { useEffect, useRef } from "react";
import { NavigationType, useNavigate, useNavigationType } from "react-router";
import { PageShell } from "~/components/layout/page-shell";
import { Button, ButtonLink } from "~/components/ui/button";

export function meta() {
    return [{ title: "Page not found | Caseward" }];
}

export default function NotFound() {
    const headingRef = useRef<HTMLHeadingElement>(null);
    const navigate = useNavigate();
    const navigationType = useNavigationType();

    useEffect(() => {
        headingRef.current?.focus({ preventScroll: true });
    }, []);

    return (
        <PageShell>
            <p
                className="bg-linear-135 from-brand-blue to-brand-violet bg-clip-text text-[5.75rem] leading-26 font-semibold tracking-[-0.375rem] text-transparent sm:text-[6.75rem] sm:leading-29 sm:tracking-[-0.4375rem]"
                aria-hidden="true"
            >
                404
            </p>
            <h1
                ref={headingRef}
                id="page-title"
                tabIndex={-1}
                className="mt-2.5 text-[1.75rem] leading-9 font-semibold tracking-tight outline-none sm:text-[2rem] sm:leading-10.5"
            >
                Page not found
            </h1>
            <p className="mx-auto mt-3.5 max-w-97.5 text-sm leading-6.25 text-pretty text-muted-foreground sm:text-[0.9375rem] sm:leading-6.5">
                We couldn’t find the page you’re looking for. It may have moved,
                or the address might be incorrect.
            </p>
            <div className="mx-auto mt-7 flex max-w-85 flex-col justify-center gap-3 sm:mt-7.5 sm:max-w-none sm:flex-row">
                <ButtonLink to="/">
                    <House className="size-4.5" aria-hidden="true" />
                    Return to home
                </ButtonLink>
                <Button
                    variant="outline"
                    onClick={() => {
                        if (navigationType === NavigationType.Push) {
                            void navigate(-1);
                        } else {
                            void navigate("/", { replace: true });
                        }
                    }}
                >
                    <ArrowLeft className="size-4.5" aria-hidden="true" />
                    Go back
                </Button>
            </div>
        </PageShell>
    );
}
