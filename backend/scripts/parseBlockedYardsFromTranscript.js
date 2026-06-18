import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transcriptPath =
  "C:/Users/John Cochran/.cursor/projects/c-Users-John-Cochran-Desktop-sppsCRMv2/agent-transcripts/a6cfc5ab-f171-4642-9e6d-8536954210ad/a6cfc5ab-f171-4642-9e6d-8536954210ad.jsonl";
const seedPath = path.resolve(
  __dirname,
  "../../shared/data/blockedYardNames.json"
);

const line = fs
  .readFileSync(transcriptPath, "utf8")
  .split("\n")
  .find((l) => l.includes("Ace Auto Wreckers") && l.includes("negative Yards"));

const obj = JSON.parse(line);
const text = obj.message.content.find((c) => c.type === "text").text;
const start = text.indexOf("they are:");
const end = text.indexOf("so how do u suggest");
const body = text.slice(start + 9, end > 0 ? end : undefined);
const lines = body.split(/\n/).map((l) => l.trim()).filter(Boolean);

function isContinuation(line) {
  if (line.includes("\t")) return false;
  if (/^\d/.test(line) && /[A-Za-z]{3,}/.test(line)) return false;
  return (
    /^"/.test(line) ||
    /^phone:/i.test(line) ||
    /^ph:/i.test(line) ||
    /^address:/i.test(line) ||
    /^\d{2,}[\s,]/.test(line) ||
    /^United States/i.test(line)
  );
}

function extractName(line) {
  const tab = line.indexOf("\t");
  if (tab >= 0) return line.slice(0, tab).trim();

  if (line.includes('"')) return line.slice(0, line.indexOf('"')).trim();

  if (/Address:/i.test(line)) return line.split(/Address:/i)[0].trim();

  // "Name 425 W Mt Houston Rd, Houston..." (space separated name + street number)
  const m = line.match(/^(.+?)\s{1,3}(\d{2,}[\w\s,.-]+(?:United States)?.*)$/i);
  if (m && m[1].length > 3) return m[1].trim();

  // "Name United States" only address
  if (/\bUnited States\b/i.test(line) && !/^Ph:/i.test(line)) {
    const m2 = line.match(/^(.+?)\s+\d/);
    if (m2) return m2[1].trim();
  }

  return line.trim();
}

const names = [];
for (const l of lines) {
  if (isContinuation(l)) continue;
  const name = extractName(l);
  if (!name || /^phone:/i.test(name) || /^ph:/i.test(name)) continue;
  names.push(name);
}

const current = JSON.parse(fs.readFileSync(seedPath, "utf8"));
const norm = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const currentKeys = new Set(current.map(norm));
const missing = names.filter((n) => !currentKeys.has(norm(n)));
const extra = current.filter((n) => !names.some((x) => norm(x) === norm(n)));

console.log("Parsed from user list:", names.length);
console.log("Current seed file:", current.length);
console.log("\nMissing from seed (" + missing.length + "):");
missing.forEach((n, i) => console.log(i + 1 + ". " + n));
console.log("\nExtra in seed not in user list (" + extra.length + "):");
extra.forEach((n, i) => console.log(i + 1 + ". " + n));

// Write corrected full list preserving user order
const outPath = seedPath;
fs.writeFileSync(outPath, JSON.stringify(names, null, 2) + "\n", "utf8");
console.log("\nWrote", names.length, "names to", outPath);
