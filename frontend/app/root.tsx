import type { ReactNode } from "react";
import { Outlet, Scripts } from "react-router";

export function Layout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1"
                />
                <title>Caseward</title>
            </head>
            <body>
                {children}
                <Scripts />
            </body>
        </html>
    );
}

export default function App() {
    return <Outlet />;
}

export function HydrateFallback() {
    return (
        <main>
            <p role="status">Loading Caseward…</p>
        </main>
    );
}

export function ErrorBoundary() {
    return (
        <main>
            <h1>Something went wrong</h1>
            <p>Please try again.</p>
            <a href="/">Return to home</a>
        </main>
    );
}
