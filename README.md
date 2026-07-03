# Sage Nord

The website for **Sage Nord** (legal entity: Saga ApS) — a senior iOS &
mobile architecture studio.

> To empower people through software.

Minimalist single-page site with a three.js particle-morph hero, dual
light/dark theme, and content-first HTML that reads fully with JavaScript off.

## Stack

- **Vite + TypeScript**
- **three.js** — the particle morph (N-rune → globe → app grid → dissolve)
- No other runtime dependencies (reveals & theming are vanilla for INP/CWV)

## Develop

```bash
npm install
npm run dev      # local dev server
npm run build    # type-check + production build to dist/
npm run preview  # preview the production build
```

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and
publishes to GitHub Pages.

**One-time setup:** in the repo, go to **Settings → Pages → Build and
deployment → Source** and choose **GitHub Actions**.

Currently served at `https://sorunokoe.github.io/SageNord/` (Vite `base` is
`/SageNord/`). When the custom domain `sagenord.com` is ready:

1. Add `public/CNAME` containing `sagenord.com`
2. Change `base` in `vite.config.ts` to `/`
3. Point DNS at GitHub Pages

## Accessibility & performance

- Respects `prefers-reduced-motion` (static frame, no animation loop)
- WCAG 2.2 AA contrast in both themes; visible focus indicators
- Particle field caps DPR, downscales on frame drop, pauses when the tab is
  hidden or scrolled offscreen, and runs a lighter count on mobile
- The canvas is decorative (`aria-hidden`); the site is complete without it
