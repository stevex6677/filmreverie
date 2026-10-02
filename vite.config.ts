import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
import { devAdminBridge } from './scripts/dev-admin-bridge.ts';
import { readDeployment } from './scripts/cloudflare-config.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.FILM_PHOTO_HOST || "127.0.0.1";
const allowedHosts = process.env.FILM_PHOTO_ALLOWED_HOSTS?.split(',') ?? [
  "macbook",
  "macbook.tail2b1388.ts.net",
];
const https = process.env.FILM_PHOTO_TLS_CERT && process.env.FILM_PHOTO_TLS_KEY
  ? {cert:readFileSync(process.env.FILM_PHOTO_TLS_CERT),key:readFileSync(process.env.FILM_PHOTO_TLS_KEY)} : undefined;
const proxy = process.env.FILM_PHOTO_CLOUD_API
  ? { '/api': { target: process.env.FILM_PHOTO_CLOUD_API } }
  : undefined;

const bridgeEnabled = process.env.FILM_PHOTO_DEV_ADMIN_BRIDGE === '1';
export default defineConfig(({ command, isPreview }) => {
  const deployment = bridgeEnabled && command === 'serve' && !isPreview ? readDeployment() : undefined;
  return {
    plugins: [react(), ...(deployment ? [devAdminBridge({
      origins: process.env.FILM_PHOTO_DEV_ADMIN_ORIGINS?.split(',').filter(Boolean) ?? deployment.devLoginOrigins,
      appOrigin: deployment.appOrigin, photoOrigin: deployment.photoOrigin,
    })] : [])],
    ...(deployment ? { define: { 'import.meta.env.VITE_FILM_PHOTO_ADMIN_LOGIN_URL': JSON.stringify('/api/dev-auth/login') } } : {}),
    resolve: {
      dedupe: ['three'],
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
      proxy,
    },
    preview: {
      host,
      https,
      port: 5178,
      strictPort: true,
      allowedHosts,
      proxy,
    },
  };
});
