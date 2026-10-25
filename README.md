# ttyfy

Spotify, but it looks like a terminal. A theme for [Spicetify](https://spicetify.app).

Monospace font, black background, square corners, thin 1px borders, a `>` marker on the current item and a blinking block cursor after the track that is playing. Nothing is hidden, all buttons stay where they are.

## Color schemes

- `green` (default): classic green on black
- `amber`: amber on black
- `white`: white on black
- `solarized`: soft solarized colors on a dark teal background

## Install

You need Spicetify set up already.

1. Copy this folder into your Spicetify Themes folder and name it `ttyfy`. Find the folder with `spicetify path userdata`, then look in `Themes`.
2. Run:

```
spicetify config current_theme ttyfy
spicetify config color_scheme green
spicetify apply
```

To switch scheme, change `green` to `amber`, `white` or `solarized` and run `spicetify apply` again.

## Screenshots

Not added yet. See `preview.png` for a placeholder.

## Notes

This is unofficial and not made by Spotify. Spotify changes its interface often, so parts of the theme can break after an update. The few rules that depend on Spotify class names are in one section at the bottom of `user.css`. If something looks wrong, open an issue.

## License

See `LICENSE`.
