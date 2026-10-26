// Checks that run on every push (see .github/workflows/check.yml).
// Run by hand with: node scripts/check.js
const fs = require("fs");
const vm = require("vm");
const { execFileSync } = require("child_process");

let failed = 0;
const fail = (msg) => {
	console.error("FAIL  " + msg);
	failed++;
};
const ok = (msg) => console.log("ok    " + msg);

// 1. The files the theme needs exist.
for (const f of ["user.css", "theme.js", "color.ini", "manifest.json", "preview.png", "README.md", "LICENSE"]) {
	fs.existsSync(f) ? ok(f + " exists") : fail(f + " is missing");
}

// 2. manifest.json is valid and has the fields the Marketplace needs.
try {
	const m = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
	for (const k of ["name", "description", "usercss", "schemes", "preview", "authors", "tags"]) {
		m[k] ? ok("manifest has " + k) : fail("manifest is missing " + k);
	}
	if (!Array.isArray(m.include) || !m.include.every((u) => /^https:\/\//.test(u))) fail("manifest include must be absolute https URLs");
	else ok("manifest include is absolute");
} catch (e) {
	fail("manifest.json is not valid JSON: " + e.message);
}

// 3. theme.js has no syntax errors.
try {
	execFileSync(process.execPath, ["--check", "theme.js"], { stdio: "pipe" });
	ok("theme.js has no syntax errors");
} catch (e) {
	fail("theme.js syntax error: " + String(e.stderr || e.message).split("\n").slice(0, 4).join(" "));
}

// 4. color.ini and the PALETTES copy in theme.js agree (the /theme command).
function parseIni(text) {
	const out = {};
	let cur = null;
	for (const raw of text.split("\n")) {
		const line = raw.trim();
		if (!line || line.startsWith(";")) continue;
		const sec = /^\[(.+)\]$/.exec(line);
		if (sec) cur = out[sec[1]] = {};
		else if (cur && line.includes("=")) {
			const i = line.indexOf("=");
			cur[line.slice(0, i).trim()] = line.slice(i + 1).trim().toLowerCase();
		}
	}
	return out;
}
try {
	const ini = parseIni(fs.readFileSync("color.ini", "utf8"));
	const src = fs.readFileSync("theme.js", "utf8");
	const start = src.indexOf("const PALETTES = {");
	const end = src.indexOf("\n\t};", start);
	if (start < 0 || end < 0) throw new Error("could not find PALETTES in theme.js");
	const palettes = vm.runInNewContext("(" + src.slice(start + "const PALETTES = ".length, end + 3) + ")");
	const names = Object.keys(ini);
	if (!names.length) fail("color.ini has no schemes");
	for (const n of names) {
		if (!palettes[n]) {
			fail("scheme " + n + " is in color.ini but not in PALETTES");
			continue;
		}
		const keys = Object.keys(ini[n]);
		const same = keys.length === Object.keys(palettes[n]).length && keys.every((k) => (palettes[n][k] || "").toLowerCase() === ini[n][k]);
		same ? ok("scheme " + n + " matches in color.ini and theme.js") : fail("scheme " + n + " differs between color.ini and PALETTES");
	}
	for (const n of Object.keys(palettes)) if (!ini[n]) fail("scheme " + n + " is in PALETTES but not in color.ini");
} catch (e) {
	fail("color check: " + e.message);
}

console.log(failed ? "\n" + failed + " check(s) failed" : "\nall checks passed");
process.exit(failed ? 1 : 0);
