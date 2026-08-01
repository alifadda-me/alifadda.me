# Ali Fadda — alifadda.me

Personal site built with [Astro Theme Cactus](https://github.com/chrismwilliams/astro-theme-cactus).

## Local development

```bash
npm install
npx playwright install chromium
npm run dev
```

## Management

### New blog post

Add `src/content/post/my-slug/index.md` (or `my-slug.md`):

```yaml
---
title: "My post"
description: "Short summary used for RSS and SEO (keep it clear)."
publishDate: 2026-08-15
tags: ["backend", "ai"]
---
```

Commit and push → Vercel deploys.

### Update resume

Edit **only** `src/content/resume.md`, then:

```bash
npm run resume:pdf
```

That regenerates `public/Ali-Fadda-Resume.pdf`. Commit the updated PDF (Vercel can’t run Playwright), then push. Visiting `/resume` serves that PDF inline in the browser.

### Site identity

- Name, URL, description: `src/site.config.ts`
- Social icons: `src/components/SocialList.astro`
- Home / About copy: `src/pages/index.astro`, `src/pages/about.astro`
