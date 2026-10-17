import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { ButtonLink } from "~/components/ui/button";
import "./auth.css";

export function AuthShell({ children }: { children: ReactNode }) {
    const { pathname } = useLocation();

    return (
        <main className="relative isolate flex min-h-svh items-center justify-center overflow-clip px-4 py-8 sm:px-6 sm:py-12">
            <section
                key={pathname}
                className="auth-card w-full max-w-120 rounded-2xl border border-border/70 bg-card px-5 py-8 text-card-foreground shadow-[0_12px_60px_-20px_color-mix(in_srgb,var(--brand-blue)_18%,transparent)] sm:px-9 sm:py-9"
                aria-labelledby="auth-title"
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
