import { fileURLToPath, URL } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { backendProxy } from "./backend-proxy.ts";

export default defineConfig({
    plugins: [tailwindcss(), reactRouter()],
    resolve: {
        alias: {
            "~": fileURLToPath(new URL("./app", import.meta.url)),
        },
    },
    server: {
        strictPort: true,
        proxy: backendProxy,
    },
    preview: {
        // Keep prerender requests and the preview listener on the same loopback address.
        host: "127.0.0.1",
    },
});
