const backend = {
    target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000",
    changeOrigin: true,
};

export const backendProxy = {
    "/api": backend,
    "/sanctum/csrf-cookie": backend,
};
