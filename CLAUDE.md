# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev    # Start development server at http://localhost:3000
npm run build  # Production build
npm start      # Start production server (requires build first)
npm run lint   # Run ESLint
```

## Architecture

**Stack:** Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS v4

**Path alias:** `@/*` maps to `src/*`

**App Router structure** under `src/app/`:
- `layout.tsx` — root layout with Geist fonts and global CSS
- `page.tsx` — home page (Server Component by default)
- `globals.css` — Tailwind v4 entry point (`@import "tailwindcss"`)

**Tailwind v4 specifics:** Configuration is done via CSS rather than `tailwind.config.js`. PostCSS is configured in `postcss.config.mjs` using `@tailwindcss/postcss`.

**Server vs Client components:** All components default to Server Components. Add `"use client"` only when browser APIs, event handlers, or React hooks are needed.
