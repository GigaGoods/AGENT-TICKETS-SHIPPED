#!/usr/bin/env node
// Proves docs/escrow-integration.md is faithful to programs/escrow/src/lib.rs.
//
// Track B codes directly off the integration guide, so drift between the guide and the program
// is a backend bug that only surfaces at deploy. This checker parses lib.rs as text (precise
// regexes, not a Rust parser) and audits the doc across six categories. Exit 0 only when every
// category reports zero discrepancies.
//
//   node scripts/verify-escrow-docs.mjs              # audit the repo's doc
//   node scripts/verify-escrow-docs.mjs --self-test  # prove each category can actually fail
//
// It never edits anything. When it fails, fix the DOC — lib.rs is the source of truth.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const RUST_PATH = path.join(ROOT, "programs/escrow/src/lib.rs");
const DOC_PATH = path.join(ROOT, "docs/escrow-integration.md");

const CATEGORIES = ["INSTRUCTIONS", "ERRORS", "EVENTS", "ACCOUNTS", "CONSTANTS", "STATE"];

// ---------- helpers ----------

/** Body of the brace-block whose opening `{` is at or after `from`. */
function braceBlock(src, from) {
  const open = src.indexOf("{", from);
  if (open === -1) throw new Error(`no block at offset ${from}`);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open + 1, i);
  }
  throw new Error(`unbalanced braces from offset ${from}`);
}

const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const digits = (s) => s.replace(/[_,\s]/g, "");

/** Does `text` name `field` as a standalone token (snake_case or camelCase)? */
function mentions(text, field) {
  for (const form of new Set([field, camel(field)])) {
    if (new RegExp(`(^|[^A-Za-z0-9_])${form}([^A-Za-z0-9_]|$)`).test(text)) return true;
  }
  return false;
}

// ---------- the audit ----------

