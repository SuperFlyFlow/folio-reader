# Folio

A personal PDF and EPUB reader for iPhone, built as an installable web app (PWA).

- **app/** — React + Vite app (epub.js, PDF.js, Dexie for offline storage, Supabase for backup/sync)
- **supabase/functions/notion-sync/** — Edge Function that pushes highlights to the Notion "Highlights" database
- **test-books/** — generated sample EPUB and PDF for testing

## Develop

```bash
cd app && npm install && npm run dev
```

## Deploy

Run `app/deploy.sh` to build and publish to GitHub Pages (`gh-pages` branch).

## Install on iPhone

Open the site in Safari → Share → **Add to Home Screen**.
