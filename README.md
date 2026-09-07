# Rahul Gupta — portfolio

One portfolio, five interfaces. Static HTML: no build step, no dependencies,
no server-side code. Every page is a single self-contained file.

## Structure

    index.html          the hub — links to all five
    os/index.html       RahulOS — the portfolio as a phone, 4 switchable themes
    studio/index.html   Studio — preloader, magnetic cursor, drag gallery
    fieldops/index.html fieldops — a terminal you can type into
    notes/index.html    Field Notes — riso print, oversized type
    drawing/index.html  Drawing 001 — a CAD sheet with three live drawings
    assets/             SVG favicons
    robots.txt
    .nojekyll           tells GitHub Pages to serve the folder as-is

## Deploy

Everything is static, so any host works. Pick one:

**Netlify (drag and drop)**
Go to app.netlify.com/drop and drag this whole folder onto the page. Done.

**Vercel**

    npx vercel deploy --prod

**GitHub Pages**

    git init && git add . && git commit -m "Portfolio"
    git branch -M main
    git remote add origin git@github.com:Rahulg1999/<repo>.git
    git push -u origin main

Then in the repo: Settings -> Pages -> Deploy from branch -> main -> / (root).

**Any Apache/nginx/cPanel host**
Upload the contents of this folder to your web root (`public_html`, `www`,
or wherever the host serves from). No configuration needed — the folder
structure gives you clean URLs (`/os/`, `/fieldops/`) automatically.

## After you have a domain

Two things worth adding once the URL is known:

1. In each page's `<head>`, add `<meta property="og:url" content="https://yourdomain.com/...">`
   and an `og:image` so links unfurl nicely in WhatsApp and LinkedIn.
2. Point `rahulgupta.dev` (or whichever domain) at the host and enable HTTPS —
   every host above does this for free.

## Notes

- Fonts load from Google Fonts; everything else (the FireArrest app icon, all
  brand logos) is embedded directly in the HTML, so the pages work offline
  apart from the type.
- The FireArrest launcher icon came from your own repo
  (`android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png`).
- Every page respects `prefers-reduced-motion` and `prefers-color-scheme`.
- Each of the five carries a "All interfaces" link back to the hub, bottom left.
