# UMP1RE Web

Marketing site for UMP1RE (watch-based live padel scoring). Static HTML/CSS/JS, deployed on Cloudflare Pages. No build step, no framework, no package.json.

## Structure

- `index.html` — single-page marketing site. Has a large inline `<style>` block (header/hero overrides) in addition to `assets/home.css` — these should eventually be merged into one stylesheet.
- `assets/home.css`, `assets/home.js` — shared styles/behavior for the home page.
- `assets/subscribe.css`, `assets/success.css` — styles for `subscribe/`.
- `subscribe/index.html`, `subscribe/success.html` — subscription flow pages.
- `manifest.json` — PWA manifest (icons, theme colour, standalone display).
- `UMP1RE on a Page` — the product vision doc. Read this first for full context on what UMP1RE does/will do (app scoring flow, club court screens, Connect notifications, event management, media/sponsor system, future roadmap). Site copy should stay consistent with this, but the site should only advertise features that actually exist — don't add roadmap items to marketing copy without checking with the user first.

## Conventions

- **Audience toggle**: the whole page is one DOM with `data-audience="players"` or `"clubs"` on `<body>`, toggled by `assets/home.js` (`setAudience`). Sections/elements are scoped with `data-audience="players"` / `data-audience="clubs"` and hidden/shown accordingly. When adding content, tag it correctly rather than creating a duplicate page.
- **Logo/wordmark swap**: brand marks are pairs of `<img>` tags (`.logo-player` / `.logo-club`, `.wordmark-logo-player` / `.wordmark-logo-club`) toggled via CSS based on `body[data-audience]`. Always add both variants when inserting a new logo instance.
- **Carousels**: `[data-scoreboard-carousel]` + `.carousel-slide` / `data-caption`, auto-advanced in `home.js`. Reuse this pattern for new image carousels rather than writing new JS.
- Preserve British English spelling in copy (colour, targeted, etc.) — matches existing tone.

## Known issues / backlog

Roughly in priority order. Confirmed by fetching the live site (ump1re-web.pages.dev), not just reading source.

1. **`/player` and `/club` are dead links.** There's no `player.html`/`club.html` and no `_redirects` file, so Cloudflare Pages falls back to serving `index.html` for both — "Get the app" and "Book a demo" currently just reload the homepage instead of doing anything. Decide the real destination (App Store link / TestFlight / a booking form / a contact page) and wire it up — either real pages or a Cloudflare Pages `_redirects` rule.
2. **Broken service worker.** `assets/home.js` registers `/sw.js`, but the file doesn't exist, so Cloudflare returns the HTML fallback with the wrong content-type, and registration fails in the console on every page load. Either add a real `sw.js` (there's already a `manifest.json` suggesting PWA intent) or remove the registration code until one exists.
3. **No social share metadata.** No Open Graph or Twitter Card tags — links shared in iMessage/WhatsApp/Slack/Twitter will show no preview image or description. Add `og:title`, `og:description`, `og:image`, `twitter:card`, etc.
4. **No `robots.txt` or `sitemap.xml`.**
5. **Duplicated styling.** The inline `<style>` block at the top of `index.html` (~250 lines) should be merged into `assets/home.css` so there's one source of truth for the header/hero/logo-swap rules.
6. **No dev tooling.** No `.vscode/settings.json`, no `.editorconfig`, no formatter/linter (Prettier/Stylelint), no simple local-dev script documented. Worth adding a minimal `.vscode/extensions.json` (recommend Live Server, Prettier) and a one-line "run locally" instruction in the README.
7. **Thin README.** Currently two lines. Should cover: what this repo is, local dev (`npx serve .` or similar), deploy process (Cloudflare Pages, presumably auto-deploy on push to `main`), and a pointer to `UMP1RE on a Page` for product context.
8. **Minor copy**: "targetted messages" / "targetted messaging" (hero trust-card, connect section) — should be "targeted".
9. **Images missing explicit width/height** on `<img>` tags in the hero/carousels — contributes to layout shift on load.

## Suggested Claude Code workflow

- Small, isolated fixes (typo, missing width/height, README) — just do them.
- `/player` and `/club` routing (#1) needs a product decision first — ask before implementing rather than guessing the destination.
- Service worker (#2) — confirm whether offline/PWA support is actually wanted before building one out; removing the dead registration is the safe default fix.
