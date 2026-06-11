import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // sw.js はViteのビルド対象外にしてpublicからそのままコピー
  publicDir: "public",
});
