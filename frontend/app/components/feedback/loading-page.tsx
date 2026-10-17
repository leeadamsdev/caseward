import { useEffect, useState } from "react";
import { PageShell } from "~/components/layout/page-shell";
import "./loading-page.css";

export function LoadingPage() {
    const [slow, setSlow] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setSlow(true);
        }, 8_000);
        return () => {
            clearTimeout(timer);
        };
    }, []);

    return (
        <PageShell titleId="loading-title" showLogo={false}>
            <div
                className="mx-auto mb-7 flex size-20 items-center justify-center rounded-full border border-border/70 bg-card/60 shadow-[0_12px_35px_-18px_color-mix(in_srgb,var(--brand-blue)_22%,transparent)] sm:size-22"
                aria-hidden="true"
            >
                <span className="page-spinner size-9.5 rounded-full sm:size-10.5" />
            </div>
            {/* Keep startup copy stable while the application font downloads. */}
            <div role="status" className="font-[Arial,sans-serif]">
                <h1
                    id="loading-title"
                    className="text-[1.4375rem] leading-8 font-semibold tracking-tight sm:text-2xl"
                >
                    Loading Caseward…
                </h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Getting things ready for you.
                </p>
                {slow && (
                    <p className="mt-5 text-[0.8125rem] leading-5.5 text-muted-foreground">
                        This is taking longer than usual.
                        <br />
                        We’re still loading this page.
                    </p>
                )}
            </div>
        </PageShell>
    );
}
