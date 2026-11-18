// Prints a table's timeline: server events + what each screen reported (taps, buttons shown, reloads, errors).
// Usage: node scripts/log.mjs CODE [apiBase] [minutes]
//   CODE     the 4-letter table code shown on the TV
//   apiBase  game server URL, e.g. https://21together-api.<your-subdomain>.workers.dev (default: http://localhost:8787 or $API)
//   minutes  only the last N minutes (default: everything kept, last ~1000 lines)
const [, , codeArg, apiArg, minutesArg] = process.argv;
if (!codeArg) {
  console.error("usage: node scripts/log.mjs CODE [apiBase] [minutes]");
  process.exit(1);
}
const api = (apiArg ?? process.env.API ?? "http://localhost:8787").replace(/\/$/, "");
const since = minutesArg ? Date.now() - Number(minutesArg) * 60_000 : 0;
const res = await fetch(`${api}/api/rooms/${codeArg.toUpperCase()}/log?since=${since}`);
if (!res.ok) {
  console.error(`HTTP ${res.status} from ${api}`);
  process.exit(1);
}
const { entries } = await res.json();
if (!entries?.length) {
  console.log("no log entries (unknown table, or nothing logged yet)");
  process.exit(0);
}
// Highlight the lines that usually explain a problem.
const LOUD = /TIMED OUT|REFUSED|ERROR|error|reload|connection lost|reconnected|audio|view|key/;
for (const e of entries) {
  const time = new Date(e.at).toLocaleTimeString([], { hour12: false });
  const who = e.who ? `${e.src}:${e.who}` : e.src;
  const line = `${time}  ${who.padEnd(16)} ${e.kind}${e.detail ? `  ${e.detail}` : ""}`;
  console.log(LOUD.test(`${e.kind} ${e.detail ?? ""}`) ? `>> ${line}` : `   ${line}`);
}
