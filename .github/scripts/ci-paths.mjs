export function affectedJobs(paths) {
    const shared = paths.some(
        (path) =>
            path.startsWith(".github/") ||
            (!path.includes("/") &&
                !/^(?:LICENSE(?:\..*)?|.*\.md)$/i.test(path)),
    );
    const backend =
        shared ||
        paths.some((path) =>
            /^(?:backend\/|docker\/(?:backend|postgres|valkey)\/)/.test(path),
        );
    const frontend =
        shared ||
        paths.some(
            (path) =>
                path === "backend/openapi.json" ||
                /^(?:frontend\/|docker\/frontend\/)/.test(path),
        );
    const integration =
        backend || frontend || paths.some((path) => path.startsWith("docker/"));
    return { backend, frontend, integration };
}
