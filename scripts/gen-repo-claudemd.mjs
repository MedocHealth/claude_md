#!/usr/bin/env node
/**
 * gen-repo-claudemd.mjs — generate each repo's CLAUDE.md from repos.yaml + its LIVE manifest.
 *
 *   node scripts/gen-repo-claudemd.mjs            # dry run, print a diff summary
 *   node scripts/gen-repo-claudemd.mjs --write    # write files
 *   node scripts/gen-repo-claudemd.mjs --check    # exit 1 if any file is out of sync (for CI)
 *   node scripts/gen-repo-claudemd.mjs --repo HPlus-Backend --write
 *
 * DESIGN NOTES
 * - Zero dependencies. No repo in this workspace has node_modules installed, so the
 *   generator must run on a bare Node. The YAML parser below is a STRICT subset parser:
 *   it throws on anything it does not fully understand rather than guessing. A loud
 *   failure beats silently generating wrong context into 89 repositories.
 * - Curated facts come from repos.yaml. Mechanical facts (version, scripts, architecture,
 *   package name) are read LIVE from each repo's manifest at generation time, so they
 *   cannot drift. Never copy a mechanical fact into repos.yaml.
 * - Everything between the BEGIN/END markers is owned by this generator and is
 *   overwritten. Anything a repo owner writes OUTSIDE the markers is preserved.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, rmSync } from "node:fs";
import { RULES, kindOf } from "./rules-content.mjs";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLAUDE_MD_REPO = resolve(HERE, "..");
const WORKSPACE = resolve(CLAUDE_MD_REPO, "..");

const BEGIN = "<!-- BEGIN:medoc-generated — owned by claude_md/repos.yaml. Edits here are overwritten. -->";
const END = "<!-- END:medoc-generated — write your own notes BELOW this line; they are preserved. -->";

/* ------------------------------------------------------------------ *
 * Strict YAML-subset parser.
 * Supports: nested block mappings (2-space indent), block sequences of scalars
 * and of inline-flow mappings, inline flow sequences, `#` comments, quoted and
 * bare scalars. Throws on tabs, on flow mappings spanning lines, and on anchors,
 * aliases, multi-line scalars or documents — none of which repos.yaml uses.
 * ------------------------------------------------------------------ */
function parseYaml(text, filename) {
  const die = (line, msg) => {
    throw new Error(`${filename}:${line + 1}: ${msg}\n  Supported subset: 2-space-indented block mappings, "- " sequences, [a, b] flow lists, # comments. Anchors, aliases, multi-line scalars and multi-line flow maps are NOT supported.`);
  };
  const raw = text.split("\n");
  const lines = [];
  raw.forEach((l, i) => {
    if (l.includes("\t")) die(i, "tab character — YAML indentation must use spaces");
    const stripped = stripComment(l);
    if (stripped.trim() === "") return;
    if (/^\s*(---|\.\.\.)\s*$/.test(stripped)) die(i, "document markers are not supported");
    if (/(^|\s)[&*]\w/.test(stripped)) die(i, "anchors/aliases are not supported");
    const indent = stripped.length - stripped.trimStart().length;
    if (indent % 2 !== 0) die(i, `odd indentation (${indent}) — use 2-space steps`);
    lines.push({ indent, text: stripped.trim(), n: i });
  });

  let pos = 0;
  const parseBlock = (indent) => {
    if (pos >= lines.length) return null;
    if (lines[pos].text.startsWith("- ")) return parseSeq(indent);
    return parseMap(indent);
  };
  const parseMap = (indent) => {
    const obj = {};
    while (pos < lines.length && lines[pos].indent === indent) {
      const { text, n } = lines[pos];
      if (text.startsWith("- ")) break;
      const m = text.match(/^([^:]+):\s*(.*)$/);
      if (!m) die(n, `expected "key: value", got ${JSON.stringify(text)}`);
      const key = m[1].trim();
      const rest = m[2].trim();
      pos++;
      if (rest !== "") { obj[key] = parseScalarOrFlow(rest, n); continue; }
      if (pos < lines.length && lines[pos].indent > indent) obj[key] = parseBlock(lines[pos].indent);
      else obj[key] = null;
    }
    return obj;
  };
  const parseSeq = (indent) => {
    const arr = [];
    while (pos < lines.length && lines[pos].indent === indent && lines[pos].text.startsWith("- ")) {
      const { text, n } = lines[pos];
      const rest = text.slice(2).trim();
      pos++;
      if (/^[^:{[]+:\s*/.test(rest)) {
        // sequence of mappings: first key inline, remaining keys indented further
        const m = rest.match(/^([^:]+):\s*(.*)$/);
        const item = { [m[1].trim()]: m[2].trim() === "" ? null : parseScalarOrFlow(m[2].trim(), n) };
        if (pos < lines.length && lines[pos].indent > indent) Object.assign(item, parseMap(lines[pos].indent));
        arr.push(item);
      } else if (rest === "") {
        if (pos < lines.length && lines[pos].indent > indent) arr.push(parseBlock(lines[pos].indent));
        else die(n, "empty sequence item");
      } else {
        arr.push(parseScalarOrFlow(rest, n));
      }
    }
    return arr;
  };
  const root = parseBlock(0);
  if (pos !== lines.length) die(lines[pos].n, "could not parse to end of file (check indentation)");
  return root;
}

function stripComment(line) {
  let out = "", q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { out += c; if (c === q && line[i - 1] !== "\\") q = null; continue; }
    if (c === '"' || c === "'") { q = c; out += c; continue; }
    if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) break;
    out += c;
  }
  return out.replace(/\s+$/, "");
}

