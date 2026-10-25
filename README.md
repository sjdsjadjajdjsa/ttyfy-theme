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

Start with these:

| command | what it does |
| --- | --- |
| `/playlist` | list your playlists (Liked Songs is first), then type a number to open one |
| `/search words` | list songs, then type a number to play one |
| `/play words` | play the first match |
| `/pause`, `/resume` | control playback |
| `/next`, `/previous` | skip |
| `/now` | the current song |
| `/help` | this short list. `/help all` shows every command |

When a list is on screen, just type its number. In a playlist list it opens that playlist, in a song list it plays that song. `/back` goes back to the last list. Lists show 15 rows at a time, `/more` shows the next 15. While a playlist is open, `/play` with a few words plays the matching song from it.

The rest: `/toggle`, `/queue`, `/vol 40`, `/vol +10`, `/seek 1:30`, `/seek +10`, `/shuffle`, `/repeat`, `/like`, `/unlike`, `/bar` (a one-line player bar at the bottom, off by default), `/clear`, `/gui`.

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
