// ttyfy: a command line for Spotify.
// Spicetify loads this file next to user.css. It draws a full-screen terminal
// over Spotify's normal interface. Music keeps playing underneath.
// If this file fails to start, the theme falls back to the plain CSS look.
//
// Ctrl+` hides or shows the terminal. /gui does the same.

(function ttyfy() {
	"use strict";

	const VERSION = "0.3";
	const PAGE = 15; // rows per page when the window height is unknown
	const MAX_LINES = 600; // lines kept in the output
	const ALIASES = { "?": "help", add: "queue", h: "help", n: "next", b: "back", prev: "previous", q: "queue", pl: "playlist", playlists: "playlist", ls: "playlist", s: "search", find: "search", p: "toggle", m: "more", exit: "gui", np: "now" };

	// Same colors as color.ini. Keep the two in sync (see CLAUDE.md).
	const PALETTES = {
		green: { text: "33ff33", subtext: "22aa22", main: "000000", sidebar: "000000", player: "000000", card: "061006", button: "33ff33", "button-active": "99ff99", "button-disabled": "145214", "tab-active": "0b2a0b", notification: "0b2a0b", "notification-error": "ff4040", "selected-row": "66ff66", misc: "1c5c1c" },
		amber: { text: "ffb000", subtext: "b37a00", main: "000000", sidebar: "000000", player: "000000", card: "140e00", button: "ffb000", "button-active": "ffd36b", "button-disabled": "5c4000", "tab-active": "2a1d00", notification: "2a1d00", "notification-error": "ff4040", "selected-row": "ffcc55", misc: "664600" },
		white: { text: "e6e6e6", subtext: "9a9a9a", main: "000000", sidebar: "000000", player: "000000", card: "0f0f0f", button: "ffffff", "button-active": "cccccc", "button-disabled": "4d4d4d", "tab-active": "1f1f1f", notification: "1f1f1f", "notification-error": "ff5555", "selected-row": "ffffff", misc: "555555" },
		solarized: { text: "93a1a1", subtext: "839496", main: "002b36", sidebar: "002b36", player: "002b36", card: "073642", button: "2aa198", "button-active": "35c4b9", "button-disabled": "586e75", "tab-active": "073642", notification: "073642","notification-error": "f0605d", "selected-row": "eee8d5", misc: "586e75" },
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

	function own(obj, key) {
		return Object.prototype.hasOwnProperty.call(obj, key);
	}

	function hasPalette(name) {
		return Object.prototype.hasOwnProperty.call(PALETTES, name);
	}

	// Readable text for any kind of error: Error, {message}, {error:{message}}, {code, error}.
	function errText(e) {
		if (!e) return "unknown error";
		if (typeof e === "string") return e;
		const text =
			e.message ||
			(e.error && e.error.message) ||
			(typeof e.error === "string" ? e.error : "") ||
			(e.code ? String(e.code) : "");
		let msg = text;
		if (!msg) {
			try {
				msg = JSON.stringify(e);
			} catch (x) {
				msg = "";
			}
		}
		if (!msg || msg === "{}") msg = "unknown error";
		// Only calls that came back undefined mean "this Spotify version lacks it".
		const missing = /undefined|null|is not a function|is not defined|not iterable/.test(msg);
		return e instanceof TypeError && missing ? "not supported by this Spotify version (" + msg + ")" : msg;
	}

	function applyPalette(name) {
		const style = document.documentElement.style;
		const keys = Object.keys(PALETTES.green);
		keys.forEach((k) => {
			style.removeProperty("--spice-" + k);
			style.removeProperty("--spice-rgb-" + k);
		});
		if (!hasPalette(name)) return;
		const p = PALETTES[name];
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
			Spicetify.Platform &&
			Spicetify.CosmosAsync
		);
	}

	let theme = store("theme");
	if (theme && !hasPalette(theme)) theme = null;
	if (theme) applyPalette(theme);

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
			const half = document.getElementById("ttyfy");
			if (half) half.remove(); // never leave an empty terminal over Spotify
		}
	}, 200);

	function start() {
		if (document.getElementById("ttyfy")) return; // already running
		const Player = Spicetify.Player;
		const state = {
			view: null, // { kind: "playlists" | "tracks" | "search", title, uri, items, shown }
			playlists: null, // cached list of the user's playlists
			stack: [], // lists you came from, for /back
			rows: [], // song rows on screen, so the playing one can be marked
			nav: 0, // bumps whenever the screen changes list, so a slow load cannot replace a newer one
			ran: false, // true once the user ran a command
			ours: [], // song uris this terminal put in the queue
			draft: "", // what you were typing before browsing history
			history: [],
			hpos: 0,
			bar: false,
			timer: null,
			// /cava: bars that follow the song. Off until you ask for it.
			cava: Object.assign({ bars: "auto", rows: 4 }, store("cava") || {}, { on: false, data: null, note: "", load: 0, timer: null, vals: [] }),
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
			if (typeof t.artists === "string") return t.artists;
			return (t.metadata && t.metadata.artist_name) || "";
		}

		function nameOf(t) {
			return (t && (t.name || (t.metadata && t.metadata.title))) || "?";
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

		function isPlaying(t) {
			const c = current();
			return !!c && !!t && c.uri === t.uri;
		}

		function isSongView(v) {
			return !!v && (v.kind === "tracks" || v.kind === "search");
		}

		// Song n of the list on screen (also song rows in /recent), or null.
		function songAt(n) {
			const v = state.view;
			if (!v) return null;
			const it = v.items[n - 1];
			if (!it) return null;
			if (isSongView(v)) return it;
			return v.kind === "recent" && it.kind === "song" ? it : null;
		}

		// Remember songs and playlists for /recent (newest first, 7 of each kept).
		function remember(entry) {
			const list = (store("recent") || []).filter((r) => r.uri !== entry.uri);
			list.unshift(entry);
			const seen = { song: 0, playlist: 0 };
			store("recent", list.filter((r) => ++seen[r.kind === "playlist" ? "playlist" : "song"] <= 7));
		}

		// One song label: "Name - Artist", or just the name when there is no artist.
		function label(t) {
			const a = artistsOf(t);
			return nameOf(t) + (a ? " - " + a : "");
		}

		// ---------- page ----------

		const root = el("div", "ttyfy");
		const head = el("div", "ttyfy-head");
		const out = el("div", "ttyfy-out");
		const bar = el("div", "ttyfy-bar");
		const prompt = el("div", "ttyfy-prompt");
		const ps = el("span", "ttyfy-ps");
		const input = el("input", "ttyfy-in");
		const inwrap = el("div", "ttyfy-inwrap");
		const cursor = el("span", "ttyfy-cursor");
		const mirror = el("span", "ttyfy-mirror");
		const cavaEl = el("div", "ttyfy-cava");
		const ruler = el("span", "ttyfy-ruler");
		const barTitle = el("span", "ttyfy-bartitle");
		const barInfo = el("span", "ttyfy-barinfo");

		head.textContent = "ttyfy " + VERSION;
		bar.hidden = true;
		cavaEl.hidden = true;
		ps.textContent = "ttyfy> ";
		input.type = "text";
		input.spellcheck = false;
		input.autocomplete = "off";
		input.autocapitalize = "off";
		input.setAttribute("aria-label", "command line");
		if (/Mac/i.test(navigator.platform || "")) root.classList.add("ttyfy-mac");

		bar.append(barTitle, barInfo);
		inwrap.append(input, cursor, mirror);
		prompt.append(ps, inwrap);
		ruler.textContent = "0000000000";
		root.append(head, out, cavaEl, bar, prompt, ruler);
		document.body.appendChild(root);

		function print(text, cls) {
			const line = el("div", "", cls ? "ty-" + cls : "");
			line.textContent = text;
			const follow = out.scrollHeight - out.scrollTop - out.clientHeight < 40;
			out.appendChild(line);
			while (out.childNodes.length > MAX_LINES) out.removeChild(out.firstChild);
			if (follow) out.scrollTop = out.scrollHeight;
			return line;
		}

		function printAll(lines, cls) {
			lines.forEach((l) => print(l, cls));
		}

		// Rows per page: fit the window, leave room for the hint lines.
		function pageSize() {
			const h = out.clientHeight;
			const lh = parseFloat(getComputedStyle(out).lineHeight) || 21;
			if (!h) return PAGE;
			return Math.max(8, Math.min(40, Math.floor(h / lh) - 4));
		}

		// Our own blinking block cursor. The native caret comes back when the text scrolls.
		function updateCursor() {
			mirror.textContent = input.value.slice(0, input.selectionStart || 0);
			const x = mirror.offsetWidth - input.scrollLeft;
			const fits = x >= 0 && x < input.clientWidth - 2;
			root.classList.toggle("ttyfy-fakecaret", fits);
			cursor.style.left = x + "px";
		}
		["input", "keydown", "keyup", "click", "focus", "select", "mouseup"].forEach((ev) =>
			input.addEventListener(ev, () => requestAnimationFrame(updateCursor))
		);

		function setTitle() {
			const v = state.view;
			head.textContent = "ttyfy " + VERSION + (v ? "  /  " + v.title : "");
		}

		function setGui(showGui) {
			root.classList.toggle("ttyfy-hidden", showGui);
			if (!showGui) {
				out.scrollTop = out.scrollHeight;
				input.focus();
				updateCursor();
			}
		}

		function toggleGui() {
			setGui(!root.classList.contains("ttyfy-hidden"));
		}

		// ---------- bar ----------

		function renderBar() {
			if (!state.bar) return;
			try {
				const t = current();
				if (!t) {
					barTitle.textContent = "[--] nothing playing";
					barInfo.textContent = "";
					return;
				}
				const dur = Player.getDuration() || durOf(t);
				const pos = Player.getProgress();
				const width = 20;
				const filled = dur ? Math.min(width, Math.round((pos / dur) * width)) : 0;
				const meter = "#".repeat(filled) + "-".repeat(width - filled);
				const rep = ["off", "all", "one"][Player.getRepeat()] || "off";
				barTitle.textContent = (Player.isPlaying() ? "[>] " : "[||] ") + label(t);
				barInfo.textContent =
					"  " + fmtTime(pos) + "/" + fmtTime(dur) +
					"  [" + meter + "]  vol " + Math.round(Player.getVolume() * 100) +
					"  shuf " + (Player.getShuffle() ? "on" : "off") +
					"  rep " + rep;
			} catch (e) {
				barTitle.textContent = "[--] status bar error: " + errText(e);
				barInfo.textContent = "";
			}
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

		// ---------- cava ----------
		// Spotify gives no live sound to extensions, so the bars come from the song's
		// stored analysis (loudness, beats and notes per slice), played back in time
		// with the song. They follow the music but are not a live spectrum.

		const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
		const lerp = (a, b, k) => a + (b - a) * k;

		// Last item whose start is at or before t (list sorted by start), or -1.
		function lastBefore(list, t) {
			let lo = 0;
			let hi = list.length - 1;
			if (!list.length || list[0].start > t) return -1;
			while (lo < hi) {
				const mid = (lo + hi + 1) >> 1;
				if (list[mid].start <= t) lo = mid;
				else hi = mid - 1;
			}
			return lo;
		}

		function loadCava() {
			const c = state.cava;
			const id = ++c.load;
			const t = current();
			c.data = null;
			c.note = "";
			if (!t || !/^spotify:track:/.test(t.uri || "")) {
				c.note = "no audio analysis for this item";
				return;
			}
			if (!Spicetify.getAudioData) {
				c.note = "this Spicetify has no getAudioData";
				print("cava: " + c.note, "err");
				return;
			}
			Promise.resolve()
				.then(() => Spicetify.getAudioData(t.uri))
				.then((d) => {
					if (id !== c.load) return; // song changed while this loaded
					const segs = d && Array.isArray(d.segments) ? d.segments.filter((x) => Array.isArray(x.pitches)) : [];
					if (!segs.length) throw new Error("this song has no analysis");
					c.data = { segs, beats: d && Array.isArray(d.beats) ? d.beats : [] };
				})
				.catch((e) => {
					if (id !== c.load) return;
					c.data = null;
					c.note = "no audio analysis for this song (" + errText(e) + ")";
					print("cava: " + c.note, "dim");
				});
		}

		// Bar heights (0 to 1) for song time tSec: loudness and beat pulse, shaped by the notes playing.
		function cavaLevels(n, tSec) {
			const d = state.cava.data;
			const out = new Array(n).fill(0);
			if (!d) return out;
			const i = lastBefore(d.segs, tSec);
			if (i < 0) return out;
			const sg = d.segs[i];
			const next = d.segs[i + 1];
			const into = tSec - sg.start;
			const peak = sg.loudness_max_time || 0;
			let db;
			if (into < peak) db = lerp(sg.loudness_start, sg.loudness_max, peak ? into / peak : 1);
			else {
				const endDb = next ? next.loudness_start : sg.loudness_end != null ? sg.loudness_end : sg.loudness_max;
				db = lerp(sg.loudness_max, endDb, clamp((into - peak) / Math.max(0.001, sg.duration - peak), 0, 1));
			}
			let energy = Math.pow(clamp((db + 45) / 45, 0, 1), 1.3);
			const b = lastBefore(d.beats, tSec);
			if (b >= 0) energy *= 1 + 0.35 * Math.exp(-3 * ((tSec - d.beats[b].start) / (d.beats[b].duration || 0.5)));
			energy = clamp(energy, 0, 1);
			const p = sg.pitches;
			for (let k = 0; k < n; k++) {
				const x = n > 1 ? (k / (n - 1)) * (p.length - 1) : 0;
				const lo = Math.floor(x);
				const hi = Math.min(p.length - 1, lo + 1);
				const pitch = lerp(p[lo] || 0, p[hi] || 0, x - lo);
				out[k] = clamp(energy * (0.25 + 0.75 * Math.pow(pitch, 0.8)), 0, 1);
			}
			return out;
		}

		// How many bars fit: three characters each (a bar and a gap), unless set by hand.
		function cavaCount() {
			const c = state.cava;
			if (c.bars !== "auto") return c.bars;
			const cw = ruler.offsetWidth / 10 || 8;
			const cols = Math.floor((cavaEl.clientWidth - 24) / cw);
			return clamp(Math.floor((cols + 1) / 3), 8, 64);
		}

		// The bars are solid blocks (not text), so there are no seams between them.
		function cavaTick() {
			const c = state.cava;
			if (root.classList.contains("ttyfy-hidden")) return; // nothing to draw while hidden
			try {
				const n = cavaCount();
				const target = Player.isPlaying() ? cavaLevels(n, Player.getProgress() / 1000) : new Array(n).fill(0);
				if (c.vals.length !== n || cavaEl.children.length !== n) {
					c.vals = new Array(n).fill(0);
					cavaEl.textContent = "";
					for (let k = 0; k < n; k++) cavaEl.appendChild(el("span", "", "ty-cavabar"));
				}
				cavaEl.style.height = c.rows * 1.3 + "em";
				// Rise fast, fall slowly, like cava.
				c.vals = c.vals.map((v, k) => (target[k] > v ? v + (target[k] - v) * 0.6 : v * 0.88));
				for (let k = 0; k < n; k++) cavaEl.children[k].style.height = clamp(c.vals[k], 0, 1) * 100 + "%";
			} catch (e) {
				cavaEl.textContent = "cava error: " + errText(e);
				c.vals = [];
			}
		}

		function setCava(on) {
			const c = state.cava;
			c.on = on;
			cavaEl.hidden = !on;
			clearInterval(c.timer);
			if (on) {
				loadCava();
				cavaTick();
				c.timer = setInterval(cavaTick, 50);
			}
			out.scrollTop = out.scrollHeight;
		}

		// ---------- data ----------

		async function loadPlaylists() {
			const list = [{ name: "Liked Songs", uri: "liked", liked: true }];
			const res = await Spicetify.Platform.RootlistAPI.getContents();
			if (!res || !Array.isArray(res.items)) throw new Error("could not read your playlists (unexpected answer)");
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
				if (!res || !Array.isArray(res.items)) throw new Error("could not read your liked songs (unexpected answer)");
				return res.items;
			}
			const res = await Spicetify.Platform.PlaylistAPI.getContents(pl.uri, { limit: 9999999 });
			if (!res || !Array.isArray(res.items)) throw new Error("could not read this playlist (unexpected answer)");
			return res.items;
		}

		async function searchTracks(q, limit) {
			const url = "https://api.spotify.com/v1/search?type=track&limit=" + limit + "&q=" + encodeURIComponent(q);
			const res = await Spicetify.CosmosAsync.get(url);
			if (res && (res.code || res.error)) throw new Error("search failed: " + errText(res));
			if (!res || !res.tracks || !Array.isArray(res.tracks.items)) throw new Error("search failed: unexpected answer");
			return res.tracks.items;
		}

		// Album and artist pages use Spotify's own GraphQL, like Spicetify's shuffle+ does.
		async function albumTracks(uri) {
			try {
				const { queryAlbumTracks } = Spicetify.GraphQL.Definitions;
				const items = [];
				let albumName;
				for (let offset = 0; offset < 500; offset += 100) {
					const { data, errors } = await Spicetify.GraphQL.Request(queryAlbumTracks, { uri, offset, limit: 100 });
					if (errors) throw new Error(errors[0].message);
					albumName = data.albumUnion.name || albumName;
					const page = (data.albumUnion.tracksV2 || data.albumUnion.tracks).items;
					page.forEach(({ track }) =>
						items.push({
							name: track.name,
							uri: track.uri,
							uid: track.uid,
							artists: ((track.artists && track.artists.items) || []).map((a) => ({ uri: a.uri, name: a.profile && a.profile.name })),
							duration: { milliseconds: track.duration && track.duration.totalMilliseconds },
							album: { uri },
						})
					);
					if (page.length < 100) break;
				}
				items.forEach((t) => (t.album.name = albumName));
				state.albumSource = "graphql";
				return items;
			} catch (e) {
				// Fallback: the web API through Spicetify.
				const id = uri.split(":").pop();
				let url = "https://api.spotify.com/v1/albums/" + id + "/tracks?limit=50";
				const items = [];
				for (let page = 0; url && page < 10; page++) {
					const res = await Spicetify.CosmosAsync.get(url);
					if (!res || res.code || res.error || !Array.isArray(res.items)) throw new Error("could not load album: " + errText(res));
					res.items.forEach((t) => items.push(Object.assign({}, t, { album: { uri } })));
					url = res.next;
				}
				state.albumSource = "web";
				return items;
			}
		}

		async function artistTopTracks(uri) {
			if (!Spicetify.GraphQL || !Spicetify.GraphQL.Request) throw new Error("artist pages are not supported by this Spotify version");
			const { queryArtistOverview } = Spicetify.GraphQL.Definitions;
			const { data, errors } = await Spicetify.GraphQL.Request(queryArtistOverview, {
				uri,
				locale: Spicetify.Locale.getLocale(),
				includePrerelease: false,
			});
			if (errors) throw new Error(errors[0].message);
			const u = data.artistUnion;
			const items = u.discography.topTracks.items.map(({ track }) => ({
				name: track.name,
				uri: track.uri,
				artists: ((track.artists && track.artists.items) || []).map((a) => ({ uri: a.uri, name: a.profile && a.profile.name })),
				duration: { milliseconds: track.duration && track.duration.totalMilliseconds },
				album: track.albumOfTrack ? { uri: track.albumOfTrack.uri, name: track.albumOfTrack.name } : undefined,
			}));
			return { name: u.profile && u.profile.name, items };
		}

		// ---------- lists ----------

		function trackLine(t, n, width) {
			const here = isPlaying(t);
			const dur = durOf(t);
			return (
				String(n).padStart(width) + (here ? " > " : "   ") +
				label(t) + (dur ? "  [" + fmtTime(dur) + "]" : "")
			);
		}

		function showPage() {
			const v = state.view;
			if (!v || !v.items.length) return;
			const width = String(v.items.length).length;
			const end = Math.min(v.items.length, v.shown + pageSize());
			for (let i = v.shown; i < end; i++) {
				const it = v.items[i];
				const n = String(i + 1).padStart(width);
				if (v.kind === "playlists") print(n + "   " + it.name);
				else if (v.kind === "recent") print(n + "   " + (it.kind === "playlist" ? "[list] " + it.name : describe(it)));
				else {
					const line = print(trackLine(it, i + 1, width), isPlaying(it) ? "acc" : "");
					state.rows.push({ line, t: it, n: i + 1, width });
				}
			}
			v.shown = end;
			const more = v.items.length - end;
			const action = v.kind === "playlists" ? "open" : v.kind === "recent" ? "play or open" : "play";
			print(
				(more ? more + " more: /more.  " : "") + "type a number to " + action + (state.stack.length ? ".  /back to go back" : ""),
				"dim"
			);
		}

		// Moves the > marker to the song that is playing now.
		function refreshMarks() {
			state.rows = state.rows.filter((r) => r.line.isConnected);
			state.rows.forEach((r) => {
				r.line.textContent = trackLine(r.t, r.n, r.width);
				r.line.className = isPlaying(r.t) ? "ty-acc" : "";
			});
		}

		// Clears the screen and draws a list from the top, so lists never pile up.
		function render(v) {
			out.textContent = "";
			state.rows = [];
			setTitle();
			print(v.title + " (" + v.items.length + ")", "acc");
			if (!v.items.length) print("empty", "dim");
			showPage();
		}

		function openView(kind, title, items, uri) {
			state.nav++;
			const same = state.view && state.view.kind === kind && state.view.title === title;
			if (state.view && !same) state.stack.push(state.view);
			if (state.stack.length > 5) state.stack.shift();
			state.view = { kind, title, items, uri, shown: 0 };
			render(state.view);
		}

		function back() {
			const v = state.stack.pop();
			if (!v) return print("nothing to go back to", "dim");
			state.nav++;
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
			if (v.kind === "recent") return playRecent(it);
			return playTrackInView(n);
		}

		async function playRecent(it) {
			if (it.kind === "playlist") return openPlaylist(it);
			await Player.playUri(it.uri);
			print("playing: " + describe(it), "acc");
		}

		function textOf(v, it) {
			if (v.kind === "playlists") return it.name;
			if (v.kind === "recent" && it.kind === "playlist") return it.name;
			return nameOf(it) + " " + artistsOf(it);
		}

		// Items of the list on screen where every word matches.
		function matching(v, words) {
			const ws = words.toLowerCase().split(/\s+/).filter((w) => w && !/^[-\u2013\u2014]+$/.test(w));
			return v.items.filter((it) => {
				const text = textOf(v, it).toLowerCase();
				return ws.every((w) => text.includes(w));
			});
		}

		async function openPlaylist(pl) {
			print("loading...", "dim");
			const nav = state.nav;
			const items = await loadTracks(pl);
			if (nav !== state.nav) return; // you opened something else while this loaded
			openView("tracks", pl.name, items, pl.uri);
			store("last", { name: pl.name, uri: pl.uri, liked: !!pl.liked });
			remember({ kind: "playlist", name: pl.name, uri: pl.uri, liked: !!pl.liked });
		}

		function describe(t) {
			return label(t);
		}

		async function playTrackInView(n) {
			const v = state.view;
			const t = v.items[n - 1];
			if (!t) return print("no item " + n, "err");
			if (v.kind === "tracks" && v.uri === "liked") {
				// No sure play context for Liked Songs: play the song, queue the next 50.
				await Player.playUri(t.uri);
				print("playing: " + describe(t), "acc");
				try {
					await dropOurQueue();
					const rest = v.items.slice(n, n + 50).filter((x) => x.uri);
					if (rest.length) {
						await Spicetify.addToQueue(rest.map((x) => ({ uri: x.uri })));
						state.ours = rest.map((x) => x.uri);
					}
				} catch (e) {
					print("playing, but could not queue the next songs: " + errText(e), "err");
				}
				return;
			} else if (v.kind === "tracks" && v.uri) {
				const skipTo = t.uid ? { uri: t.uri, uid: t.uid } : { uri: t.uri };
				await Player.playUri(v.uri, {}, { skipTo });
			} else {
				await Player.playUri(t.uri);
			}
			print("playing: " + describe(t), "acc");
		}

		// Take back songs this terminal queued earlier, so queues do not pile up.
		async function dropOurQueue() {
			const api = Spicetify.Platform.PlayerAPI;
			if (!state.ours.length || !api || !api.getQueue || !api.removeFromQueue) return;
			const q = await api.getQueue();
			const mine = (q.queued || []).filter((x) => state.ours.includes(x.uri));
			if (mine.length) await api.removeFromQueue(mine.map((x) => ({ uri: x.uri, uid: x.uid })));
			state.ours = [];
		}

		// Item n of the list on screen, or the song that is playing when n is empty.
		function songFor(args) {
			if (/^\d+$/.test(args)) {
				const t = songAt(Number(args));
				if (!t) throw new Error("no song " + args + " on screen");
				return t;
			}
			const t = current();
			if (!t) throw new Error("nothing playing");
			return t;
		}

		// ---------- commands ----------

		const commands = {
			help: {
				desc: "short list of commands, /help all shows every one",
				run(args) {
					if (args && args !== "all") {
						const name = args.replace(/^\//, "").toLowerCase();
						const real = own(ALIASES, name) ? ALIASES[name] : name;
						if (!own(commands, real)) return print("no command: " + args, "err");
						print("/" + real + "  " + commands[real].desc, "acc");
						const al = Object.keys(ALIASES).filter((k) => ALIASES[k] === real);
						if (al.length) print("  aliases: " + al.map((a) => "/" + a).join(" "), "dim");
						return;
					}
					print("start here:", "acc");
					print("  /playlist     browse your playlists, then type a number");
					print("  /search words find a song, then type a number");
					print("  /go words     jump to a match in the list on screen");
					print("  /recent       what you played lately");
					print("  /play words   play the first match");
					print("  /pause  /resume  /next  /previous");
					print("  /now          what is playing");
					print("  /help all     every command, /help <command> for one");
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
				desc: "show the current song with progress",
				run() {
					const t = current();
					if (!t) return print("nothing playing", "dim");
					const dur = Player.getDuration() || durOf(t);
					const pos = Player.getProgress();
					const filled = dur ? Math.min(20, Math.round((pos / dur) * 20)) : 0;
					print((Player.isPlaying() ? "playing: " : "paused:  ") + describe(t), "acc");
					if (t.album && t.album.name) print("  album:   " + t.album.name, "dim");
					print("  " + fmtTime(pos) + "/" + fmtTime(dur) + "  [" + "#".repeat(filled) + "-".repeat(20 - filled) + "]", "dim");
					print(
						"  vol " + Math.round(Player.getVolume() * 100) +
							"  shuffle " + (Player.getShuffle() ? "on" : "off") +
							"  repeat " + (["off", "all", "one"][Player.getRepeat()] || "off"),
						"dim"
					);
				},
			},
			play: {
				core: true,
				desc: "/play resumes, /play <number> plays that item, /play <words> plays a match",
				async run(args) {
					if (!args) return Player.play();
					const v = state.view;
					if (/^\d+$/.test(args) && !v) return print("no list on screen. try /playlist", "err");
					if (/^\d+$/.test(args) && v) {
						const n = Number(args);
						if (v.kind === "playlists") {
							const pl = v.items[n - 1];
							if (!pl) return print("no item " + n, "err");
							if (pl.liked) return openPlaylistAndPlay(pl);
							await Player.playUri(pl.uri);
							remember({ kind: "playlist", name: pl.name, uri: pl.uri, liked: false });
							return print("playing playlist: " + pl.name, "acc");
						}
						if (v.kind === "recent") return pick(n);
						return playTrackInView(n);
					}
					// In an open list, words match a song in that list first.
					if (isSongView(v)) {
						const hit = matching(v, args)[0];
						if (hit) return playTrackInView(v.items.indexOf(hit) + 1);
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
						const nav = state.nav;
						const list = await loadPlaylists();
						if (nav !== state.nav) return;
						return openView("playlists", "playlists", list);
					}
					const list = state.playlists || (await loadPlaylists());
					const q = args.toLowerCase();
					const last = (p) => p.name.split("/").pop().toLowerCase();
					const find = (l) =>
						l.find((p) => p.name.toLowerCase() === q) ||
						l.find((p) => last(p) === q) ||
						l.find((p) => p.name.toLowerCase().includes(q));
					let pl;
					// A number picks from the list on screen. A number too big to be a row is a name.
					const onScreen = state.view && state.view.kind === "playlists" ? state.view.items : list;
					if (/^\d+$/.test(args) && Number(args) >= 1 && Number(args) <= onScreen.length) pl = onScreen[Number(args) - 1];
					else {
						pl = find(list);
						if (!pl) pl = find(await loadPlaylists()); // may be new since startup
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
					const nav = state.nav;
					const found = await searchTracks(args, 20);
					if (nav !== state.nav) return;
					if (!found.length) return print("no results for: " + args, "err");
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
				desc: "/queue shows what plays next, /queue <number> adds that song from the list",
				async run(args) {
					if (args && !/^\d+$/.test(args)) return print("usage: /queue or /queue <number>", "err");
					if (/^\d+$/.test(args)) {
						const t = songAt(Number(args));
						if (!t) return print("no song " + args + " on screen", "err");
						await Spicetify.addToQueue([{ uri: t.uri }]);
						return print("queued: " + describe(t), "acc");
					}
					let next = [];
					try {
						const q = await Spicetify.Platform.PlayerAPI.getQueue();
						next = [].concat(q.queued || [], q.nextUp || []);
					} catch (e) {
						next = (Player.data && Player.data.nextItems) || [];
					}
					if (!next.length) return print("queue is empty", "dim");
					print("up next:", "acc");
					next.slice(0, 10).forEach((t) => print("  - " + describe(t)));
				},
			},
			album: {
				desc: "/album shows the album of the playing song, /album <number> uses a song on screen",
				async run(args) {
					if (args && !/^\d+$/.test(args)) return print("usage: /album or /album <number>", "err");
					const t = songFor(args);
					const uri = t.album && t.album.uri;
					if (!uri) return print("no album for this song", "err");
					print("loading...", "dim");
					const nav = state.nav;
					const items = await albumTracks(uri);
					if (nav !== state.nav) return;
					if (!items.length) return print("that album has no songs", "err");
					openView("tracks", "album: " + ((t.album && t.album.name) || "album"), items, uri);
				},
			},
			artist: {
				desc: "/artist shows top songs of the playing artist, /artist <number> uses a song on screen",
				async run(args) {
					if (args && !/^\d+$/.test(args)) return print("usage: /artist or /artist <number>", "err");
					const t = songFor(args);
					const a = Array.isArray(t.artists) && t.artists[0];
					if (!a || !a.uri) return print("no artist for this song", "err");
					print("loading...", "dim");
					const nav = state.nav;
					const r = await artistTopTracks(a.uri);
					if (nav !== state.nav) return;
					if (!r.items.length) return print("no top songs for this artist", "err");
					openView("tracks", "artist: " + (r.name || a.name), r.items, null);
				},
			},
			vol: {
				desc: "/vol shows, /vol 50 sets, /vol +10 or -10 changes",
				async run(args) {
					if (args) {
						if (!/^[+-]?\d{1,3}(\.\d+)?$/.test(args)) return print("usage: /vol 0-100, /vol +10, /vol -10", "err");
						const rel = /^[+-]/.test(args);
						const n = parseFloat(args);
						const level = (rel ? Math.round(Player.getVolume() * 100) + n : n) / 100;
						const clamped = Math.min(1, Math.max(0, level));
						await Player.setVolume(clamped);
						return print("volume: " + Math.round(clamped * 100) + "%");
					}
					print("volume: " + Math.round(Player.getVolume() * 100) + "%");
				},
			},
			seek: {
				desc: "/seek 1:30, /seek 90, /seek +10, /seek -10",
				async run(args) {
					const usage = "usage: /seek 1:30, /seek 1:02:03, /seek 90, /seek +10, /seek -10";
					if (!args) return print(usage, "err");
					const rel = /^[+-]/.test(args);
					const neg = args[0] === "-";
					const body = args.replace(/^[+-]/, "");
					if (!/^\d+(\.\d+)?(:\d+(\.\d+)?){0,2}$/.test(body)) return print(usage, "err");
					let sec = body.split(":").reduce((total, part) => total * 60 + parseFloat(part), 0);
					if (neg) sec = -sec;
					const ms = rel ? Player.getProgress() + sec * 1000 : sec * 1000;
					// Spicetify reads values up to 1 as a fraction of the song, so never send 0 < ms < 2.
					await Player.seek(ms <= 0 ? 0 : Math.max(2, ms));
				},
			},
			shuffle: {
				desc: "/shuffle toggles, /shuffle on or /shuffle off sets it",
				async run(args) {
					const want = args.toLowerCase();
					if (want && want !== "on" && want !== "off") return print("usage: /shuffle, /shuffle on, /shuffle off", "err");
					const on = want ? want === "on" : !Player.getShuffle();
					await Player.setShuffle(on);
					print("shuffle: " + (on ? "on" : "off"));
				},
			},
			repeat: {
				desc: "/repeat cycles off, all, one. /repeat off, /repeat all, /repeat one sets it",
				async run(args) {
					const want = args.toLowerCase();
					const names = ["off", "all", "one"];
					if (want && !names.includes(want)) return print("usage: /repeat, /repeat off, /repeat all, /repeat one", "err");
					const mode = want ? names.indexOf(want) : (Player.getRepeat() + 1) % 3;
					await Player.setRepeat(mode);
					print("repeat: " + ["off", "all", "one"][mode]);
				},
			},
			like: {
				desc: "save the current song to Liked Songs",
				async run() {
					const t = current();
					if (!t) return print("nothing playing", "err");
					await Spicetify.Platform.LibraryAPI.add({ uris: [t.uri] });
					print("liked: " + describe(t), "acc");
				},
			},
			unlike: {
				desc: "remove the current song from Liked Songs",
				async run() {
					const t = current();
					if (!t) return print("nothing playing", "err");
					await Spicetify.Platform.LibraryAPI.remove({ uris: [t.uri] });
					print("unliked: " + describe(t), "dim");
				},
			},
			recent: {
				desc: "songs and playlists you played lately, then type a number",
				run() {
					const list = store("recent") || [];
					if (!list.length) return print("nothing played yet", "dim");
					openView("recent", "recent", list);
				},
			},
			random: {
				desc: "play a random playlist",
				async run() {
					const list = (state.playlists || (await loadPlaylists())).filter((p) => !p.liked);
					if (!list.length) return print("no playlists", "err");
					const pl = list[Math.floor(Math.random() * list.length)];
					await Player.playUri(pl.uri);
					remember({ kind: "playlist", name: pl.name, uri: pl.uri, liked: false });
					print("playing playlist: " + pl.name, "acc");
				},
			},
			go: {
				desc: "/go <words> picks the best match in the list on screen",
				run(args) {
					const v = state.view;
					if (!v) return print("no list on screen. try /playlist", "err");
					if (!args) return print("usage: /go <words>", "err");
					const hit = matching(v, args)[0];
					if (!hit) return print("no match for: " + args, "err");
					return pick(v.items.indexOf(hit) + 1);
				},
			},
			filter: {
				desc: "/filter <words> keeps only the matching rows of the list on screen",
				run(args) {
					const v = state.view;
					if (!v) return print("no list on screen. try /playlist", "err");
					if (!args) return print("usage: /filter <words>", "err");
					const items = matching(v, args);
					if (!items.length) return print("no match for: " + args, "err");
					openView(v.kind, "filter: " + args + " in " + v.title, items, v.uri);
				},
			},
			about: {
				desc: "version and keys",
				run() {
					print("ttyfy " + VERSION, "acc");
					print("  Ctrl+` shows or hides this terminal, /gui does the same");
					print("  Tab completes, Up and Down bring back commands, PageUp and PageDown scroll"
					);
					print("  chain commands with ; before a /command, for example /vol 30; /next");
					print("  unofficial, not made by Spotify", "dim");
				},
			},
			debug: {
				desc: "/debug lists which Spicetify features exist, /debug live also tries them",
				async run(args) {
					const S = Spicetify;
					const P = S.Platform || {};
					const L = P.LibraryAPI;
					const has = (label, ok) => print((ok ? "ok      " : "MISSING ") + label, ok ? "" : "err");
					print("features:", "acc");
					has("Player.playUri", !!Player.playUri);
					has("Player.setShuffle, setRepeat, seek", !!(Player.setShuffle && Player.setRepeat && Player.seek));
					has("Platform.RootlistAPI (playlists)", !!(P.RootlistAPI && P.RootlistAPI.getContents));
					has("Platform.PlaylistAPI (playlist songs)", !!(P.PlaylistAPI && P.PlaylistAPI.getContents));
					has("Platform.LibraryAPI getTracks, add, remove", !!(L && L.getTracks && L.add && L.remove));
					has("Platform.PlayerAPI.getQueue", !!(P.PlayerAPI && P.PlayerAPI.getQueue));
					has("addToQueue", !!S.addToQueue);
					has("GraphQL album query", !!(S.GraphQL && S.GraphQL.Request && S.GraphQL.Definitions && S.GraphQL.Definitions.queryAlbumTracks));
					has("GraphQL artist query", !!(S.GraphQL && S.GraphQL.Request && S.GraphQL.Definitions && S.GraphQL.Definitions.queryArtistOverview));
					has("CosmosAsync.get (search)", !!(S.CosmosAsync && S.CosmosAsync.get));
					has("getAudioData (for /cava)", !!S.getAudioData);
					has("Player.data and song-change events", !!(Player.addEventListener && Player.data !== undefined));
					has("saved settings (localStorage)", store("debug-probe", 1) === 1);
					store("debug-probe", null);
					if (args !== "live") return print("/debug live tries them for real (reads only, changes nothing)", "dim");
					print("live checks:", "acc");
					const check = async (label, fn) => {
						try {
							const r = await fn();
							print("ok      " + label + (r ? "  " + r : ""));
						} catch (e) {
							print("FAIL    " + label + ": " + errText(e), "err");
						}
					};
					const cur = current();
					await check("playlists", async () => (await loadPlaylists()).length + " found");
					await check("playlist songs", async () => {
						const pl = (state.playlists || []).find((p) => !p.liked);
						if (!pl) return "skipped: no playlist";
						const res = await P.PlaylistAPI.getContents(pl.uri, { limit: 3 });
						if (!Array.isArray(res.items)) throw new Error("no items in the answer");
						if (res.items.length && !res.items.every((x) => x.uri && x.name)) throw new Error("rows have no uri or name");
						return res.items.length + " rows";
					});
					await check("liked songs", async () => {
						const res = await L.getTracks({ limit: 3 });
						if (!Array.isArray(res.items)) throw new Error("no items in the answer");
						if (res.items.length && !res.items.every((x) => x.uri && x.name)) throw new Error("rows have no uri or name");
						return res.items.length + " rows";
					});
					await check("search", async () => {
						const found = await searchTracks("a", 1);
						if (found.length && !found[0].uri) throw new Error("result has no uri");
						return found.length + " result";
					});
					await check("playing song details", async () => {
						if (!cur) return "skipped: nothing playing";
						const missing = ["uri", "name"].filter((k) => !cur[k]);
						if (!Array.isArray(cur.artists)) missing.push("artists");
						if (!(cur.album && cur.album.uri)) missing.push("album.uri");
						if (missing.length) throw new Error("missing " + missing.join(", ") + " (marks, /album, /artist will not work)");
						return "name, uri, artists, album ok";
					});
					await check("queue", async () => {
						const q = await P.PlayerAPI.getQueue();
						return (q.queued || []).length + (q.nextUp || []).length + " items";
					});
					await check("audio analysis (for /cava)", async () => {
						if (!cur || !/^spotify:track:/.test(cur.uri || "")) return "skipped: nothing playing";
						const d = await S.getAudioData(cur.uri);
						const segs = d && d.segments;
						if (!Array.isArray(segs) || !segs.length) throw new Error("no segments in the answer");
						if (!Array.isArray(segs[0].pitches) || segs[0].loudness_max == null) throw new Error("segments lack pitches or loudness");
						return segs.length + " slices, " + ((d.beats || []).length) + " beats";
					});
					await check("album page", async () => {
						const u = cur && cur.album && cur.album.uri;
						if (!u) return "skipped: nothing playing";
						const items = await albumTracks(u);
						return items.length + " songs via " + state.albumSource;
					});
					await check("artist page", async () => {
						const a = cur && Array.isArray(cur.artists) && cur.artists[0];
						if (!a || !a.uri) return "skipped: nothing playing";
						return (await artistTopTracks(a.uri)).items.length + " songs";
					});
				},
			},
			cava: {
				desc: "/cava shows bars that follow the song, /cava off hides them, /cava bars 24, /cava bars auto, /cava rows 4",
				run(args) {
					const c = state.cava;
					const [sub, val] = args.toLowerCase().split(/\s+/);
					const usage = "usage: /cava, /cava on, /cava off, /cava bars <8-64 or auto>, /cava rows <1-8>";
					if (sub === "bars" || sub === "rows") {
						if (sub === "bars" && val === "auto") c.bars = "auto";
						else if (sub === "bars" && /^\d+$/.test(val || "") && +val >= 8 && +val <= 64) c.bars = +val;
						else if (sub === "rows" && /^\d+$/.test(val || "") && +val >= 1 && +val <= 8) c.rows = +val;
						else return print(usage, "err");
						store("cava", { bars: c.bars, rows: c.rows });
						return print("cava " + sub + ": " + (sub === "bars" ? c.bars : c.rows), "dim");
					}
					if (sub && sub !== "on" && sub !== "off") return print(usage, "err");
					const on = sub ? sub === "on" : !c.on;
					setCava(on);
					print("cava " + (on ? "on (follows the song's loudness and beat, not live sound)" : "off"), "dim");
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
					if (!name) return print("colors: " + Object.keys(PALETTES).join(", ") + ", default  (now: " + (theme || "default") + ")");
					if (name !== "default" && !hasPalette(name)) return print("no color scheme: " + args, "err");
					theme = name === "default" ? null : name;
					applyPalette(theme);
					store("theme", theme);
					print("colors: " + name, "acc");
				},
			},
			bar: { desc: "show or hide the status bar", run: toggleBar },
			gui: { desc: "hide the terminal and show normal Spotify (Ctrl+` brings it back)", run: () => setGui(true) },
		};

		async function openPlaylistAndPlay(pl) {
			const nav = state.nav;
			const items = await loadTracks(pl);
			if (nav !== state.nav) return;
			openView("tracks", pl.name, items, pl.uri);
			store("last", { name: pl.name, uri: pl.uri, liked: !!pl.liked });
			remember({ kind: "playlist", name: pl.name, uri: pl.uri, liked: !!pl.liked });
			if (items.length) await playTrackInView(1);
		}

		async function run(raw) {
			const text = raw.replace(/[\u2028\u2029\r\n]+/g, " ").trim();
			if (!text) return;
			state.ran = true;
			print("ttyfy> " + text, "echo");
			out.scrollTop = out.scrollHeight;
			if (/^\d+$/.test(text)) {
				try {
					await pick(Number(text));
				} catch (e) {
					print("error: " + errText(e), "err");
					console.error("ttyfy", e);
				}
				return renderBar();
			}
			const m = /^\/?(\S+)\s*([\s\S]*)$/.exec(text);
			if (!m) return print("command not found: " + text, "err");
			let name = m[1].toLowerCase();
			if (own(ALIASES, name)) name = ALIASES[name];
			const cmd = own(commands, name) ? commands[name] : null;
			if (!cmd) return print("command not found: " + m[1] + "  (try /help)", "err");
			try {
				await cmd.run(m[2].trim());
			} catch (e) {
				print("error: " + errText(e), "err");
				console.error("ttyfy", e);
			}
			renderBar();
		}

		// "a; b" runs a, then b.
		async function runLine(raw) {
			const parts = raw.split(/;\s*(?=\/|\d+\s*(?:;|$))/).map((p) => p.trim()).filter(Boolean);
			for (const p of parts) {
				try {
					await run(p);
				} catch (e) {
					print("error: " + errText(e), "err");
				}
			}
		}

		// Tab: complete a command name, or an argument for a few commands.
		function complete() {
			const raw = input.value.replace(/^\//, "");
			if (!raw) return;
			const m = /^(\S+)\s+(.*)$/.exec(raw);
			if (m) {
				const key = m[1].toLowerCase();
				const name = own(ALIASES, key) ? ALIASES[key] : key;
				let pool = [];
				if (name === "playlist" && state.playlists) pool = state.playlists.map((p) => p.name);
				else if (name === "theme") pool = Object.keys(PALETTES).concat("default");
				else if (name === "help") pool = Object.keys(commands);
				const want = m[2].toLowerCase();
				const hits = pool.filter((x) => x.toLowerCase().startsWith(want));
				if (hits.length === 1) input.value = "/" + m[1] + " " + hits[0];
				else if (hits.length > 1) print(hits.join("  "), "dim");
				return;
			}
			const hits = Object.keys(commands).filter((k) => k.startsWith(raw.toLowerCase()));
			if (hits.length === 1) input.value = "/" + hits[0] + " ";
			else if (hits.length > 1) print(hits.map((h) => "/" + h).join("  "), "dim");
		}

		// ---------- input ----------

		function onKey(e) {
			if (e.isComposing || e.keyCode === 229) return; // still typing through an IME
			if (e.key === "Enter") {
				const v = input.value;
				if (v.trim()) {
					state.history.push(v);
					state.hpos = state.history.length;
				}
				state.draft = "";
				input.value = "";
				runLine(v);
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				if (state.hpos > 0) {
					if (state.hpos === state.history.length) state.draft = input.value;
					input.value = state.history[--state.hpos];
				}
			} else if (e.key === "ArrowDown") {
				e.preventDefault();
				if (state.hpos >= state.history.length) return; // not browsing history, keep the draft
				if (state.hpos < state.history.length - 1) input.value = state.history[++state.hpos];
				else {
					state.hpos = state.history.length;
					input.value = state.draft;
				}
			} else if (e.key === "Tab") {
				e.preventDefault();
				complete();
			} else if (e.key === "PageUp" || e.key === "PageDown") {
				e.preventDefault();
				out.scrollBy(0, (e.key === "PageUp" ? -1 : 1) * out.clientHeight * 0.9);
			} else if (e.ctrlKey && e.key.toLowerCase() === "l") {
				e.preventDefault();
				out.textContent = "";
				state.rows = [];
			}
		}

		input.addEventListener("keydown", (e) => {
			e.stopPropagation();
			onKey(e);
		});
		input.addEventListener("keyup", (e) => e.stopPropagation());

		root.addEventListener("mouseup", () => {
			if (!String(window.getSelection())) input.focus();
		});

		// Keys pressed while the terminal is showing but the input lost focus (for
		// example after selecting text to copy) still go to the command line, and
		// never reach Spotify's own shortcuts underneath.
		const FOCUS_KEYS = ["Backspace", "Delete", "Home", "End", "Enter", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown"];
		window.addEventListener(
			"keydown",
			(e) => {
				if (root.classList.contains("ttyfy-hidden") || document.activeElement === input) return;
				const paste = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v";
				if (!paste && (e.ctrlKey || e.metaKey || e.altKey)) return;
				if (!paste && e.key.length !== 1 && !FOCUS_KEYS.includes(e.key)) return;
				e.stopPropagation();
				input.focus();
				if (FOCUS_KEYS.includes(e.key) && !["Backspace", "Delete", "Home", "End", "ArrowLeft", "ArrowRight"].includes(e.key)) onKey(e);
			},
			true
		);

		// Ctrl+` hides or shows the terminal from anywhere.
		window.addEventListener(
			"keydown",
			(e) => {
				if (e.ctrlKey && !e.altKey && !e.metaKey && (e.key === "`" || e.code === "Backquote")) {
					e.preventDefault();
					if (!e.repeat) toggleGui();
				}
			},
			true
		);

		window.addEventListener("resize", () => {
			out.scrollTop = out.scrollHeight;
			updateCursor();
		});

		if (Player.addEventListener) {
			Player.addEventListener("songchange", () => {
				const t = current();
				if (t) {
					print("now playing: " + describe(t), "dim");
					if (t.uri) remember({ kind: "song", name: nameOf(t), uri: t.uri, artists: artistsOf(t) });
				}
				refreshMarks();
				renderBar();
				if (state.cava.on) loadCava();
			});
			Player.addEventListener("onplaypause", renderBar);
		}

		// ---------- hello ----------

		setTitle();
		document.documentElement.classList.add("ttyfy-ready");

		function welcome() {
			let t = null;
			try {
				t = current();
			} catch (e) {}
			if (t) print((Player.isPlaying() ? "playing: " : "paused:  ") + describe(t), "dim");
			const last = store("last");
			if (last) print("last: " + last.name + "  (/last to reopen)", "dim");
		}

		// Open on your playlists, so typing a number is the first thing you can do.
		print("ttyfy " + VERSION, "acc");
		loadPlaylists()
			.then((list) => {
				// If you already typed something, leave your screen alone.
				if (!state.view && !state.ran) openView("playlists", "playlists", list);
				welcome();
			})
			.catch((e) => {
				welcome();
				print("could not load playlists: " + errText(e), "err");
				print("/playlist to browse, /search words to find a song, /help for more", "dim");
			});
		input.focus();
	}
})();
