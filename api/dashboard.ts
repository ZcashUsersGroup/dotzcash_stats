import { createDbClient } from "../src/lib/db.js";
import { fetchAllWaitlistRows, toWaitlistReferralRows } from "../src/lib/leaders/stats.js";
import { renderMarketingDashboardHtml } from "../src/server.js";

export const config = {
  runtime: "nodejs",
};

export default async function handler(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const db = createDbClient();
    const rawRows = await fetchAllWaitlistRows(db, { onlyVerified: true });
    const rows = toWaitlistReferralRows(rawRows);
    const html = await renderMarketingDashboardHtml(rows, "confirmed", new Date());

    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": url.searchParams.get("refresh") ? "no-store" : "s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : JSON.stringify(error);

    return new Response(`Failed to render dashboard: ${message}`, {
      status: 500,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
}
