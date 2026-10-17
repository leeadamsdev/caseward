import type { ReactNode } from "react";

export function PageShell({
    children,
    titleId = "page-title",
    showLogo = true,
}: {
    children: ReactNode;
    titleId?: string;
    showLogo?: boolean;
}) {
    return (
        <div className="relative isolate flex min-h-svh flex-col overflow-clip">
            {showLogo && (
                <header className="px-6 py-7 sm:px-11 sm:py-9">
                    <img
                        src="/logos/caseward-logo-light.svg"
                        alt="Caseward"
                        width="511"
                        height="136"
                        className="h-auto w-37 sm:w-40"
                    />
                </header>
            )}
            <main className="flex flex-1 items-center justify-center px-6 pt-8 pb-30 sm:pt-12 sm:pb-32.5">
                <section
                    className="w-full max-w-135 text-center"
                    aria-labelledby={titleId}
                >
                    {children}
                </section>
            </main>
        </div>
    );
}