function parseScalarOrFlow(s, n) {
  if (s.startsWith("[")) {
    if (!s.endsWith("]")) throw new Error(`line ${n + 1}: multi-line flow sequence not supported`);
    const inner = s.slice(1, -1).trim();
    return inner === "" ? [] : splitFlow(inner).map(unquote);
  }
  if (s.startsWith("{")) {
    if (!s.endsWith("}")) throw new Error(`line ${n + 1}: multi-line flow mapping not supported`);
    const o = {};
    const inner = s.slice(1, -1).trim();
    if (inner === "") return o;
    for (const part of splitFlow(inner)) {
      const m = part.match(/^([^:]+):\s*(.*)$/);
      if (!m) throw new Error(`line ${n + 1}: bad flow mapping entry ${JSON.stringify(part)}`);
      o[m[1].trim()] = unquote(m[2].trim());
    }
    return o;
  }
  return unquote(s);
}

function splitFlow(s) {
  const out = []; let cur = "", q = null, depth = 0;
  for (const c of s) {
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === "[" || c === "{") depth++;
    if (c === "]" || c === "}") depth--;
    if (c === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim() !== "") out.push(cur.trim());
  return out;
}

function unquote(s) {
  if (/^".*"$/.test(s) || /^'.*'$/.test(s)) return s.slice(1, -1).replace(/\\"/g, '"');
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null" || s === "~") return null;
  if (/^-?\d+$/.test(s)) return Number(s);
  return s;
}

/* ------------------------------------------------------------------ *
 * Live manifest facts — never stored in repos.yaml.
 * ------------------------------------------------------------------ */
function liveFacts(dir) {
  const f = { kind: "unknown", name: null, version: null, arch: null, scripts: {}, notes: [] };
  const pkgPath = join(dir, "package.json");
  const pubPath = join(dir, "pubspec.yaml");

  if (existsSync(pkgPath)) {
    f.kind = "node";
    let pkg = {};
    try { pkg = JSON.parse(readFileSync(pkgPath, "utf8")); }
    catch { f.notes.push("package.json is present but does not parse as JSON."); }
    f.name = pkg.name ?? null;
    f.version = pkg.version ?? null;
    f.scripts = pkg.scripts ?? {};
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    f.deps = deps;
    f.hasLock = existsSync(join(dir, "package-lock.json"));
    f.isNext = Boolean(deps.next);
    f.jestConfig = ["jest.config.js", "jest.config.ts", "jest.config.mjs", "jest.config.cjs", "jest.config.json"]
      .some((n) => existsSync(join(dir, n))) || Boolean(pkg.jest);
  } else if (existsSync(pubPath)) {
    f.kind = "flutter";
    const txt = readFileSync(pubPath, "utf8");
    f.name = (txt.match(/^name:\s*(.+)$/m) || [])[1]?.trim() ?? null;
    f.version = (txt.match(/^version:\s*(.+)$/m) || [])[1]?.trim() ?? null;
    f.dartSdk = (txt.match(/^\s*sdk:\s*(.+)$/m) || [])[1]?.trim() ?? null;
  } else if (existsSync(join(dir, "platformio.ini"))) {
    f.kind = "platformio";
  } else if (existsSync(join(dir, "requirements.txt")) || existsSync(join(dir, "pyproject.toml"))) {
    f.kind = "python";
  }

  const has = (p) => existsSync(join(dir, p));
  const featureSliced = has("src/features");
  const layered = has("src/controllers") || has("src/repositories");
  f.arch = featureSliced && layered ? "mixed (feature-sliced + layered)"
    : featureSliced ? "feature-sliced"
    : layered ? "layered MVC"
    : null;
  f.husky = has(".husky");
  f.docker = has("Dockerfile");
  return f;
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */
const bullets = (items) => (items || []).map((s) => `- ${s}`).join("\n");

function render(repoName, spec, live, data) {
  const L = [];
  const product = data.products?.[spec.product];
  const status = spec.status;

  L.push(BEGIN, "");
  L.push(`# ${repoName}`, "");

  // The loudest thing first: is this repo even the right place to be?
  if (status === "legacy") {
    L.push(`> ## ⛔ STOP — THIS REPO IS DORMANT`, ">");
    L.push(`> Do not implement features or fix bugs here.${spec.live ? ` The live repo is **\`${spec.live}\`** — work there instead.` : ""}`);
    L.push(`>`, `> Editing a dead twin is the single most common way to waste a session in this workspace.`);
    L.push(`> Legitimate reasons to touch this repo: a security remediation, or reading it for history.`, "");
  } else if (status === "mirror") {
    L.push(`> ## ⚠ RELEASE MIRROR — NOT THE WORKING REPO`, ">");
    L.push(`> Shares git history with **\`${spec.live}\`**, which is ahead. Day-to-day work belongs there.`);
    L.push(`> If you are unsure which repo a change belongs in, **ask — do not guess**.`, "");
  } else if (status === "artifact") {
    L.push(`> ## ⚠ BUILD ARTIFACT — DO NOT HAND-EDIT`, ">");
    L.push(`> This is compiled output. Change the source repo and rebuild; edits here are lost on the next build.`, "");
  } else if (status === "stub") {
    L.push(`> ## ⚠ STUB — no implementation here yet`, "");
  }

  // Identity
  const idRows = [];
  if (product) idRows.push(["Product", `${product.name} — ${product.persona}`]);
  idRows.push(["Status", status]);
  if (spec.role) idRows.push(["Role", spec.role]);
  if (live.name) idRows.push(["Package name", `\`${live.name}\`${live.name !== repoName ? " — **differs from the repo name**" : ""}`]);
  if (live.version) idRows.push(["Version", `\`${live.version}\``]);
  if (spec.port) idRows.push(["Local port", `\`${spec.port}\``]);
  if (live.arch) idRows.push(["Architecture", `${live.arch} — **match it; do not migrate opportunistically**`]);
  if (idRows.length) {
    L.push("| | |", "|---|---|");
    idRows.forEach(([k, v]) => L.push(`| **${k}** | ${v} |`));
    L.push("");
  }

  // Hazards — second loudest.
  if (spec.hazards?.length) {
    L.push(`## ⚠ Hazards in this repo`, "");
    L.push(bullets(spec.hazards), "");
    L.push(`Treat every item above as **unremediated** until you confirm otherwise in the source.`, "");
  }

  // Commands, from the live manifest.
  if (live.kind === "node" && Object.keys(live.scripts).length) {
    L.push("## Commands", "");
    const want = ["dev", "dev:mac", "build", "start", "test", "ts.check", "audit", "generate:keys", "initialize"];
    const rows = want.filter((k) => live.scripts[k]).map((k) => `| \`npm run ${k}\` | \`${live.scripts[k]}\` |`);
    if (rows.length) L.push("| Script | Runs |", "|---|---|", ...rows, "");
    L.push(live.hasLock
      ? "Install with **`npm ci`**. Never `npm install`, never hand-edit `package-lock.json`."
      : "**No `package-lock.json` — `npm ci` will FAIL here.** Use `npm install`.");
    if (!live.scripts["ts.check"] && live.kind === "node" && existsSync(join(WORKSPACE, repoName, "tsconfig.json")))
      L.push("", "No `ts.check` script — typecheck with `npx tsc --noEmit -p tsconfig.json`.");
    if (live.scripts.test?.includes("jest") && !live.jestConfig)
      L.push("", "> **`npm test` declares jest but this repo ships NO jest config.** A green-looking run here means nothing. Wire a config before claiming a test passes — copy the harness from `Support-Dashboard-Backend`.");
    L.push("");
  } else if (live.kind === "flutter") {
    L.push("## Commands", "", "```sh", "flutter pub get", "flutter run", "flutter test test/foo_test.dart --plain-name \"...\"", "```");
    if (live.dartSdk) L.push("", `Dart SDK constraint: \`${live.dartSdk}\`.`);
    L.push("");
  }

  if (live.isNext) {
    L.push("## Next.js", "", "This repo ships an `AGENTS.md`: **this is not the Next.js you know.** Read the relevant guide in `node_modules/next/dist/docs/` before writing code, and heed deprecation notices.", "");
  }

  // Cross-repo duties.
  const cps = (spec.couplings || []).map((k) => data.couplings?.[k]).filter(Boolean);
  if (cps.length) {
    L.push("## Cross-repo duties — these are obligations, not suggestions", "");
    L.push("Either make the linked change in the same task, or say explicitly that it is out of scope and why. **Never leave a link silently broken.**", "");
    L.push("| Trigger | You must also touch | Why |", "|---|---|---|");
    for (const c of cps) {
      const also = c.also.filter((r) => r !== repoName).map((r) => `\`${r}\``).join(", ") || "—";
      L.push(`| ${c.trigger} | ${also} | ${c.why} |`);
    }
    L.push("");
    L.push("Adding, renaming or removing a route also means **regenerating `route-hash-map.json`** — an unregistered route returns 404 by design, so a new endpoint that 404s means a stale hash map, not a broken router.", "");
  }

  if (spec.notes?.length) { L.push("## Repo-specific gotchas", "", bullets(spec.notes), ""); }
  if (spec.reference_for?.length) {
    L.push("## This repo is a reference implementation for", "", bullets(spec.reference_for), "");
    L.push("When you need a model for this concern anywhere in the workspace, read it here first.", "");
  }

  L.push("## Workspace rules", "");
  L.push("The non-negotiable rules (tenant scoping, no committed secrets, no fallback secrets, no PHI in logs) are");
  L.push("installed machine-wide by `claude_md/scripts/bootstrap.sh`. If you have not run it, do that first —");
  L.push("otherwise you are working without the rules that keep tenant data separated.");
  L.push("");
  L.push("Full workspace map, deep references and the mistake ledger: the **`claude_md`** repo.");
  L.push("");
  L.push(END);
  return L.join("\n");
}


/* ------------------------------------------------------------------ *
 * Path-scoped rules. These MUST live inside each repo: `.claude/rules/` is
 * project-scoped, so a rule sitting in claude_md would never load for someone
 * working in HPlus-Backend. Generated, so there is still one source of truth.
 * ------------------------------------------------------------------ */
function renderRule(rule) {
  const fm = ["---", "paths:", ...rule.paths.map((p) => `  - "${p}"`), "---", ""];
  return [
    ...fm,
    BEGIN,
    "",
    `# ${rule.title}`,
    "",
    rule.body,
    "",
    BEGIN.includes("x") ? "" : END,
    "",
  ].join("\n");
}

function emitRules(dir, live, spec, apply) {
  const hasSrcTs = existsSync(join(dir, "src"));
  const kind = kindOf(live, hasSrcTs);
  // Artifacts and stubs hold no code worth ruling on. Packages are libraries: coding
  // conventions apply, but tenancy and auth rules would be pure noise in a zero-IO lib.
  const noCode = spec.status === "artifact" || spec.status === "stub";
  const isLib = spec.status === "package";
  let written = 0, drift = 0;
  const rulesDir = join(dir, ".claude", "rules");
  const wanted = new Set();
  for (const rule of RULES) {
    if (noCode) continue;
    if (!kind) continue;
    if (!rule.kinds.includes(kind) && !rule.kinds.includes("any")) continue;
    if (isLib && (rule.file === "tenancy.md" || rule.file === "auth-and-phi.md")) continue;
    wanted.add(rule.file);
    if (rule.file === "delivery.md" && !live.docker && !existsSync(join(dir, "Jenkinsfile")) && !existsSync(join(dir, ".github"))) continue;
    const target = join(rulesDir, rule.file);
    const generated = renderRule(rule);
    let next = generated;
    if (existsSync(target)) {
      const existing = readFileSync(target, "utf8");
      const e = existing.indexOf(END);
      if (existing.includes(BEGIN) && e !== -1) next = generated.slice(0, generated.indexOf(END) + END.length) + existing.slice(e + END.length);
      if (existing === next) continue;
    }
    if (apply === "write") { mkdirSync(rulesDir, { recursive: true }); writeFileSync(target, next.endsWith("\n") ? next : next + "\n"); written++; }
    else if (apply === "check") { drift++; console.log(`DRIFT  ${basename(dir)}/.claude/rules/${rule.file}`); }
    else written++;
  }
  // Prune rules this repo should no longer carry (status changed, stack changed).
  if (existsSync(rulesDir)) {
    for (const f of readdirSync(rulesDir)) {
      if (!RULES.some((r) => r.file === f) || wanted.has(f)) continue;
      const body = readFileSync(join(rulesDir, f), "utf8");
      if (!body.includes(BEGIN)) continue;            // hand-written: never delete
      if (apply === "write") { rmSync(join(rulesDir, f)); written++; console.log(`prune  ${basename(dir)}/.claude/rules/${f}`); }
      else if (apply === "check") { drift++; console.log(`STALE  ${basename(dir)}/.claude/rules/${f}`); }
      else { written++; console.log(`would prune  ${basename(dir)}/.claude/rules/${f}`); }
    }
  }
  return { written, drift };
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */
const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const CHECK = argv.includes("--check");
const only = argv.includes("--repo") ? argv[argv.indexOf("--repo") + 1] : null;

const data = parseYaml(readFileSync(join(CLAUDE_MD_REPO, "repos.yaml"), "utf8"), "repos.yaml");
if (!data?.repos) { console.error("repos.yaml: no `repos:` key found"); process.exit(1); }

const onDisk = new Set(readdirSync(WORKSPACE, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(WORKSPACE, d.name, ".git")))
  .map((d) => d.name));

let written = 0, unchanged = 0, drift = 0, missing = [];
for (const [repoName, spec] of Object.entries(data.repos)) {
  if (only && repoName !== only) continue;
  const dir = join(WORKSPACE, repoName);
  if (!onDisk.has(repoName)) { missing.push(repoName); continue; }

  const live = liveFacts(dir);
  const generated = render(repoName, spec, live, data);
  const target = join(dir, "CLAUDE.md");

  let next = generated;
  if (existsSync(target)) {
    const existing = readFileSync(target, "utf8");
    const e = existing.indexOf(END);
    if (existing.includes(BEGIN) && e !== -1) {
      next = generated + existing.slice(e + END.length);        // preserve owner content below marker
    } else {
      next = generated + "\n\n" + existing.trim() + "\n";        // adopt pre-existing file wholesale
    }
    if (existing === next) { unchanged++; const r0 = emitRules(dir, live, spec, CHECK ? "check" : WRITE ? "write" : "dry"); written += r0.written; drift += r0.drift; continue; }
  }
  if (CHECK) { drift++; console.log(`DRIFT  ${repoName}/CLAUDE.md`); }
  else if (WRITE) { writeFileSync(target, next.endsWith("\n") ? next : next + "\n"); written++; console.log(`write  ${repoName}/CLAUDE.md`); }
  else { written++; console.log(`would write  ${repoName}/CLAUDE.md`); }

  const r = emitRules(dir, live, spec, CHECK ? "check" : WRITE ? "write" : "dry");
  written += r.written; drift += r.drift;
}

const extra = [...onDisk].filter((r) => !data.repos[r] && r !== "claude_md");
console.log(`\n${WRITE ? "written" : CHECK ? "drifted" : "would write"}: ${WRITE ? written : CHECK ? drift : written}   unchanged: ${unchanged}`);
if (missing.length) console.log(`in repos.yaml but not on disk (${missing.length}): ${missing.join(", ")}`);
if (extra.length) console.log(`on disk but NOT in repos.yaml (${extra.length}): ${extra.join(", ")}\n  -> add them, or the team gets no context there.`);
if (CHECK && drift) { console.error(`\n${drift} file(s) out of sync with repos.yaml. Run: node scripts/gen-repo-claudemd.mjs --write`); process.exit(1); }
