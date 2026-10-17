export default function NotFound() {
    return (
        <main className="space-y-4 p-6">
            <h1 className="text-2xl font-semibold tracking-tight">
                Page not found
            </h1>
            <p className="text-muted-foreground">
                The requested page could not be found.
            </p>
            <a className="text-primary underline underline-offset-4" href="/">
                Return to home
            </a>
        </main>
    );
}
