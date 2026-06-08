import { createDbClient } from "../dist/lib/db.js";
import { fetchAllWaitlistRows, toWaitlistReferralRows } from "../dist/lib/leaders/stats.js";
import { renderMarketingDashboardPage } from "../dist/server.js";

const cache = new Map();

async function loadRows() {
  const db = createDbClient();
  const rawRows = await fetchAllWaitlistRows(db, { onlyVerified: true });
  return toWaitlistReferralRows(rawRows).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const html = await renderMarketingDashboardPage({
      loadRows,
      cache,
      requestUrl: request.url,
      requestedDate: url.searchParams.get("date"),
    });

    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);

    return new Response(`Failed to render dashboard: ${message}`, {
      status: 500,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store, max-age=0",
      },
    });
  }
}
