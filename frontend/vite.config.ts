import { fileURLToPath, URL } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [tailwindcss(), reactRouter()],
    resolve: {
        alias: {
            "~": fileURLToPath(new URL("./app", import.meta.url)),
        },
    },
    server: {
        strictPort: true,
        proxy: {
            "/api": {
                target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000",
                changeOrigin: true,
            },
        },
    },
    preview: {
        // Keep prerender requests and the preview listener on the same loopback address.
        host: "127.0.0.1",
    },
});
