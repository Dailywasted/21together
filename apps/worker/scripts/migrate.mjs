// Applies migrations/*.sql to DATABASE_URL (from env or .dev.vars).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

let url = process.env.DATABASE_URL;
if (!url && existsSync(".dev.vars")) {
  url = readFileSync(".dev.vars", "utf8").match(/DATABASE_URL="?([^"\n]+)"?/)?.[1];
}
if (!url) throw new Error("DATABASE_URL missing");
const sql = neon(url);
for (const f of readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort()) {
  const text = readFileSync(`migrations/${f}`, "utf8");
  // Split on semicolons at line ends (no functions with bodies in our migrations).
  const statements = text.split(/;\s*$/m).map((s) => s.trim()).filter((s) => s && !/^(--.*\n?)+$/.test(s));
  for (const st of statements) await sql.query(st);
  console.log(`applied ${f} (${statements.length} statements)`);
}
const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1`;
console.log("tables:", tables.map((t) => t.table_name).join(", "));
