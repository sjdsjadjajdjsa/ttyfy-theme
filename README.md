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
| `/go words` | jump to the best match in the list on screen |
| `/recent` | songs and playlists you played lately |
| `/play words` | play the first match |
| `/pause`, `/resume` | control playback |
| `/next`, `/previous` | skip |
| `/now` | the current song, with progress |
| `/help` | this short list. `/help all` shows every command, `/help play` explains one |

When a list is on screen, just type its number. In a playlist list it opens that playlist, in a song list it plays that song. `/back` goes back to the last list. Lists fit your window, `/more` shows the next page. `/filter words` keeps only the matching rows of a long list. While a playlist is open, `/play` with a few words plays the matching song from it.

Find more of the same:

| command | what it does |
| --- | --- |
| `/album` | the album of the playing song, `/album 4` uses song 4 on screen |
| `/artist` | top songs of the playing artist, `/artist 4` uses song 4 on screen |
| `/queue` | what plays next |
| `/queue 3` | add song 3 on screen to the queue |
| `/last` | reopen the last playlist you opened |
| `/random` | play a random playlist |
| `/cava` | moving bars above the prompt that follow the song. `/cava off` hides them, `/cava bars 24`, `/cava rows 6` change the size |

The rest: `/toggle`, `/vol 40`, `/vol +10`, `/seek 1:30`, `/seek +10`, `/shuffle` (or `/shuffle on`, `/shuffle off`), `/repeat` (or `/repeat off`, `/repeat all`, `/repeat one`), `/like`, `/unlike`, `/theme amber` (colors: green, amber, white, solarized, default), `/bar` (a one-line player bar at the bottom, off by default), `/clear`, `/about`, `/gui`.

Tab completes commands, playlist names (`/playlist road` then Tab) and color names. Up and down arrows bring back old commands. A semicolon before a `/command` chains commands: `/vol 30; /next`. PageUp and PageDown scroll the screen.

The `/cava` bars follow the song's loudness, beat and notes from Spotify's stored analysis, played back in time with the music. Spotify gives themes no live sound, so it is not a true spectrum, and a few songs have no analysis (the bars then stay flat).

On start the terminal opens on your playlists, so you can type a number right away.

If something does not work, run `/debug live`. It checks which Spicetify features your Spotify version has and tries each one without changing anything. Send the output with your bug report.

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

Not added yet. `preview.png` is a placeholder, replace it with a real screenshot before listing the theme.

## Install from the Marketplace

Set `current_theme` to `marketplace`, then install ttyfy from the Themes tab. Manual install and Marketplace install are either/or, pick one. The terminal covers the Marketplace screen, so press Ctrl+` first if you want to uninstall.

`/theme` colors override the Marketplace scheme picker until you run `/theme default`.

## Notes

This is unofficial and not made by Spotify. The terminal covers Spotify's own screens, so pop-ups such as a login or update window can end up hidden behind it. Use `/gui` to reach them. Spotify changes its interface often, so parts of the theme can break after an update. The few rules that depend on Spotify class names are in one section of `user.css`. The commands use Spicetify's API in `theme.js`, which can also change. If something looks wrong, open an issue.

## License

See `LICENSE`.
