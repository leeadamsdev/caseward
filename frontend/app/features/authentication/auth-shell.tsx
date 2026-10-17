import type { ReactNode } from "react";
import { ButtonLink } from "~/components/ui/button";
import "./auth.css";

export function AuthShell({
    children,
    titleId = "auth-title",
}: {
    children: ReactNode;
    titleId?: string;
}) {
    return (
        <main className="auth-page relative isolate flex min-h-svh items-center justify-center overflow-clip px-4 py-8 sm:px-6 sm:py-12">
            <svg
                className="pointer-events-none absolute inset-0 -z-10 size-full text-brand-blue/8"
                viewBox="0 0 1440 1000"
                preserveAspectRatio="none"
                aria-hidden="true"
            >
                <path
                    className="auth-wave auth-wave-top"
                    fill="currentColor"
                    d="M0 240C180 500 280 30 620 150S1120 420 1440 180V0H0Z"
                />
                <path
                    className="auth-wave auth-wave-bottom"
                    fill="currentColor"
                    d="M0 740C250 560 490 1050 790 850S1160 600 1440 720V1000H0Z"
                />
            </svg>
            <section
                className="auth-card w-full max-w-120 rounded-2xl border border-border/70 bg-card px-5 py-8 text-card-foreground shadow-[0_12px_60px_-20px_color-mix(in_srgb,var(--brand-blue)_18%,transparent)] sm:px-9 sm:py-9"
                aria-labelledby={titleId}
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

export function AuthHeading({
    title,
    description,
}: {
    title: string;
    description: string;
}) {
    return (
        <header className="mt-5 mb-7 text-center">
            <h1
                id="auth-title"
                className="text-2xl font-semibold tracking-tight"
            >
                {title}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
                {description}
            </p>
        </header>
    );
}

export function AuthNavigation({
    prompt,
    to,
    label,
}: {
    prompt: string;
    to: string;
    label: string;
}) {
    return (
        <footer className="mt-6">
            <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                <p>{prompt}</p>
                <span className="h-px flex-1 bg-border" />
            </div>
            <ButtonLink to={to} variant="outline" className="w-full">
                {label}
            </ButtonLink>
        </footer>
    );
}
