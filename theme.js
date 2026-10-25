// ttyfy: a command line for Spotify.
// Spicetify loads this file next to user.css. It draws a full-screen terminal
// over Spotify's normal interface. Music keeps playing underneath.
// If this file fails to start, the theme falls back to the plain CSS look.
//
// Ctrl+` hides or shows the terminal. /gui does the same.

(function ttyfy() {
	"use strict";

	const VERSION = "0.1";
	const PAGE = 15; // rows shown per page in a list
	const MAX_LINES = 600; // lines kept in the output
	const ALIASES = { "?": "help", h: "help", n: "next", b: "back", prev: "previous", q: "queue", pl: "playlist", playlists: "playlist", ls: "playlist", s: "search", find: "search", p: "toggle", m: "more", exit: "gui", np: "now" };

	// Same colors as color.ini. Keep the two in sync (see CLAUDE.md).
	const PALETTES = {
		green: { text: "33ff33", subtext: "22aa22", main: "000000", sidebar: "000000", player: "000000", card: "061006", button: "33ff33", "button-active": "99ff99", "button-disabled": "145214", "tab-active": "0b2a0b", notification: "0b2a0b", "notification-error": "ff4040", "selected-row": "66ff66", misc: "1c5c1c" },
		amber: { text: "ffb000", subtext: "b37a00", main: "000000", sidebar: "000000", player: "000000", card: "140e00", button: "ffb000", "button-active": "ffd36b", "button-disabled": "5c4000", "tab-active": "2a1d00", notification: "2a1d00", "notification-error": "ff4040", "selected-row": "ffcc55", misc: "664600" },
		white: { text: "e6e6e6", subtext: "9a9a9a", main: "000000", sidebar: "000000", player: "000000", card: "0f0f0f", button: "ffffff", "button-active": "cccccc", "button-disabled": "4d4d4d", "tab-active": "1f1f1f", notification: "1f1f1f", "notification-error": "ff5555", "selected-row": "ffffff", misc: "555555" },
		solarized: { text: "93a1a1", subtext: "657b83", main: "002b36", sidebar: "002b36", player: "002b36", card: "073642", button: "2aa198", "button-active": "35c4b9", "button-disabled": "586e75", "tab-active": "073642", notification: "073642", "notification-error": "dc322f", "selected-row": "eee8d5", misc: "586e75" },
	};

	// localStorage can be missing or blocked, so every use is wrapped.
	function store(key, value) {
		try {
			if (value === undefined) return JSON.parse(localStorage.getItem("ttyfy." + key));
			if (value === null) localStorage.removeItem("ttyfy." + key);
			else localStorage.setItem("ttyfy." + key, JSON.stringify(value));
		} catch (e) {
			return null;
		}
		return value;
	}

	function applyPalette(name) {
		const style = document.documentElement.style;
		const keys = Object.keys(PALETTES.green);
		keys.forEach((k) => {
			style.removeProperty("--spice-" + k);
			style.removeProperty("--spice-rgb-" + k);
		});
		const p = PALETTES[name];
		if (!p) return;
		keys.forEach((k) => {
			const hex = p[k];
			style.setProperty("--spice-" + k, "#" + hex);
			style.setProperty("--spice-rgb-" + k, [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(","));
		});
	}

	function ready() {
		return (
			document.body &&
			window.Spicetify &&
			Spicetify.Player &&
			Spicetify.Player.playUri &&
			Spicetify.Platform &&
			Spicetify.CosmosAsync
		);
	}

	const savedTheme = store("theme");
	if (savedTheme) applyPalette(savedTheme);

	let tries = 0;
	const wait = setInterval(() => {
		tries++;
		if (!ready()) {
			if (tries > 300) clearInterval(wait);
			return;
		}
		clearInterval(wait);
		try {
			start();
		} catch (e) {
			console.error("ttyfy: could not start", e);
		}
	}, 200);

	function start() {
		if (document.getElementById("ttyfy")) return; // already running
		const Player = Spicetify.Player;
		const state = {
			view: null, // { kind: "playlists" | "tracks" | "search", title, uri, items, shown }
			playlists: null, // cached list of the user's playlists
			stack: [], // lists you came from, for /back
			history: [],
			hpos: 0,
			bar: false,
			timer: null,
		};

		// ---------- small helpers ----------

		function el(tag, id, cls) {
			const e = document.createElement(tag);
			if (id) e.id = id;
			if (cls) e.className = cls;
			return e;
		}

		function fmtTime(ms) {
			const s = Math.max(0, Math.floor((ms || 0) / 1000));
			return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
		}

		function artistsOf(t) {
			if (!t) return "";
			if (Array.isArray(t.artists)) return t.artists.map((a) => a.name).filter(Boolean).join(", ");
			return typeof t.artists === "string" ? t.artists : "";
		}

		function durOf(t) {
			if (!t) return 0;
			if (t.duration && typeof t.duration === "object") return t.duration.milliseconds || 0;
			return t.duration_ms || (typeof t.duration === "number" ? t.duration : 0);
		}

		function current() {
			const d = Player.data;
			return d && d.item ? d.item : null;
		}

		// ---------- page ----------

		const root = el("div", "ttyfy");
		const head = el("div", "ttyfy-head");
		const out = el("div", "ttyfy-out");
		const bar = el("div", "ttyfy-bar");
		const prompt = el("div", "ttyfy-prompt");
		const ps = el("span", "ttyfy-ps");
		const input = el("input", "ttyfy-in");

		head.textContent = "ttyfy " + VERSION;
		bar.hidden = true;
		ps.textContent = "ttyfy> ";
		input.type = "text";
		input.spellcheck = false;
		input.autocomplete = "off";
		input.autocapitalize = "off";
		input.setAttribute("aria-label", "command line");
		if (/Mac/i.test(navigator.platform || "")) root.classList.add("ttyfy-mac");

		prompt.append(ps, input);
		root.append(head, out, bar, prompt);
		document.body.appendChild(root);

		function print(text, cls) {
			const line = el("div", "", cls ? "ty-" + cls : "");
			line.textContent = text;
			out.appendChild(line);
			while (out.childNodes.length > MAX_LINES) out.removeChild(out.firstChild);
			out.scrollTop = out.scrollHeight;
		}

		function printAll(lines, cls) {
			lines.forEach((l) => print(l, cls));
		}

		function setTitle() {
			const v = state.view;
			head.textContent = "ttyfy " + VERSION + (v ? "  /  " + v.title : "");
		}

		function setGui(showGui) {
			root.classList.toggle("ttyfy-hidden", showGui);
			if (!showGui) input.focus();
		}

		function toggleGui() {
			setGui(!root.classList.contains("ttyfy-hidden"));
		}

		// ---------- bar ----------

		function renderBar() {
			if (!state.bar) return;
			const t = current();
			if (!t) {
				bar.textContent = "[--] nothing playing";
				return;
			}
			const dur = Player.getDuration() || durOf(t);
			const pos = Player.getProgress();
			const width = 20;
			const filled = dur ? Math.min(width, Math.round((pos / dur) * width)) : 0;
			const meter = "#".repeat(filled) + "-".repeat(width - filled);
			const rep = ["off", "all", "one"][Player.getRepeat()] || "off";
			bar.textContent =
				(Player.isPlaying() ? "[>] " : "[||] ") +
				t.name + " - " + artistsOf(t) +
				"  " + fmtTime(pos) + "/" + fmtTime(dur) +
				"  [" + meter + "]  vol " + Math.round(Player.getVolume() * 100) +
				"  shuf " + (Player.getShuffle() ? "on" : "off") +
				"  rep " + rep;
		}

		function toggleBar() {
			state.bar = !state.bar;
			bar.hidden = !state.bar;
			clearInterval(state.timer);
			if (state.bar) {
				renderBar();
				state.timer = setInterval(renderBar, 1000);
			}
			out.scrollTop = out.scrollHeight;
			print("bar " + (state.bar ? "on" : "off"), "dim");
		}

		// ---------- data ----------

		async function loadPlaylists() {
			const list = [{ name: "Liked Songs", uri: "liked", liked: true }];
			const res = await Spicetify.Platform.RootlistAPI.getContents();
			(function walk(items, prefix) {
				(items || []).forEach((i) => {
					if (i.type === "folder") walk(i.items, prefix + i.name + "/");
					else if (i.type === "playlist") list.push({ name: prefix + i.name, uri: i.uri });
				});
			})(res.items, "");
			state.playlists = list;
			return list;
		}

		async function loadTracks(pl) {
			if (pl.liked) {
				const res = await Spicetify.Platform.LibraryAPI.getTracks({ limit: 9999999 });
				return res.items;
			}
			const res = await Spicetify.Platform.PlaylistAPI.getContents(pl.uri, { limit: 9999999 });
			return res.items;
		}

		async function searchTracks(q, limit) {
			const url = "https://api.spotify.com/v1/search?type=track&limit=" + limit + "&q=" + encodeURIComponent(q);
			const res = await Spicetify.CosmosAsync.get(url);
			return (res && res.tracks && res.tracks.items) || [];
		}

		// ---------- lists ----------

		function trackLine(t, n, width) {
			const here = current() && current().uri === t.uri;
			const dur = durOf(t);
			return (
				String(n).padStart(width) + (here ? " > " : "   ") +
				t.name + " - " + artistsOf(t) + (dur ? "  [" + fmtTime(dur) + "]" : "")
			);
		}

		function showPage() {
			const v = state.view;
			if (!v) return;
			const width = String(v.items.length).length;
			const end = Math.min(v.items.length, v.shown + PAGE);
			for (let i = v.shown; i < end; i++) {
				const it = v.items[i];
				if (v.kind === "playlists") print(String(i + 1).padStart(width) + "   " + it.name);
				else print(trackLine(it, i + 1, width), current() && current().uri === it.uri ? "acc" : "");
			}
			v.shown = end;
			const more = v.items.length - end;
			const action = v.kind === "playlists" ? "open" : "play";
			print(
				(more ? more + " more: /more.  " : "") + "type a number to " + action + (state.stack.length ? ".  /back to go back" : ""),
				"dim"
			);
		}

		// Clears the screen and draws a list from the top, so lists never pile up.
		function render(v) {
			out.textContent = "";
			setTitle();
			print(v.title + " (" + v.items.length + ")", "acc");
			if (!v.items.length) print("empty", "dim");
			showPage();
		}

		function openView(kind, title, items, uri) {
			if (state.view) state.stack.push(state.view);
			if (state.stack.length > 5) state.stack.shift();
			state.view = { kind, title, items, uri, shown: 0 };
			render(state.view);
		}

		function back() {
			const v = state.stack.pop();
			if (!v) return print("nothing to go back to", "dim");
			v.shown = 0;
			state.view = v;
			render(v);
		}

		// A bare number picks an item from the list on screen.
		async function pick(n) {
			const v = state.view;
			if (!v) return print("no list on screen. try /playlist", "err");
			const it = v.items[n - 1];
			if (!it) return print("no item " + n + " (1-" + v.items.length + ")", "err");
			if (v.kind === "playlists") return openPlaylist(it);
			return playTrackInView(n);
		}

		async function openPlaylist(pl) {
			print("loading...", "dim");
			const items = await loadTracks(pl);
			openView("tracks", pl.name, items, pl.uri);
			store("last", { name: pl.name, uri: pl.uri, liked: !!pl.liked });
		}

		function describe(t) {
			return t.name + " - " + artistsOf(t);
		}

		async function playTrackInView(n) {
			const v = state.view;
			const t = v.items[n - 1];
			if (!t) return print("no item " + n, "err");
			if (v.kind === "tracks" && v.uri) {
				const context = v.uri === "liked" ? "spotify:collection:tracks" : v.uri;
				try {
					await Player.playUri(context, {}, { skipTo: { uri: t.uri } });
				} catch (e) {
					await Player.playUri(t.uri);
				}
			} else {
				await Player.playUri(t.uri);
			}
			print("playing: " + describe(t), "acc");
		}

		// ---------- commands ----------

		const commands = {
			help: {
				desc: "short list of commands, /help all shows every one",
				run(args) {
					print("start here:", "acc");
					print("  /playlist     browse your playlists, then type a number");
					print("  /search words find a song, then type a number");
					print("  /play words   play the first match");
					print("  /pause  /resume  /next  /previous");
					print("  /now          what is playing");
					print("  /help all     every command");
					if (args !== "all") return;
					print("more:", "acc");
					Object.keys(commands)
						.filter((k) => !commands[k].core)
						.forEach((k) => print("  /" + k.padEnd(10) + commands[k].desc));
				},
			},
			clear: { desc: "clear the screen", run: () => (out.textContent = "") },
			now: {
				core: true,
				desc: "show the current song",
				run() {
					const t = current();
					if (!t) return print("nothing playing", "dim");
					print((Player.isPlaying() ? "playing: " : "paused:  ") + describe(t), "acc");
					const album = t.album && t.album.name;
					print("  " + (album ? album + "  " : "") + fmtTime(Player.getProgress()) + "/" + fmtTime(Player.getDuration() || durOf(t)), "dim");
				},
			},
			play: {
				core: true,
				desc: "/play resumes, /play <number> plays that item, /play <words> plays a match",
				async run(args) {
					if (!args) return Player.play();
					const v = state.view;
					if (/^\d+$/.test(args) && v) {
						const n = Number(args);
						if (v.kind === "playlists") {
							const pl = v.items[n - 1];
							if (!pl) return print("no item " + n, "err");
							if (pl.liked) return openPlaylistAndPlay(pl);
							await Player.playUri(pl.uri);
							return print("playing playlist: " + pl.name, "acc");
						}
						return playTrackInView(n);
					}
					// In an open list, words match a song in that list first.
					if (v && v.kind !== "playlists") {
						const q = args.toLowerCase();
						const i = v.items.findIndex((t) => (t.name + " " + artistsOf(t)).toLowerCase().includes(q));
						if (i >= 0) return playTrackInView(i + 1);
					}
					const found = await searchTracks(args, 1);
					if (!found.length) return print("no results for: " + args, "err");
					await Player.playUri(found[0].uri);
					print("playing: " + describe(found[0]), "acc");
				},
			},
			pause: { core: true, desc: "pause", run: () => Player.pause() },
			resume: { core: true, desc: "resume", run: () => Player.play() },
			toggle: { desc: "pause or resume (alias /p)", run: () => Player.togglePlay() },
			next: { core: true, desc: "next song (alias /n)", run: () => Player.next() },
			previous: { core: true, desc: "previous song, or restart this one (alias /prev)", run: () => Player.back() },
			back: { desc: "go back to the previous list (alias /b)", run: back },
			playlist: {
				core: true,
				desc: "/playlist lists, /playlist <number or name> opens one",
				async run(args) {
					if (!args) {
						const list = await loadPlaylists();
						return openView("playlists", "playlists", list);
					}
					const list = state.playlists || (await loadPlaylists());
					let pl;
					if (/^\d+$/.test(args)) pl = list[Number(args) - 1];
					else {
						const q = args.toLowerCase();
						pl = list.find((p) => p.name.toLowerCase() === q) || list.find((p) => p.name.toLowerCase().includes(q));
					}
					if (!pl) return print("no playlist: " + args, "err");
					return openPlaylist(pl);
				},
			},
			search: {
				core: true,
				desc: "/search <words> lists songs, then type a number",
				async run(args) {
					if (!args) return print("usage: /search <words>", "err");
					const found = await searchTracks(args, 20);
					openView("search", "search: " + args, found);
				},
			},
			more: {
				desc: "next page of a list (alias /m)",
				run() {
					if (!state.view || state.view.shown >= state.view.items.length) return print("nothing more", "dim");
					showPage();
				},
			},
			queue: {
				desc: "show what plays next",
				run() {
					const next = (Player.data && Player.data.nextItems) || [];
					if (!next.length) return print("queue is empty", "dim");
					print("up next:", "acc");
					next.slice(0, 10).forEach((t, i) => print(String(i + 1).padStart(2) + "   " + describe(t)));
				},
			},
			vol: {
				desc: "/vol shows, /vol 50 sets, /vol +10 or -10 changes",
				run(args) {
					if (args) {
						const rel = /^[+-]/.test(args);
						const n = parseFloat(args);
						if (isNaN(n)) return print("usage: /vol 0-100", "err");
						const level = (rel ? Math.round(Player.getVolume() * 100) + n : n) / 100;
						Player.setVolume(Math.min(1, Math.max(0, level)));
					}
					print("volume: " + Math.round(Player.getVolume() * 100) + "%");
				},
			},
			seek: {
				desc: "/seek 1:30, /seek 90, /seek +10, /seek -10",
				run(args) {
					if (!args) return print("usage: /seek 1:30 or +10 or -10", "err");
					const rel = /^[+-]/.test(args);
					let sec;
					if (args.includes(":")) {
						const [m, s] = args.split(":");
						sec = Number(m) * 60 + Number(s);
					} else sec = parseFloat(args);
					if (isNaN(sec)) return print("usage: /seek 1:30 or +10 or -10", "err");
					const ms = rel ? Player.getProgress() + sec * 1000 : sec * 1000;
					Player.seek(Math.max(1, ms));
				},
			},
			shuffle: {
				desc: "/shuffle toggles, /shuffle on or /shuffle off sets it",
				run(args) {
					const want = args.toLowerCase();
					if (want === "on" || want === "off") Player.setShuffle(want === "on");
					else Player.toggleShuffle();
					print("shuffle: " + (Player.getShuffle() ? "on" : "off"));
				},
			},
			repeat: {
				desc: "cycle repeat: off, all, one",
				run() {
					Player.setRepeat((Player.getRepeat() + 1) % 3);
					print("repeat: " + ["off", "all", "one"][Player.getRepeat()]);
				},
			},
			like: {
				desc: "save the current song to Liked Songs",
				async run() {
					const id = trackId();
					if (!id) return print("nothing playing", "err");
					await Spicetify.CosmosAsync.put("https://api.spotify.com/v1/me/tracks?ids=" + id);
					print("liked: " + describe(current()), "acc");
				},
			},
			unlike: {
				desc: "remove the current song from Liked Songs",
				async run() {
					const id = trackId();
					if (!id) return print("nothing playing", "err");
					await Spicetify.CosmosAsync.del("https://api.spotify.com/v1/me/tracks?ids=" + id);
					print("unliked: " + describe(current()), "dim");
				},
			},
			last: {
				desc: "reopen the last playlist you opened",
				run() {
					const pl = store("last");
					if (!pl) return print("no playlist opened yet. try /playlist", "dim");
					return openPlaylist(pl);
				},
			},
			theme: {
				desc: "/theme lists colors, /theme amber changes them (green, amber, white, solarized, default)",
				run(args) {
					const name = args.toLowerCase();
					if (!name) return print("colors: " + Object.keys(PALETTES).join(", ") + ", default  (now: " + (store("theme") || "default") + ")");
					if (name !== "default" && !PALETTES[name]) return print("no color scheme: " + args, "err");
					applyPalette(name === "default" ? null : name);
					store("theme", name === "default" ? null : name);
					print("colors: " + name, "acc");
				},
			},
			bar: { desc: "show or hide the status bar", run: toggleBar },
			gui: { desc: "hide the terminal and show normal Spotify (Ctrl+` brings it back)", run: () => setGui(true) },
		};

		function trackId() {
			const t = current();
			const m = t && /^spotify:track:(\w+)$/.exec(t.uri);
			return m ? m[1] : null;
		}

		async function openPlaylistAndPlay(pl) {
			const items = await loadTracks(pl);
			openView("tracks", pl.name, items, pl.uri);
			if (items.length) await playTrackInView(1);
		}

		async function run(raw) {
			const text = raw.trim();
			if (!text) return;
			print("ttyfy> " + text, "echo");
			if (/^\d+$/.test(text)) {
				try {
					await pick(Number(text));
				} catch (e) {
					print("error: " + (e && e.message ? e.message : String(e)), "err");
					console.error("ttyfy", e);
				}
				return renderBar();
			}
			const m = /^\/?(\S+)\s*(.*)$/.exec(text);
			let name = m[1].toLowerCase();
			name = ALIASES[name] || name;
			const cmd = commands[name];
			if (!cmd) return print("command not found: " + m[1] + "  (try /help)", "err");
			try {
				await cmd.run(m[2].trim());
			} catch (e) {
				print("error: " + (e && e.message ? e.message : String(e)), "err");
				console.error("ttyfy", e);
			}
			renderBar();
		}

		// ---------- input ----------

		input.addEventListener("keydown", (e) => {
			e.stopPropagation();
			if (e.key === "Enter") {
				const v = input.value;
				if (v.trim()) {
					state.history.push(v);
					state.hpos = state.history.length;
				}
				input.value = "";
				run(v);
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				if (state.hpos > 0) input.value = state.history[--state.hpos];
			} else if (e.key === "ArrowDown") {
				e.preventDefault();
				if (state.hpos < state.history.length - 1) input.value = state.history[++state.hpos];
				else {
					state.hpos = state.history.length;
					input.value = "";
				}
			} else if (e.key === "Tab") {
				e.preventDefault();
				const v = input.value.replace(/^\//, "");
				if (!v || /\s/.test(v)) return;
				const hits = Object.keys(commands).filter((k) => k.startsWith(v.toLowerCase()));
				if (hits.length === 1) input.value = "/" + hits[0] + " ";
				else if (hits.length > 1) print(hits.map((h) => "/" + h).join("  "), "dim");
			} else if (e.ctrlKey && e.key.toLowerCase() === "l") {
				e.preventDefault();
				out.textContent = "";
			}
		});
		input.addEventListener("keyup", (e) => e.stopPropagation());

		root.addEventListener("mouseup", () => {
			if (!String(window.getSelection())) input.focus();
		});

		// Ctrl+` hides or shows the terminal from anywhere.
		document.addEventListener(
			"keydown",
			(e) => {
				if (e.ctrlKey && (e.key === "`" || e.code === "Backquote")) {
					e.preventDefault();
					toggleGui();
				}
			},
			true
		);

		Player.addEventListener("songchange", () => {
			const t = current();
			if (t) print("now playing: " + describe(t), "dim");
			renderBar();
		});
		Player.addEventListener("onplaypause", renderBar);

		// ---------- hello ----------

		setTitle();
		document.documentElement.classList.add("ttyfy-ready");

		function welcome() {
			const t = current();
			if (t) print((Player.isPlaying() ? "playing: " : "paused:  ") + describe(t), "dim");
			const last = store("last");
			if (last) print("last: " + last.name + "  (/last to reopen)", "dim");
		}

		// Open on your playlists, so typing a number is the first thing you can do.
		print("ttyfy " + VERSION, "acc");
		loadPlaylists()
			.then((list) => {
				openView("playlists", "playlists", list);
				welcome();
			})
			.catch(() => {
				welcome();
				print("/playlist to browse, /search words to find a song, /help for more", "dim");
			});
		input.focus();
	}
})();
