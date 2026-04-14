# Hosted Beta

This folder is the hosted web beta version of the app.

## What it does

- Runs as a static website
- Supports iPhone Safari and Add to Home Screen
- Stores all app data locally in the browser on each device
- Uses a device-local username + password to encrypt saved data
- Does not send account or roster data to any server

## Important limitation

If a user clears Safari website data, switches browsers, changes devices, or forgets their password, their data is effectively gone. There is no server-side recovery.

## Recommended hosting

- GitHub Pages
- Netlify
- Cloudflare Pages

## Publish

Upload the contents of this folder as a static site and use `index.html` as the entry point.

For GitHub Pages specifically, see [`README-GITHUB-PAGES.md`](./README-GITHUB-PAGES.md).

## First-time use on iPhone

1. Open the site in Safari.
2. Create a local account.
3. Optionally use Share -> Add to Home Screen.
4. Reopen from Safari or the home screen icon later and sign back into the same local account.