function audit(rust, doc) {
  // --- parse the program ---
  const programBody = braceBlock(rust, rust.indexOf("pub mod agent_tickets_escrow"));

  const instructions = [...programBody.matchAll(/pub fn (\w+)\s*\(\s*ctx:\s*Context<(\w+)>/g)].map(
    ([, name, context]) => ({ name, context })
  );

  const errorBody = braceBlock(rust, rust.indexOf("pub enum EscrowError"));
  const errors = [...errorBody.matchAll(/#\[msg\("([^"]*)"\)\]\s*(\w+)\s*,/g)].map(
    ([, msg, name], i) => ({ name, msg, code: 6000 + i })
  );

  const events = [];
  for (const m of rust.matchAll(/#\[event\]\s*pub struct (\w+)\s*\{/g)) {
    const body = braceBlock(rust, m.index + m[0].length - 1);
    events.push({ name: m[1], fields: [...body.matchAll(/pub (\w+)\s*:/g)].map((f) => f[1]) });
  }

  const contexts = new Map();
  for (const m of rust.matchAll(
    /#\[derive\(Accounts\)\]\s*(?:#\[instruction\([^)]*\)\]\s*)?pub struct (\w+)<'info>\s*\{/g
  )) {
    const body = braceBlock(rust, m.index + m[0].length - 1);
    contexts.set(m[1], [...body.matchAll(/pub (\w+)\s*:/g)].map((f) => f[1]));
  }

  const constants = Object.fromEntries(
    [...rust.matchAll(/const (\w+):\s*\w+\s*=\s*([0-9_]+);/g)].map(([, k, v]) => [k, digits(v)])
  );
  constants.METADATA_URI_MAX_LEN = (rust.match(/#\[max_len\((\d+)\)\]\s*pub metadata_uri/) || [])[1];

  const stateEnums = {};
  for (const name of ["ListingStatus", "OrderState", "DisputeRuling", "RefundReason"]) {
    const body = braceBlock(rust, rust.indexOf(`pub enum ${name}`));
    stateEnums[name] = [...body.matchAll(/^\s*(\w+)\s*,/gm)].map((v) => v[1]);
  }

  // --- parse the doc ---

  // §4.x headings, e.g. "### 4.3 `create_listing(listing_id: u64, ...)`"
  const docSections = new Map();
  for (const chunk of doc.split(/^### /m).slice(1)) {
    const heading = chunk.slice(0, chunk.indexOf("\n"));
    const m = heading.match(/^\d+\.\d+\s+`(\w+)/);
    if (m) docSections.set(m[1], chunk);
  }

  // Error table rows: | 6000 | 0x1770 | `MarketPaused` | Marketplace is paused | ... |
  const docErrors = new Map();
  for (const line of doc.split("\n")) {
    const m = line.match(/^\|\s*(\d{4})\s*\|\s*(0x[0-9a-fA-F]+)\s*\|\s*`(\w+)`\s*\|\s*([^|]*?)\s*\|/);
    if (m) docErrors.set(m[3], { code: Number(m[1]), hex: m[2].toLowerCase(), msg: m[4] });
  }

  // Event rows, scoped to the "## N. Events" section so other 3-column tables can't
  // masquerade as event rows: | `ListingCreated` | `listing: Pubkey`, ... | ... |
  const eventsSection = (doc.match(/^## \d+\. Events\b[\s\S]*?(?=^## |$(?![\s\S]))/m) || [""])[0];
  if (!eventsSection) throw new Error("no '## N. Events' section in the doc");
  const docEvents = new Map();
  for (const line of eventsSection.split("\n")) {
    const m = line.match(/^\|\s*`(\w+)`\s*\|\s*(.+?)\s*\|\s*[^|]*\|\s*$/);
    if (m && /^[A-Z]/.test(m[1])) docEvents.set(m[1], m[2]);
  }

  // --- checks ---
  const failures = [];
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  const fail = (cat, msg) => {
    counts[cat]++;
    failures.push(`${cat}: ${msg}`);
  };

  // 1. INSTRUCTIONS — every handler documented, nothing documented that doesn't exist
  for (const { name } of instructions) {
    if (!docSections.has(name)) fail("INSTRUCTIONS", `no "### N.N \`${name}\`" section in the doc`);
  }
  for (const name of docSections.keys()) {
    if (!instructions.some((i) => i.name === name)) {
      fail("INSTRUCTIONS", `doc documents \`${name}\`, which is not a program instruction`);
    }
  }

  // 2. ERRORS — name, 6000+ code, hex, exact #[msg] text
  for (const e of errors) {
    const d = docErrors.get(e.name);
    if (!d) {
      fail("ERRORS", `${e.name} missing from the error table`);
      continue;
    }
    if (d.code !== e.code) fail("ERRORS", `${e.name} documented as ${d.code}, program order gives ${e.code}`);
    const hex = "0x" + e.code.toString(16);
    if (d.hex !== hex) fail("ERRORS", `${e.name} hex documented as ${d.hex}, expected ${hex}`);
    if (d.msg !== e.msg) fail("ERRORS", `${e.name} message documented as "${d.msg}", program says "${e.msg}"`);
  }
  for (const name of docErrors.keys()) {
    if (!errors.some((e) => e.name === name)) fail("ERRORS", `doc lists ${name}, not an EscrowError variant`);
  }

  // 3. EVENTS — every event, and every field of it, named in the table
  for (const ev of events) {
    const cell = docEvents.get(ev.name);
    if (cell === undefined) {
      fail("EVENTS", `${ev.name} missing from the events table`);
      continue;
    }
    for (const f of ev.fields) {
      if (!mentions(cell, f)) fail("EVENTS", `${ev.name}.${f} not named in the events table`);
    }
  }
  for (const name of docEvents.keys()) {
    if (!events.some((e) => e.name === name)) fail("EVENTS", `doc lists event ${name}, which is never emitted`);
  }

  // 4. ACCOUNTS — every field of an instruction's Accounts context appears in that instruction's
  // section. A shared context (Settle: confirm_receipt + timeout_release) may document a field
  // in either sharer's section.
  const sharers = new Map();
  for (const { name, context } of instructions) {
    if (!sharers.has(context)) sharers.set(context, []);
    sharers.get(context).push(name);
  }
  for (const { name, context } of instructions) {
    const fields = contexts.get(context);
    if (!fields) {
      fail("ACCOUNTS", `${name}: no #[derive(Accounts)] struct named ${context}`);
      continue;
    }
    const sections = sharers.get(context).map((n) => docSections.get(n) || "");
    if (!sections.join("").trim()) continue; // already reported by INSTRUCTIONS
    // Only the first cell of an account-table row counts — a passing mention in prose is not
    // documentation of the account list, and that is exactly the drift this check exists for.
    const listed = new Set();
    for (const line of sections.join("\n").split("\n")) {
      const cell = line.match(/^\|\s*([^|]*)\|/);
      if (!cell) continue;
      for (const tok of cell[1].matchAll(/`(\w+)`/g)) listed.add(tok[1]);
    }
    for (const f of fields) {
      if (!listed.has(f) && !listed.has(camel(f))) {
        fail("ACCOUNTS", `${name} (${context}): account \`${f}\` missing from the account table`);
      }
    }
  }

  // 5. CONSTANTS — the program's numbers are the ones the doc states
  for (const [key, value] of Object.entries(constants)) {
    if (value === undefined) {
      fail("CONSTANTS", `could not read ${key} from lib.rs`);
      continue;
    }
    const isMaxLen = key === "METADATA_URI_MAX_LEN";
    const found = doc.split("\n").some((line) => {
      const relevant = isMaxLen ? /metadata_uri/.test(line) && /max/i.test(line) : line.includes(key);
      return relevant && digits(line).includes(value);
    });
    if (!found) fail("CONSTANTS", `${key} = ${value} not stated in the doc`);
  }

  // 6. STATE — every variant of every state enum is mentioned somewhere
  for (const [enumName, variants] of Object.entries(stateEnums)) {
    for (const v of variants) {
      const lower = v[0].toLowerCase() + v.slice(1);
      if (!mentions(doc, v) && !mentions(doc, lower)) fail("STATE", `${enumName}::${v} never mentioned`);
    }
  }

  return { instructions, contexts, errors, events, stateEnums, counts, failures };
}

// ---------- self-test: each category must be able to fail ----------

function selfTest(rust, doc) {
  const mutations = [
    ["INSTRUCTIONS", (d) => d.replace("### 4.11 `open_dispute()`", "### 4.11 `open_argument()`")],
    ["ERRORS", (d) => d.replace("| 6009 | 0x1779 | `DeadlinePassed`", "| 6009 | 0x1780 | `DeadlinePassed`")],
    ["ERRORS", (d) => d.replace("Price must be > 0", "Price must be positive")],
    ["EVENTS", (d) => d.replace("`delivery_deadline: i64` | `lock_purchase`", "| `lock_purchase`")],
    ["ACCOUNTS", (d) => d.replace(/^\| `fee_token` \| \| ✅ \|.*$/m, "")],
    ["CONSTANTS", (d) => d.replace("`21_600` (6h)", "`21_500` (6h)")],
    ["STATE", (d) => d.replace(/ArbiterResolved/g, "Arbitrated")],
  ];
  let ok = true;
  for (const [category, mutate] of mutations) {
    const mutated = mutate(doc);
    if (mutated === doc) {
      console.log(`  SKIP  ${category.padEnd(12)} mutation no longer applies — update the self-test`);
      ok = false;
      continue;
    }
    const { counts } = audit(rust, mutated);
    const caught = counts[category] > 0;
    console.log(`  ${caught ? "PASS" : "FAIL"}  ${category.padEnd(12)} injected drift ${caught ? "caught" : "MISSED"}`);
    if (!caught) ok = false;
  }
  return ok;
}

// ---------- report ----------

const rust = fs.readFileSync(RUST_PATH, "utf8");
const doc = fs.readFileSync(DOC_PATH, "utf8");

if (process.argv.includes("--self-test")) {
  console.log("self-test: inject known drift into the doc, confirm the audit catches it");
  process.exit(selfTest(rust, doc) ? 0 : 1);
}

const r = audit(rust, doc);
console.log(`escrow doc fidelity: ${path.relative(ROOT, DOC_PATH)} vs ${path.relative(ROOT, RUST_PATH)}`);
console.log(
  `parsed: ${r.instructions.length} instructions, ${r.contexts.size} account contexts, ` +
    `${r.errors.length} errors, ${r.events.length} events, ${Object.keys(r.stateEnums).length} state enums`
);
for (const c of CATEGORIES) {
  console.log(`  ${r.counts[c] === 0 ? "PASS" : "FAIL"}  ${c.padEnd(12)} ${r.counts[c]} discrepancies`);
}
if (r.failures.length) {
  console.log("\ndiscrepancies:");
  for (const f of r.failures) console.log(`  - ${f}`);
}
console.log(`\n${r.failures.length} discrepancies across all six check categories`);
process.exit(r.failures.length ? 1 : 0);
