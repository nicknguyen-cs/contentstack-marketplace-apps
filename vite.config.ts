import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

function stripCssImports(): Plugin {
  return {
    name: "strip-css-imports",
    enforce: "pre",
    transform(code, id) {
      if (id.endsWith(".css") && id.includes("venus-components")) {
        return code.replace(/@import\s+url\([^)]*\)\s*;?/g, "");
      }
    },
  };
}

export default defineConfig({
  plugins: [stripCssImports(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
  },
  server: {
    port: 3000,
    open: true,
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "es2020",
    },
  },
  esbuild: {
    logOverride: { "this-is-undefined-in-esm": "silent" },
  },
});
