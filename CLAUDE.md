# ttyfy

A Spicetify theme that makes Spotify look like a terminal. It is a theme, not a custom app. Use the name "ttyfy" everywhere.

## Files

- `user.css`: all the styling. Sections 1 to 5 use only `--spice-*` variables, tags and role/aria/data-testid attributes. Section 6 is the only place for Spotify class names, keep it that way and keep it commented.
- `color.ini`: color schemes. The first one (`green`) is the default.
- `manifest.json`: Spicetify Marketplace entry.
- `preview.png`: placeholder image, replace with a real screenshot.
- `README.md`: install steps for users.

## Colors

`user.css` reads colors from the scheme through variables: `--tty-accent` is `button`, `--tty-fg` is `text`, `--tty-dim` is `subtext`, `--tty-bg` is `main`, `--tty-line` is `misc`. Do not hard code colors in `user.css`, except the fallbacks in section 1.

## Add a color scheme

1. Copy a block in `color.ini`, for example `[green]`, and rename it.
2. Change the values. Hex without `#`. Keep every key, Spicetify wants them all.
3. Add the scheme name to the list in `README.md`.
4. Test it (below).

Check that `text` and `subtext` are readable on `main`.

## Test

There is no build and Spotify cannot run in CI, so test by hand:

1. Copy the repo folder to `<userdata>/Themes/ttyfy` (`spicetify path userdata`).
2. `spicetify config current_theme ttyfy color_scheme <scheme>` then `spicetify apply`.
3. For faster edits: `spicetify watch -s` reloads on every save.
4. Use `spicetify enable-devtool` and Ctrl+Shift+I in Spotify to inspect elements.
5. Check each scheme: sidebar, home, a playlist, search, player bar, a context menu, the right sidebar.
6. Check `manifest.json` is valid JSON.

## Rules

- No rounded corners, shadows or gradients.
- Never hide or disable a button.
- Prefer variables and attributes over class names. If a class name is needed, put it in section 6.
- Write comments and docs in plain words.
