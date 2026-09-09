import { defineConfig } from "vite";

const API_PORT = process.env.PORT ?? "8787";

export default defineConfig({
  server: {
    // The browser never talks to Anthropic directly - every model call is
    // proxied through the local API server, which is the only holder of the key.
    proxy: { "/api": { target: `http://localhost:${API_PORT}`, changeOrigin: true } },
  },
});
