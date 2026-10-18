import type { ReactNode, Ref } from "react";
import { useLocation } from "react-router";
import { cn } from "~/lib/utils";
import "./card-page.css";

export function CardPage({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    const { pathname } = useLocation();

    return (
        <main className="relative isolate flex min-h-svh items-center justify-center overflow-clip px-[min(1rem,4vw)] py-8 sm:px-6 sm:py-12">
            <section
                key={pathname}
                className={cn(
                    "card-page w-full max-w-120 rounded-2xl border border-border/70 bg-card px-[min(1.25rem,5vw)] py-8 text-card-foreground shadow-[0_12px_60px_-20px_color-mix(in_srgb,var(--brand-blue)_18%,transparent)] sm:px-9 sm:py-9",
                    className,
                )}
                aria-labelledby="page-title"
            >
                <img
                    src="/logos/caseward-logo-light.svg"
                    alt="Caseward"
                    width="511"
                    height="136"
                    className="mx-auto h-auto w-44"
                />
                {children}
            </section>
        </main>
    );
}

export function CardHeading({
    title,
    description,
    ref,
}: {
    title: string;
    description: string;
    ref?: Ref<HTMLHeadingElement>;
}) {
    return (
        <header className="mt-5 mb-7 text-center">
            <h1
                ref={ref}
                id="page-title"
                tabIndex={ref ? -1 : undefined}
                className="text-2xl font-semibold tracking-tight wrap-anywhere outline-none"
            >
                {title}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
                {description}
            </p>
        </header>
    );
}
