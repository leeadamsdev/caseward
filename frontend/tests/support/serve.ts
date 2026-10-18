import { preview } from "vite";
import { backendProxy } from "../../backend-proxy.ts";

await preview({
    // Serve the static SPA without React Router's server-side preview hooks.
    configFile: false,
    build: {
        outDir: "build/client",
    },
    preview: {
        host: "127.0.0.1",
        port: 4173,
        strictPort: true,
        proxy: backendProxy,
    },
});
