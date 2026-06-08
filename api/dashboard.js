import { createDbClient } from "../dist/lib/db.js";
import { fetchAllWaitlistRows, toWaitlistReferralRows } from "../dist/lib/leaders/stats.js";
import { renderMarketingDashboardHtml } from "../dist/server.js";

function formatUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

function getLatestRowDate(rows, fallbackDate = new Date()) {
  if (rows.length === 0) {
    return formatUtcDate(fallbackDate);
  }

  return rows.reduce((latestDate, row) => {
    const rowDate = row.created_at.slice(0, 10);
    return rowDate > latestDate ? rowDate : latestDate;
  }, rows[0].created_at.slice(0, 10));
}

function endOfUtcDay(dateString) {
  return new Date(`${dateString}T23:59:59.999Z`);
}

function startOfNextUtcDay(dateString) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

export async function GET() {
  try {
    const db = createDbClient();
    const rawRows = await fetchAllWaitlistRows(db, { onlyVerified: true });
    const rows = toWaitlistReferralRows(rawRows).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    const latestDate = getLatestRowDate(rows, new Date());
    const effectiveRows = rows.filter(
      (row) => new Date(row.created_at).getTime() < startOfNextUtcDay(latestDate).getTime(),
    );
    const html = await renderMarketingDashboardHtml(effectiveRows, "confirmed", endOfUtcDay(latestDate), {
      datePicker: {
        selectedDate: latestDate,
        minDate: rows[0]?.created_at.slice(0, 10) ?? latestDate,
        maxDate: latestDate,
        latestDate,
        latestHref: "/dashboard/",
        dateHrefPrefix: "/dashboard/",
      },
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
