# Betspapa

Royal-purple football prediction dashboard and client-side HT/FT common-sense engine.

## What is included

- Royal purple and gold responsive dashboard
- HT/FT transition matrix: 1/1 through 2/2
- Correct home/away orientation
- Two-team transition agreement
- GG confirmation using both teams' scoring/conceding pathways
- Over 1.5, Over 2.5 and Under 3.5 support scores
- Dominant-team Over 2.5 route
- Result, double chance and half-time markets
- Mobile, tablet and desktop layouts
- GitHub Pages workflow
- `CNAME` already set to `betspapa.com`
- PWA manifest and offline cache

## Publish from GitHub Desktop

1. Extract the `Betspapa` folder.
2. In GitHub Desktop, choose **File → Add Local Repository**.
3. Select the extracted `Betspapa` folder.
4. When prompted, create/publish the repository as **Betspapa**.
5. Commit all files and push to the `main` branch.
6. In GitHub: **Settings → Pages → Build and deployment → GitHub Actions**.
7. Under **Custom domain**, enter `betspapa.com` and enable **Enforce HTTPS** after DNS is verified.

## Hostinger DNS for GitHub Pages

Remove the old `A` record pointing `@` to the Hostinger server, then add these four `A` records:

- `185.199.108.153`
- `185.199.109.153`
- `185.199.110.153`
- `185.199.111.153`

Set `www` as a `CNAME` to:

`YOUR-GITHUB-USERNAME.github.io`

Replace `YOUR-GITHUB-USERNAME` with the account that owns the repository.

## Important production note

GitHub Pages hosts static files only. Keep API keys out of this repository. A live data pipeline or private prediction API should run separately and the frontend can call it securely.

## Responsive navigation

The interface now includes:

- Off-canvas hamburger navigation on phones, tablets and Z Fold layouts.
- A thumb-friendly five-tab mobile navigation bar for Home, Picks, Engine, Results and More.
- Responsive layouts for narrow cover screens from 320px, normal phones, tablets and unfolded foldables.
- Safe-area support for devices with notches and gesture bars.
- Mobile card rendering for the results table instead of a cramped horizontal desktop table.
- Escape-key, backdrop and resize handling for the navigation drawer.

## Render backend

This repository now includes a Node.js backend in `server/` for deployment to Render. See `RENDER_SETUP.md`.
