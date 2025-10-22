import { exec } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error("MONGODB_URI not found in .env file");
  process.exit(1);
}

const BACKUP_DIR = path.join(__dirname, "../backups", new Date().toISOString().split("T")[0]);
fs.mkdirSync(BACKUP_DIR, { recursive: true });

const command = `mongodump --uri="${MONGO_URI}" --out="${BACKUP_DIR}"`;

exec(command, (err, stdout, stderr) => {
  if (err) {
    console.error("Backup failed:", err.message);
  } else {
    console.log("Backup complete:", BACKUP_DIR);
  }
});
