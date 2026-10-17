import type { ReactNode } from "react";
import { Outlet, Scripts } from "react-router";
import "~/app.css";

export function Layout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1"
                />
                <meta name="theme-color" content="#151B38" />
                <link
                    rel="icon"
                    type="image/x-icon"
                    href="/favicons/favicon.ico"
                />
                <link
                    rel="icon"
                    type="image/svg+xml"
                    sizes="any"
                    href="/favicons/favicon.svg"
                />
                <link
                    rel="apple-touch-icon"
                    sizes="180x180"
                    href="/favicons/apple-touch-icon.png"
                />
                <link
                    rel="mask-icon"
                    href="/favicons/safari-pinned-tab.svg"
                    color="#377CF6"
                />
                <link rel="manifest" href="/favicons/site.webmanifest" />
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
        <main className="p-6">
            <p className="text-muted-foreground" role="status">
                Loading Caseward…
            </p>
        </main>
    );
}

export function ErrorBoundary() {
    return (
        <main className="space-y-4 p-6">
            <h1 className="text-2xl font-semibold tracking-tight">
                Something went wrong
            </h1>
            <p className="text-muted-foreground">Please try again.</p>
            <a className="text-primary underline underline-offset-4" href="/">
                Return to home
            </a>
        </main>
    );
}
