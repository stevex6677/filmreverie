import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.FILM_PHOTO_HOST || "127.0.0.1";
const allowedHosts = process.env.FILM_PHOTO_ALLOWED_HOSTS?.split(',');
const https = process.env.FILM_PHOTO_TLS_CERT && process.env.FILM_PHOTO_TLS_KEY
  ? {cert:readFileSync(process.env.FILM_PHOTO_TLS_CERT),key:readFileSync(process.env.FILM_PHOTO_TLS_KEY)} : undefined;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host,
    https,
    port: 5178,
    strictPort: true,
    allowedHosts,
  },
  preview: {
    host,
    https,
    port: 5178,
    strictPort: true,
    allowedHosts,
  },
});
