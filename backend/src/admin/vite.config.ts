import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: __dirname,
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  build: {
    outDir: "../../dist/admin",
    emptyOutDir: true,
  },
  server: {
    port: 3401,
  },
});
