# GitHub Pages Deployment

This folder can be published directly with GitHub Pages as a static site.

## Simplest setup

1. Create a new GitHub repository.
2. Upload the contents of `web-beta/` to the root of that repository.
3. In GitHub, open `Settings -> Pages`.
4. Under `Build and deployment`, choose:
   - `Source`: `Deploy from a branch`
   - `Branch`: `main`
   - `Folder`: `/ (root)`
5. Save.
6. Wait for GitHub Pages to publish the site.

Your site URL will usually look like:

`https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPO_NAME/`

## Important requirement

Upload the **contents** of `web-beta`, not the `web-beta` folder itself, unless you want the app to live under a nested path.

Correct:

- `index.html`
- `SwimRoster.html`
- `app.js`
- `styles.css`
- `manifest.json`

Incorrect:

- `web-beta/index.html`
- `web-beta/SwimRoster.html`

## Why `.nojekyll` is included

GitHub Pages sometimes runs Jekyll processing by default. The included `.nojekyll` file tells Pages to serve the site as plain static files.

## iPhone instructions for testers

1. Open the GitHub Pages URL in Safari.
2. Create a local account on first launch.
3. Use `Share -> Add to Home Screen` if they want it to behave more like an app.
4. Reopen from the icon later and use the same username/password on that device.

## Data warning

All data is local to that browser on that device. If a tester:

- forgets their password
- clears Safari site data
- changes phones
- uses a different browser

their saved data will not come back.
