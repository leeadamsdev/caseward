import type { ReactNode } from "react";
import { Links, Meta, Outlet, Scripts } from "react-router";
import interLatin from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import "~/app.css";
import { ErrorPage } from "~/components/feedback/error-page";
import { LoadingPage } from "~/components/feedback/loading-page";
import { BrandBackground } from "~/components/layout/brand-background";

export function meta() {
    return [{ title: "Caseward" }];
}

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
                <Meta />
                <link
                    rel="preload"
                    href={interLatin}
                    as="font"
                    type="font/woff2"
                    crossOrigin="anonymous"
                />
                <Links />
            </head>
            <body className="relative isolate">
                <BrandBackground />
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
    return <LoadingPage />;
}

export function ErrorBoundary() {
    return <ErrorPage />;
}
