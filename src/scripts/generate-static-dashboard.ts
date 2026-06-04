import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDbClient } from "../lib/db.js";
import { fetchAllWaitlistRows, toWaitlistReferralRows } from "../lib/leaders/stats.js";
import { renderMarketingDashboardHtml } from "../server.js";

async function main(): Promise<void> {
  const db = createDbClient();
  const rawRows = await fetchAllWaitlistRows(db, { onlyVerified: true });
  const rows = toWaitlistReferralRows(rawRows);
  const html = await renderMarketingDashboardHtml(rows, "confirmed", new Date());

  const publicDir = resolve(process.cwd(), "public");
  const dashboardDir = resolve(publicDir, "dashboard");

  await mkdir(dashboardDir, { recursive: true });
  await writeFile(resolve(publicDir, "index.html"), html, "utf8");
  await writeFile(resolve(dashboardDir, "index.html"), html, "utf8");
}

main().catch((error) => {
  console.error("[generate-static-dashboard] failed:", error);
  process.exitCode = 1;
});
