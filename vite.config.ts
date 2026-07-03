import { defineConfig } from "vite";

// Deployed to GitHub Pages project site: sorunokoe.github.io/SageNord/
// When the custom domain sagenord.com is wired up, change base to "/".
export default defineConfig({
  base: "/SageNord/",
  build: {
    target: "es2022",
  },
});
