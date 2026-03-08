# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Green Planet Gardening — luxury landscaping company website for M.K. Green Planet Gardening and Landscaping Ltd (HE402756), Paphos, Cyprus. Built with Astro 5 + Tailwind CSS 4 + React islands, deployed on Netlify.

## Commands
- `npm run dev` — Start dev server (localhost:4321)
- `npm run build` — Production build (output: `dist/`)
- `npm run preview` — Preview production build locally
- `npm run audit` — Check for dependency vulnerabilities

## Architecture

**Framework:** Astro 5.x with `output: 'static'` and `@astrojs/netlify` adapter. Tailwind CSS 4 is loaded via `@tailwindcss/vite` plugin in `astro.config.mjs` (NOT `@astrojs/tailwind`, which only supports TW3).

**Page rendering flow:** Every page uses `BaseLayout.astro` which composes `SEO.astro` (meta/OG tags) + `SchemaOrg.astro` (JSON-LD) + `Header.astro` + slot + `Footer.astro` + `CookieConsent.astro`. BaseLayout accepts props: `title`, `description`, `canonical?`, `image?`, `ogType?`, `schemaType?`, `schemaData?`.

**React Island:** `PlantAI.jsx` is the only React component, loaded with `client:load` on `/plant-ai`. It sends base64 images to the Netlify Function at `/.netlify/functions/identify-plant`, which calls PlantNet API for identification then Claude API for a Cyprus-specific care guide.

**Blog system:** Content Collections in `src/content/blog/` with Zod schema in `src/content/config.ts`. Blog posts are Markdown with frontmatter (title, description, pubDate, author, image, imageAlt, tags, category). Dynamic routes via `src/pages/blog/[...slug].astro`.

**Data files:** Static JSON in `src/data/` for navigation, services, testimonials, and gallery items — imported directly in page components.

**Email obfuscation:** Contact email is never in plain HTML. Uses `data-email` + `data-domain` attributes with JS reveal (in `Footer.astro` and `contact.astro`).

## Theme Colors (src/styles/global.css)
Defined via Tailwind 4 `@theme`: forest (#1B3A2D), sage (#6B8F71), sand (#D4C5A9), gold (#C8A951), cream (#FAF8F5), charcoal (#2D2D2D), warm-gray (#8B8680). Fonts: Playfair Display (headings), Inter (body).

## API Keys
Stored in `../api-keys/.env.example` (outside repo). For Netlify deployment, set as environment variables. The Netlify Function (`netlify/functions/identify-plant.js`) reads `PLANTNET_API_KEY` and `ANTHROPIC_API_KEY` from `process.env`.

## n8n Blog Autopilot
- Instance: `https://n8n.srv1125865.hstgr.cloud/`
- Workflow: "[Green Planet] Blog Autopilot" (ID: 6ggSdbYzqAKTXPak), runs every 10 days
- Tags: `green-planet`, `blog-autopilot`
- Flow: Schedule -> Claude topic selection -> Claude content writing -> Unsplash/Pexels image search -> GitHub commit (image + markdown) -> Netlify auto-rebuild
- **Other projects exist in this n8n instance — NEVER modify existing workflows. Only create new ones prefixed with "[Green Planet]".**

## Security
- Full security headers in `netlify.toml` (CSP, HSTS, X-Frame-Options, CORS, etc.)
- Contact form: Netlify Forms with honeypot field, input sanitization, pattern validation
- Netlify Function: CORS origin validation, 7MB size limit, MIME type validation, generic error responses
- GDPR cookie consent banner blocks analytics until user consents
