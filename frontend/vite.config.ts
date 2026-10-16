import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [reactRouter()],
    server: {
        strictPort: true,
    },
    preview: {
        // Keep prerender requests and the preview listener on the same loopback address.
        host: "127.0.0.1",
    },
});
