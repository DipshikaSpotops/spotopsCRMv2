import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transcriptPath =
  "C:/Users/John Cochran/.cursor/projects/c-Users-John-Cochran-Desktop-sppsCRMv2/agent-transcripts/a6cfc5ab-f171-4642-9e6d-8536954210ad/a6cfc5ab-f171-4642-9e6d-8536954210ad.jsonl";
const outPath = path.resolve(__dirname, "../../shared/data/blockedYards.json");

const line = fs
  .readFileSync(transcriptPath, "utf8")
  .split("\n")
  .find((l) => l.includes("Ace Auto Wreckers") && l.includes("negative Yards"));

const obj = JSON.parse(line);
const text = obj.message.content.find((c) => c.type === "text").text;
const start = text.indexOf("they are:");
const end = text.indexOf("so how do u suggest");
const body = text.slice(start + 9, end > 0 ? end : undefined);
const rawLines = body.split(/\n/).map((l) => l.trim());

function isContinuation(line) {
  if (!line) return true;
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
  const m = line.match(/^(.+?)\s{1,3}(\d{2,}[\w\s,.-]+)$/i);
  if (m && m[1].length > 3) return m[1].trim();
  return line.trim();
}

function parseAddressBlob(blob) {
  const clean = String(blob || "")
    .replace(/^"/, "")
    .replace(/"$/, "")
    .replace(/\s+/g, " ")
    .trim();

  const phoneMatch =
    clean.match(/(?:Phone|Ph):\s*([+\d\s().-]+)/i) ||
    clean.match(/Phone:\s*([+\d\s().-]+)/i);
  const phone = phoneMatch ? phoneMatch[1].trim() : "";

  const withoutPhone = clean
    .replace(/(?:Phone|Ph):\s*[+\d\s().-]+/gi, "")
    .replace(/United States/gi, "")
    .replace(/,\s*$/g, "")
    .trim();

  let street = "";
  let city = "";
  let state = "";
  let zipcode = "";

  const cityStateZip = withoutPhone.match(
    /([^,]+),\s*([A-Za-z]{2,})\s+(\d{5}(?:-\d{4})?)/
  );
  if (cityStateZip) {
    const before = withoutPhone.slice(0, cityStateZip.index).trim().replace(/,\s*$/, "");
    street = before;
    city = cityStateZip[1].trim();
    state = cityStateZip[2].trim();
    zipcode = cityStateZip[3].trim();
  } else {
    const springfield = withoutPhone.match(
      /Salvage yard in\s+([^,]+),\s*([A-Za-z.\s]+)$/i
    );
    if (springfield) {
      city = springfield[1].trim();
      state = springfield[2].trim();
    } else if (withoutPhone && !/^phone:/i.test(withoutPhone)) {
      street = withoutPhone;
    }
  }

  return {
    street: street || undefined,
    city: city || undefined,
    state: state || undefined,
    zipcode: zipcode || undefined,
    phone: phone || undefined,
  };
}

const records = [];
let current = null;

for (const l of rawLines) {
  if (!l) continue;
  if (l.startsWith("so how") || l.startsWith("as u are")) break;

  if (!isContinuation(l)) {
    if (current) records.push(current);
    const tab = l.indexOf("\t");
    const name = extractName(l);
    const addressPart = tab >= 0 ? l.slice(tab + 1) : "";
    current = {
      yardName: name,
      ...parseAddressBlob(addressPart),
    };
    continue;
  }

  if (!current) continue;
  const extra = l.replace(/^"/, "").replace(/"$/, "");
  const parsed = parseAddressBlob(extra);
  current = {
    ...current,
    street: current.street || parsed.street,
    city: current.city || parsed.city,
    state: current.state || parsed.state,
    zipcode: current.zipcode || parsed.zipcode,
    phone: current.phone || parsed.phone,
  };
}

if (current) records.push(current);

// Manual fixes for lines the transcript parser can miss.
const manual = [
  { yardName: "49 Hopkins Auto Parts", street: "49 Hopkins St", city: "Buffalo", state: "NY", zipcode: "14220", phone: "+1 716-826-7278" },
  { yardName: "21 Motors", street: "2117 US-21", city: "Hamptonville", state: "NC", zipcode: "27020", phone: "+1 336-468-8257" },
];

for (const m of manual) {
  if (!records.some((r) => r.yardName.toLowerCase() === m.yardName.toLowerCase())) {
    records.push(m);
  }
}

fs.writeFileSync(outPath, JSON.stringify(records, null, 2) + "\n", "utf8");
console.log("Wrote", records.length, "blocked yard records to", outPath);
console.log(
  "With location:",
  records.filter((r) => r.city || r.state || r.zipcode || r.street).length
);
