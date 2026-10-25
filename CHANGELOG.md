# Changelog

## 0.3

- Added `/cava`: bars that follow the song, drawn as solid blocks.
- Added `/recent`, `/random`, `/go`, `/filter`, `/last`, `/album`, `/artist`, `/theme`, `/about` and `/debug`.
- `/queue 3` adds a song from the list on screen. `/shuffle` and `/repeat` accept a value.
- The terminal opens on your playlists. A blinking block cursor in the prompt.
- Tab completes playlist names. A semicolon chains commands.
- Many fixes: slow loads no longer replace a newer list, clearer error messages, better input handling, readable colors in the solarized scheme.

## 0.2

- Typing a number picks from the list on screen. `/back`, `/more`, short `/help`.
- A black cover until the terminal is ready, so normal Spotify does not flash at launch.

## 0.1

- First version: terminal screen, playlists, search, play, pause, skip, volume, color schemes.
