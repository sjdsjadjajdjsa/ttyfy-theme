# ttyfy

A Spicetify theme that turns Spotify into a command line. It is a theme, not a custom app: `theme.js` sits next to `user.css`, Spicetify loads both. Use the name "ttyfy" everywhere.

## Files

- `theme.js`: draws a full-screen terminal over Spotify and runs the slash commands with the Spicetify API (`Spicetify.Player`, `Platform.RootlistAPI`, `PlaylistAPI`, `LibraryAPI`, `CosmosAsync`). It builds text with `textContent`, never HTML. To add a command, add an entry to the `commands` object (name, `desc`, `run(args)`). If it fails to start, the CSS-only look still works.
- `user.css`: all the styling. Sections 1 to 5 use only `--spice-*` variables, tags and role/aria/data-testid attributes. Section 6 is the only place for Spotify class names, keep it that way and keep it commented. Section 7 styles the terminal and only uses ids that theme.js creates.
- `color.ini`: color schemes. The first one (`green`) is the default. `theme.js` has a copy of the same colors (`PALETTES`) for `/theme`, so change both when you add or edit a scheme.
- `manifest.json`: Spicetify Marketplace entry.
- `preview.png`: placeholder image, replace with a real screenshot.
- `README.md`: install steps for users.

## Colors

`user.css` reads colors from the scheme through variables: `--tty-accent` is `button`, `--tty-fg` is `text`, `--tty-dim` is `subtext`, `--tty-bg` is `main`, `--tty-line` is `misc`. Do not hard code colors in `user.css`, except the fallbacks in section 1.

## Add a color scheme

1. Copy a block in `color.ini`, for example `[green]`, and rename it.
2. Change the values. Hex without `#`. Keep every key, Spicetify wants them all.
3. Add the same colors to `PALETTES` in `theme.js`, and the scheme name to the list in `README.md`.
4. Test it (below).

Check that `text` and `subtext` are readable on `main`.

## Test

There is no build and Spotify cannot run in CI, so test by hand:

1. Copy the repo folder to `<userdata>/Themes/ttyfy` (`spicetify path userdata`).
2. `spicetify config current_theme ttyfy color_scheme <scheme>` then `spicetify apply`.
3. For faster edits: `spicetify watch -s` reloads on every save.
4. Use `spicetify enable-devtool` and Ctrl+Shift+I in Spotify to inspect elements.
5. Check each scheme in the terminal and, after `/gui`, in normal Spotify: home, a playlist, search, player bar, a context menu, the right sidebar.
6. Try every command in the README table. `/debug live` shows which Spicetify features work in the Spotify you run.
7. Run `node scripts/check.js`. It checks `manifest.json`, the syntax of `theme.js`, and that `color.ini` and the `PALETTES` copy in `theme.js` agree. The same check runs on GitHub on every push (`.github/workflows/check.yml`).

To try theme.js without Spotify, load it in a plain HTML page with a fake `Spicetify` object (Playwright works).

## Publishing

The Marketplace lists any public repo with the GitHub topic `spicetify-themes` and a `manifest.json` in the root of the default branch. It loads `theme.js` from the `include` URL, which must be absolute. Replace `preview.png` with a real screenshot first. Marketplace installs cache files through jsDelivr, so a push can take hours to reach users.

## Rules

- No rounded corners, shadows or gradients.
- The terminal is the main screen. Keep an escape back to normal Spotify (`/gui`, Ctrl+`).
- Prefer variables and attributes over class names. If a class name is needed, put it in section 6.
- Write comments and docs in plain words.
