# ttyfy

Spotify, but it is a terminal. A theme for [Spicetify](https://spicetify.app).

When Spotify opens you get a black screen with a prompt. No covers, no buttons, no player bar. You type commands. Music keeps playing underneath.

Press Ctrl+` (or type `/gui`) to hide the terminal and see normal Spotify, which is also restyled like a terminal: monospace font, square corners, 1px borders. Press Ctrl+` again to come back.

## Color schemes

- `green` (default): classic green on black
- `amber`: amber on black
- `white`: white on black
- `solarized`: soft solarized colors on a dark teal background

## Commands

| command | what it does |
| --- | --- |
| `/playlist` | list your playlists (Liked Songs is first) |
| `/playlist 2` or `/playlist road` | open a playlist as a plain list of songs |
| `/more` | next page of a long list |
| `/play` | resume |
| `/play 5` | play item 5 of the list on screen |
| `/play some words` | search and play the first match |
| `/search words` | list songs, then `/play 3` |
| `/pause`, `/resume`, `/toggle` | control playback |
| `/next`, `/prev` | skip |
| `/now` | the current song |
| `/queue` | what plays next |
| `/vol 40`, `/vol +10` | volume |
| `/seek 1:30`, `/seek +10` | jump in the song |
| `/shuffle`, `/repeat` | toggle shuffle, cycle repeat |
| `/like`, `/unlike` | save or remove the current song |
| `/bar` | show or hide a one-line player bar at the bottom (off by default) |
| `/clear` | clear the screen |
| `/gui` | hide the terminal (Ctrl+` brings it back) |

Tab completes a command. Up and down arrows bring back old commands.

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

This is unofficial and not made by Spotify. The terminal covers Spotify's own screens, so pop-ups such as a login or update window can end up hidden behind it. Use `/gui` to reach them. Spotify changes its interface often, so parts of the theme can break after an update. The few rules that depend on Spotify class names are in one section of `user.css`. The commands use Spicetify's API in `theme.js`, which can also change. If something looks wrong, open an issue.

## License

See `LICENSE`.
