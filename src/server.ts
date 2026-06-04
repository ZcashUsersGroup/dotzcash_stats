import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createDbClient } from "./lib/db.js";
import { ensureEnvLoaded } from "./lib/env.js";
import type { ReferralScope, WaitlistReferralRow } from "./lib/leaders/referral-dashboard.js";
import {
  buildMarketingDashboardSnapshot,
  type DashboardMarketingHook,
  type MarketingDashboardSnapshot,
} from "./lib/leaders/shareworthy-stats.js";
import { fetchAllWaitlistRows, toWaitlistReferralRows } from "./lib/leaders/stats.js";

export interface MarketingDashboardServerOptions {
  loadRows?: () => Promise<WaitlistReferralRow[]>;
  now?: () => Date;
  defaultScope?: ReferralScope;
}

interface CachedDashboard {
  html: string;
  generatedAt: number;
}

const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000;

ensureEnvLoaded();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? new Intl.NumberFormat("en-US").format(value) : "Infinity";
}

function formatPercent(value: number): string {
  return Number.isFinite(value) ? `${value}%` : "Infinity";
}

function formatZec(value: number): string {
  return `${value.toFixed(4)} ZEC`;
}

function formatDashboardTimestamps(value: string): { utc: string; eastern: string } {
  const date = new Date(value);

  return {
    utc: new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "short",
    }).format(date),
    eastern: new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "short",
    }).format(date),
  };
}

function serializeForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

interface TableRowData {
  cells: string[];
  hook?: DashboardMarketingHook;
}

function renderLeader(identity: MarketingDashboardSnapshot["headlineKpis"]["allTimeLeader"]): string {
  if (!identity) return "<span class=\"muted\">None</span>";
  return `<strong>${escapeHtml(identity.name)}</strong><span class="meta">@${escapeHtml(identity.referralCode)}</span>`;
}

function renderHookTrigger(hook: DashboardMarketingHook): string {
  return `<button class="hook-trigger" type="button" data-hook-trigger="${escapeHtml(hook.id)}" aria-label="Open hook for ${escapeHtml(
    hook.label,
  )}">
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 12h8m-4-4 4 4-4 4m5-9h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/>
    </svg>
  </button>`;
}

function renderSectionHookComposer(hook: DashboardMarketingHook): string {
  return `
    <div class="section-hook" data-hook-editor="${escapeHtml(hook.id)}">
      <div class="section-hook-head">
        <span class="section-hook-label">Section hook</span>
        <div class="hook-actions">
          <button class="hook-action" type="button" data-hook-copy="${escapeHtml(hook.id)}">Copy</button>
          <button class="hook-action secondary" type="button" data-hook-reset="${escapeHtml(hook.id)}">Reset</button>
        </div>
      </div>
      <textarea class="hook-textarea" rows="2" data-hook-input="${escapeHtml(hook.id)}">${escapeHtml(hook.defaultText)}</textarea>
    </div>
  `;
}

function renderStatCard(label: string, value: string, detail: string, hook?: DashboardMarketingHook): string {
  return `<article class="stat-card">
    <div class="stat-card-top">
      <span class="eyebrow">${escapeHtml(label)}</span>
      ${hook ? renderHookTrigger(hook) : ""}
    </div>
    <strong>${value}</strong>
    <p>${escapeHtml(detail)}</p>
  </article>`;
}

function renderRowsTable(headers: string[], rows: TableRowData[], emptyLabel: string): string {
  if (rows.length === 0) {
    return `<div class="empty">${escapeHtml(emptyLabel)}</div>`;
  }

  return `
    <table>
      <thead>
        <tr>
          ${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}
          <th class="hook-col">Hook</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `<tr>${row.cells.map((cell) => `<td>${cell}</td>`).join("")}<td class="hook-cell">${row.hook ? renderHookTrigger(row.hook) : ""}</td></tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderReviewBlock(title: string, review: MarketingDashboardSnapshot["dailyReview"], hook: DashboardMarketingHook): string {
  return `
    <section class="panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">${escapeHtml(title)}</span>
          <h2>${escapeHtml(review.label)}</h2>
        </div>
        <span class="chip">${escapeHtml(review.periodStart)} to ${escapeHtml(review.periodEnd)}</span>
      </div>
      ${renderSectionHookComposer(hook)}
      <div class="review-grid">
        <article class="subpanel">
          <h3>Winner / Why</h3>
          <p><strong>${escapeHtml(review.winnerWhy.leader?.name ?? "None")}</strong> led with ${formatNumber(
            review.winnerWhy.leaderReferrals,
          )} referrals.</p>
          <p>Runner-up: ${escapeHtml(review.winnerWhy.runnerUp?.name ?? "None")}.</p>
          <p>Gap: ${formatNumber(review.winnerWhy.gapToRunnerUp)}.</p>
          <p>Share of window: ${formatPercent(review.winnerWhy.shareOfTotalPct)}.</p>
          <p>On streak: ${review.winnerWhy.onStreak ? "Yes" : "No"}.</p>
          <p>Leadership changed: ${review.winnerWhy.leadershipChanged ? "Yes" : "No"}.</p>
        </article>
        <article class="subpanel">
          <h3>Campaign Health</h3>
          <p>Total referrals: ${formatNumber(review.campaignHealth.totalReferrals)}.</p>
          <p>Total signups: ${formatNumber(review.campaignHealth.totalSignups)}.</p>
          <p>Growth vs previous: ${formatPercent(review.campaignHealth.growthPct)}.</p>
          <p>Referred share: ${formatPercent(review.campaignHealth.referredSharePct)}.</p>
          <p>Non-referred share: ${formatPercent(review.campaignHealth.nonReferredSharePct)}.</p>
          <p>Rewards pot delta: ${formatZec(review.campaignHealth.rewardsDelta)}.</p>
        </article>
        <article class="subpanel narrative">
          <h3>Narrative Summary</h3>
          <p>${escapeHtml(review.narrativeSummary)}</p>
        </article>
      </div>
    </section>
  `;
}

function renderDocument(snapshot: MarketingDashboardSnapshot): string {
  const sections = snapshot.marketingHooks.sections;
  const formattedTimestamps = formatDashboardTimestamps(snapshot.generatedAt);
  const newcomerRows: TableRowData[] = snapshot.newcomers.map((entry, index) => ({
    cells: [
      `<strong>${escapeHtml(entry.name)}</strong><span class="meta">@${escapeHtml(entry.referralCode)}</span>`,
      escapeHtml(entry.firstAttributedReferralAt.slice(0, 10)),
      formatNumber(entry.current7DayAttributedReferrals),
      formatNumber(entry.totalAttributedReferrals),
      entry.leaderboardRank === null ? "n/a" : `#${formatNumber(entry.leaderboardRank)}`,
    ],
    hook: sections.newcomers.items[index],
  }));
  const moverRows: TableRowData[] = snapshot.movers.map((entry, index) => ({
    cells: [
      `<strong>${escapeHtml(entry.name)}</strong><span class="meta">@${escapeHtml(entry.referralCode)}</span>`,
      `+${formatNumber(entry.gain)}`,
      formatNumber(entry.current7DayAttributedReferrals),
      formatNumber(entry.previous7DayAttributedReferrals),
      entry.leaderboardRank === null ? "n/a" : `#${formatNumber(entry.leaderboardRank)}`,
    ],
    hook: sections.movers.items[index],
  }));
  const streakRows: TableRowData[] = snapshot.streaks.recentDailyWinners.map((entry, index) => ({
    cells: [
      escapeHtml(entry.date),
      `<strong>${escapeHtml(entry.leader.name)}</strong><span class="meta">@${escapeHtml(entry.leader.referralCode)}</span>`,
      formatNumber(entry.count),
    ],
    hook: sections.streaks.items[index],
  }));
  const zecDailyRows: TableRowData[] = snapshot.zecChanges.daily.map((entry, index) => ({
    cells: [
      `<strong>${escapeHtml(entry.name)}</strong><span class="meta">@${escapeHtml(entry.referralCode)}</span>`,
      formatZec(entry.delta),
      formatZec(entry.currentProjectedZec),
      formatZec(entry.previousProjectedZec),
    ],
    hook: sections["zec-changes"].items[index],
  }));
  const zecWeeklyRows: TableRowData[] = snapshot.zecChanges.weekly.map((entry, index) => ({
    cells: [
      `<strong>${escapeHtml(entry.name)}</strong><span class="meta">@${escapeHtml(entry.referralCode)}</span>`,
      formatZec(entry.delta),
      formatZec(entry.currentProjectedZec),
      formatZec(entry.previousProjectedZec),
    ],
    hook: sections["zec-changes"].items[snapshot.zecChanges.daily.length + index],
  }));
  const cabalRows: TableRowData[] = snapshot.cabalProtection.map((entry, index) => ({
    cells: [
      `<strong>${escapeHtml(entry.name)}</strong><span class="meta">@${escapeHtml(entry.referralCode)}</span>`,
      formatZec(entry.fixedPayout),
      formatZec(entry.commissionPayout),
      formatZec(entry.protectedDelta),
      formatPercent(entry.commissionRate * 100),
    ],
    hook: sections["cabal-protection"].items[index],
  }));
  const hookEntries = Object.values(sections).flatMap((section) => [section.section, ...section.items]);
  const hooksPayload = Object.fromEntries(hookEntries.map((hook) => [hook.id, hook]));
  const tocLinks = [
    ["overview", "Overview"],
    ["streaks", "Streaks"],
    ["newcomers", "Top newcomers"],
    ["movers", "Top movers"],
    ["daily-review", "Daily review"],
    ["weekly-review", "Weekly review"],
    ["leader-changes", "Leader changes"],
    ["zec-changes", "ZEC changes"],
    ["cabal-protection", "Cabal protection"],
    ["shareworthy", "Shareworthy callouts"],
    ["funnel", "Referral funnel"],
  ];

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Referral Marketing Dashboard</title>
      <style>
        :root {
          --bg: #f5efe4;
          --panel: rgba(255, 250, 240, 0.88);
          --panel-strong: #fff8ec;
          --line: rgba(78, 56, 36, 0.14);
          --text: #22170f;
          --muted: #6f5a48;
          --accent: #b34a22;
          --accent-soft: #ffd8ae;
          --green: #2d7f5e;
          --shadow: 0 18px 50px rgba(64, 39, 19, 0.12);
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: Georgia, "Times New Roman", serif;
          color: var(--text);
          background:
            radial-gradient(circle at top left, rgba(255, 196, 140, 0.7), transparent 28%),
            radial-gradient(circle at top right, rgba(191, 228, 205, 0.9), transparent 22%),
            linear-gradient(180deg, #f9f4ea 0%, var(--bg) 100%);
        }
        .shell {
          max-width: 1320px;
          margin: 0 auto;
          padding: 32px 20px 56px;
        }
        header.hero {
          display: grid;
          gap: 18px;
          padding: 28px;
          border: 1px solid var(--line);
          border-radius: 24px;
          background: linear-gradient(145deg, rgba(255, 247, 233, 0.96), rgba(248, 235, 214, 0.82));
          box-shadow: var(--shadow);
        }
        .hero-top {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: stretch;
          flex-wrap: wrap;
        }
        .hero h1 {
          margin: 8px 0 10px;
          font-size: clamp(2rem, 4vw, 4rem);
          line-height: 0.95;
        }
        .hero p {
          margin: 0;
          max-width: 70ch;
          color: var(--muted);
          font-size: 1rem;
        }
        .eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.18em;
          font-size: 0.72rem;
          color: var(--accent);
        }
        .toc {
          position: fixed;
          top: 16px;
          right: 16px;
          z-index: 20;
        }
        .toc details {
          border: 1px solid var(--line);
          border-radius: 18px;
          background: rgba(255, 248, 236, 0.95);
          box-shadow: var(--shadow);
          overflow: hidden;
          min-width: 220px;
        }
        .toc summary {
          list-style: none;
          cursor: pointer;
          padding: 12px 14px;
          font: inherit;
          display: flex;
          align-items: center;
          gap: 10px;
          user-select: none;
        }
        .toc summary::-webkit-details-marker { display: none; }
        .burger {
          display: inline-grid;
          gap: 3px;
        }
        .burger span {
          width: 18px;
          height: 2px;
          background: var(--text);
          display: block;
          border-radius: 999px;
        }
        .toc nav {
          border-top: 1px solid var(--line);
          padding: 8px;
          display: grid;
          gap: 4px;
          max-height: 70vh;
          overflow: auto;
        }
        .toc nav a {
          text-decoration: none;
          color: var(--text);
          padding: 9px 10px;
          border-radius: 12px;
        }
        .toc nav a:hover {
          background: rgba(0,0,0,0.05);
        }
        .stats-grid,
        .table-grid,
        .dual-grid,
        .leader-grid,
        .callout-grid {
          display: grid;
          gap: 18px;
          margin-top: 22px;
        }
        .stats-grid { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
        .table-grid, .dual-grid, .leader-grid, .callout-grid { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
        .panel, .stat-card, .subpanel {
          border: 1px solid var(--line);
          border-radius: 22px;
          background: var(--panel);
          box-shadow: var(--shadow);
        }
        .stat-card {
          padding: 18px;
          min-height: 156px;
        }
        .stat-card-top,
        .section-hook-head,
        .hook-modal-head,
        .hook-modal-actions,
        .hook-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .stat-card strong {
          display: block;
          font-size: 2rem;
          margin-top: 10px;
        }
        .stat-card p, .subpanel p, .panel p, li {
          color: var(--muted);
        }
        .panel {
          margin-top: 22px;
          padding: 22px;
        }
        .section-head {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }
        h2, h3 {
          margin: 0;
        }
        h2 { font-size: 1.4rem; }
        h3 { font-size: 1.02rem; }
        .chip {
          display: inline-flex;
          align-items: center;
          padding: 8px 12px;
          border-radius: 999px;
          background: var(--accent-soft);
          color: var(--text);
          font-size: 0.85rem;
        }
        .hero-status {
          min-width: 280px;
          display: grid;
          gap: 12px;
          align-content: start;
          padding: 16px 18px;
          border-radius: 18px;
          border: 1px solid var(--line);
          background: rgba(255, 248, 236, 0.92);
        }
        .hero-status-copy {
          display: grid;
          gap: 6px;
          color: var(--muted);
          font-size: 0.9rem;
        }
        .hero-status-copy strong {
          color: var(--text);
        }
        .refresh-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: fit-content;
          padding: 10px 14px;
          border-radius: 999px;
          border: 1px solid var(--line);
          background: var(--text);
          color: #fff7ef;
          text-decoration: none;
          font-weight: 600;
        }
        .review-grid { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
        .subpanel {
          padding: 18px;
          background: var(--panel-strong);
        }
        .narrative {
          background: linear-gradient(180deg, rgba(255,245,228,0.95), rgba(246,233,214,0.95));
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th, td {
          text-align: left;
          padding: 12px 10px;
          border-bottom: 1px solid var(--line);
          vertical-align: top;
        }
        th {
          font-size: 0.76rem;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--muted);
        }
        tr:last-child td { border-bottom: none; }
        .meta {
          display: block;
          margin-top: 4px;
          color: var(--muted);
          font-size: 0.84rem;
        }
        .hook-trigger,
        .hook-action,
        .hook-modal-close {
          border: 1px solid var(--line);
          border-radius: 999px;
          background: rgba(255, 248, 236, 0.96);
          color: var(--text);
          cursor: pointer;
          font: inherit;
        }
        .hook-trigger {
          width: 36px;
          height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          flex: 0 0 auto;
        }
        .hook-trigger svg {
          width: 18px;
          height: 18px;
        }
        .hook-action,
        .hook-modal-close {
          padding: 8px 12px;
        }
        .hook-action.secondary {
          background: transparent;
        }
        .hook-col,
        .hook-cell {
          width: 72px;
          text-align: right;
        }
        .section-hook {
          margin-bottom: 18px;
          padding: 14px;
          border-radius: 18px;
          border: 1px solid var(--line);
          background: rgba(255, 248, 236, 0.9);
        }
        .section-hook-label {
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--muted);
        }
        .hook-textarea {
          width: 100%;
          min-height: 78px;
          margin-top: 10px;
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 12px 14px;
          font: inherit;
          color: var(--text);
          background: rgba(255,255,255,0.8);
          resize: vertical;
        }
        .hook-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 12px;
        }
        .hook-list li {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 14px;
          border-radius: 16px;
          border: 1px solid var(--line);
          background: var(--panel-strong);
        }
        .hook-list p {
          margin: 0;
        }
        .hook-modal[hidden] {
          display: none;
        }
        .hook-modal {
          position: fixed;
          inset: 0;
          z-index: 40;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(34, 23, 15, 0.35);
        }
        .hook-modal-card {
          width: min(680px, 100%);
          border-radius: 24px;
          border: 1px solid var(--line);
          background: #fff8ec;
          box-shadow: var(--shadow);
          padding: 22px;
        }
        .hook-modal-title {
          margin: 0;
          font-size: 1.25rem;
        }
        .hook-modal-label {
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--muted);
        }
        .hook-modal textarea {
          width: 100%;
          min-height: 180px;
          margin-top: 16px;
          margin-bottom: 16px;
          padding: 14px 16px;
          border-radius: 16px;
          border: 1px solid var(--line);
          font: inherit;
          color: var(--text);
          background: #fffdf8;
          resize: vertical;
        }
        .muted, .empty {
          color: var(--muted);
        }
        .empty {
          padding: 16px 0 4px;
        }
        .footer-note {
          margin-top: 26px;
          color: var(--muted);
          font-size: 0.9rem;
        }
        @media (max-width: 720px) {
          .shell { padding: 20px 14px 40px; }
          .hero, .panel { padding: 18px; }
          th:nth-child(4), td:nth-child(4), th:nth-child(5), td:nth-child(5) { display: none; }
          .hook-col, .hook-cell { width: 52px; }
          .section-hook-head, .hook-modal-head, .hook-modal-actions { align-items: flex-start; flex-direction: column; }
        }
      </style>
    </head>
    <body>
      <aside class="toc">
        <details>
          <summary><span class="burger"><span></span><span></span><span></span></span>Contents</summary>
          <nav>
            ${tocLinks.map(([id, label]) => `<a href="#${id}">${escapeHtml(label)}</a>`).join("")}
          </nav>
        </details>
      </aside>
      <main class="shell">
        <header class="hero" id="overview">
          <div class="hero-top">
            <div>
              <span class="eyebrow">Internal marketing dashboard</span>
              <h1>Referral momentum at a glance</h1>
              <p>Volume-first view of streaks, movers, review summaries, projected ZEC shifts, and pre-launch cabal protection.</p>
            </div>
            <div class="hero-status">
              <span class="chip">Verified signups only</span>
              <div class="hero-status-copy">
                <div><strong>Last updated UTC:</strong> ${escapeHtml(formattedTimestamps.utc)}</div>
                <div><strong>US Eastern:</strong> ${escapeHtml(formattedTimestamps.eastern)}</div>
              </div>
              <a class="refresh-link" href="/dashboard?refresh=1">Refresh</a>
            </div>
          </div>
          ${renderSectionHookComposer(sections.overview.section)}
          <div class="stats-grid">
            ${renderStatCard("Waitlist", formatNumber(snapshot.headlineKpis.waitlist), "Total signups currently tracked.", sections.overview.items[0])}
            ${renderStatCard("Referred", formatNumber(snapshot.headlineKpis.referred), `${formatPercent(snapshot.headlineKpis.referredSharePct)} of the waitlist came through a referral.`, sections.overview.items[1])}
            ${renderStatCard("Rewards Pot", formatZec(snapshot.headlineKpis.rewardsPot), "Projected fixed-model rewards pot based on attributed referrals.", sections.overview.items[2])}
            ${renderStatCard("All-Time Leader", renderLeader(snapshot.headlineKpis.allTimeLeader), "Current leader by attributed referral volume.", sections.overview.items[3])}
            ${renderStatCard("Daily Leader", renderLeader(snapshot.headlineKpis.dailyLeader), "Top referrer in the current UTC day.", sections.overview.items[4])}
            ${renderStatCard("Weekly Leader", renderLeader(snapshot.headlineKpis.weeklyLeader), "Top referrer in the current Monday-Sunday UTC week.", sections.overview.items[5])}
          </div>
        </header>

        <section class="panel" id="streaks">
          <div class="section-head">
            <div>
              <span class="eyebrow">Referral streaks</span>
              <h2>${escapeHtml(snapshot.streaks.currentLeader?.name ?? "No active streak leader")}</h2>
            </div>
            <span class="chip">${formatNumber(snapshot.streaks.streakLength)} day streak</span>
          </div>
          ${renderSectionHookComposer(sections.streaks.section)}
          ${renderRowsTable(["Date", "Leader", "Referrals"], streakRows, "No recent daily winners yet.")}
        </section>

        <div class="table-grid">
          <section class="panel" id="newcomers">
            <div class="section-head">
              <div>
                <span class="eyebrow">Top newcomers</span>
                <h2>First attributed referral in the last 7 days</h2>
              </div>
            </div>
            ${renderSectionHookComposer(sections.newcomers.section)}
            ${renderRowsTable(["Referrer", "First Seen", "7D Attributed", "All-Time", "Rank"], newcomerRows, "No newcomers in the current 7-day window.")}
          </section>
          <section class="panel" id="movers">
            <div class="section-head">
              <div>
                <span class="eyebrow">Top movers</span>
                <h2>Biggest 7-day gains versus prior 7 days</h2>
              </div>
            </div>
            ${renderSectionHookComposer(sections.movers.section)}
            ${renderRowsTable(["Referrer", "Gain", "Current 7D", "Previous 7D", "Rank"], moverRows, "No positive movers yet.")}
          </section>
        </div>

        <div id="daily-review">${renderReviewBlock("Daily review", snapshot.dailyReview, sections["daily-review"].section)}</div>
        <div id="weekly-review">${renderReviewBlock("Weekly review", snapshot.weeklyReview, sections["weekly-review"].section)}</div>

        <div class="leader-grid">
          <section class="panel" id="leader-changes">
            <div class="section-head">
              <div>
                <span class="eyebrow">Leader changes</span>
                <h2>All-time, daily, weekly</h2>
              </div>
            </div>
            ${renderSectionHookComposer(sections["leader-changes"].section)}
            <div class="review-grid">
              <article class="subpanel">
                <h3>All-time</h3>
                <p>Current: ${escapeHtml(snapshot.leaderChanges.allTime.current?.name ?? "None")}</p>
                <p>Previous: ${escapeHtml(snapshot.leaderChanges.allTime.previous?.name ?? "None")}</p>
                <p>Changed: ${snapshot.leaderChanges.allTime.changed ? "Yes" : "No"}</p>
                <p>${escapeHtml(snapshot.leaderChanges.allTime.comparisonWindow)}</p>
              </article>
              <article class="subpanel">
                <h3>Daily</h3>
                <p>Current: ${escapeHtml(snapshot.leaderChanges.daily.current?.name ?? "None")}</p>
                <p>Previous: ${escapeHtml(snapshot.leaderChanges.daily.previous?.name ?? "None")}</p>
                <p>Changed: ${snapshot.leaderChanges.daily.changed ? "Yes" : "No"}</p>
                <p>${escapeHtml(snapshot.leaderChanges.daily.comparisonWindow)}</p>
              </article>
              <article class="subpanel">
                <h3>Weekly</h3>
                <p>Current: ${escapeHtml(snapshot.leaderChanges.weekly.current?.name ?? "None")}</p>
                <p>Previous: ${escapeHtml(snapshot.leaderChanges.weekly.previous?.name ?? "None")}</p>
                <p>Changed: ${snapshot.leaderChanges.weekly.changed ? "Yes" : "No"}</p>
                <p>${escapeHtml(snapshot.leaderChanges.weekly.comparisonWindow)}</p>
              </article>
            </div>
          </section>
          <section class="panel" id="zec-changes">
            <div class="section-head">
              <div>
                <span class="eyebrow">ZEC earned changes</span>
                <h2>Projected payout delta leaders</h2>
              </div>
            </div>
            ${renderSectionHookComposer(sections["zec-changes"].section)}
            <div class="dual-grid">
              <div>
                <h3>Daily delta</h3>
                ${renderRowsTable(["Referrer", "Delta", "Current", "Previous"], zecDailyRows, "No positive daily payout deltas.")}
              </div>
              <div>
                <h3>Weekly delta</h3>
                ${renderRowsTable(["Referrer", "Delta", "Current", "Previous"], zecWeeklyRows, "No positive weekly payout deltas.")}
              </div>
            </div>
          </section>
        </div>

        <section class="panel" id="cabal-protection">
          <div class="section-head">
            <div>
              <span class="eyebrow">Cabal protection</span>
              <h2>Commission rate protection versus fixed rate</h2>
            </div>
            <span class="chip">Internal only</span>
          </div>
          ${renderSectionHookComposer(sections["cabal-protection"].section)}
          ${renderRowsTable(["Member", "Fixed", "Commission", "Protected Delta", "Rate"], cabalRows, "No cabal members found in the current data set.")}
        </section>

        <div class="callout-grid">
          <section class="panel" id="shareworthy">
            <div class="section-head">
              <div>
                <span class="eyebrow">Shareworthy callouts</span>
                <h2>Auto-generated marketing hooks</h2>
              </div>
            </div>
            ${renderSectionHookComposer(sections.shareworthy.section)}
            <ul class="hook-list">
              ${snapshot.shareworthyCallouts
                .map(
                  (item) => `<li><p>${escapeHtml(item.defaultText)}</p>${renderHookTrigger(item)}</li>`,
                )
                .join("")}
            </ul>
          </section>
          <section class="panel" id="funnel">
            <div class="section-head">
              <div>
                <span class="eyebrow">Referral funnel</span>
                <h2>Conversion composition</h2>
              </div>
            </div>
            ${renderSectionHookComposer(sections.funnel.section)}
            <div class="stats-grid">
              ${renderStatCard("Referred", formatNumber(snapshot.funnel.referred), `${formatPercent(snapshot.funnel.referredSharePct)} of all signups.`, sections.funnel.items[0])}
              ${renderStatCard("Non-referred", formatNumber(snapshot.funnel.nonReferred), `${formatPercent(snapshot.funnel.nonReferredSharePct)} of all signups.`, sections.funnel.items[1])}
              ${renderStatCard("Waitlist", formatNumber(snapshot.funnel.waitlist), "Total verified signups tracked in this dashboard.", sections.funnel.items[2])}
            </div>
          </section>
        </div>

        <p class="footer-note">Route: <code>/dashboard</code>. Refresh with <code>?refresh=1</code>. Time basis: UTC and US Eastern.</p>
      </main>
      <div class="hook-modal" id="hook-modal" hidden>
        <div class="hook-modal-card" role="dialog" aria-modal="true" aria-labelledby="hook-modal-title">
          <div class="hook-modal-head">
            <div>
              <div class="hook-modal-label" id="hook-modal-label">Hook</div>
              <h2 class="hook-modal-title" id="hook-modal-title">Marketing hook</h2>
            </div>
            <button class="hook-modal-close" type="button" data-hook-close>Close</button>
          </div>
          <textarea id="hook-modal-textarea"></textarea>
          <div class="hook-modal-actions">
            <div class="hook-actions">
              <button class="hook-action" type="button" id="hook-modal-copy">Copy</button>
              <button class="hook-action secondary" type="button" id="hook-modal-reset">Reset</button>
            </div>
          </div>
        </div>
      </div>
      <script id="dashboard-hook-data" type="application/json">${serializeForScript(hooksPayload)}</script>
      <script>
        (() => {
          const storagePrefix = "dashboard-hook:";
          const raw = document.getElementById("dashboard-hook-data")?.textContent || "{}";
          const hooks = JSON.parse(raw);
          const modal = document.getElementById("hook-modal");
          const modalTitle = document.getElementById("hook-modal-title");
          const modalLabel = document.getElementById("hook-modal-label");
          const modalTextarea = document.getElementById("hook-modal-textarea");
          const modalCopy = document.getElementById("hook-modal-copy");
          const modalReset = document.getElementById("hook-modal-reset");
          const closeButtons = document.querySelectorAll("[data-hook-close]");
          let activeHookId = null;

          const getStorageKey = (hookId) => storagePrefix + hookId;
          const getDefaultText = (hookId) => hooks[hookId]?.defaultText || "";
          const getText = (hookId) => window.localStorage.getItem(getStorageKey(hookId)) ?? getDefaultText(hookId);
          const setText = (hookId, value) => window.localStorage.setItem(getStorageKey(hookId), value);
          const resetText = (hookId) => window.localStorage.removeItem(getStorageKey(hookId));

          const copyText = async (textarea) => {
            const value = textarea.value;
            try {
              if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(value);
                return;
              }
            } catch {}

            textarea.focus();
            textarea.select();
            try {
              document.execCommand("copy");
            } catch {}
          };

          document.querySelectorAll("[data-hook-input]").forEach((node) => {
            const hookId = node.getAttribute("data-hook-input");
            if (!hookId || !hooks[hookId]) return;
            node.value = getText(hookId);
            node.addEventListener("input", () => setText(hookId, node.value));
          });

          document.querySelectorAll("[data-hook-copy]").forEach((button) => {
            button.addEventListener("click", () => {
              const hookId = button.getAttribute("data-hook-copy");
              if (!hookId) return;
              const input = document.querySelector('[data-hook-input="' + hookId + '"]');
              if (!(input instanceof HTMLTextAreaElement)) return;
              copyText(input);
            });
          });

          document.querySelectorAll("[data-hook-reset]").forEach((button) => {
            button.addEventListener("click", () => {
              const hookId = button.getAttribute("data-hook-reset");
              if (!hookId) return;
              resetText(hookId);
              const input = document.querySelector('[data-hook-input="' + hookId + '"]');
              if (input instanceof HTMLTextAreaElement) {
                input.value = getDefaultText(hookId);
              }
            });
          });

          document.querySelectorAll("[data-hook-trigger]").forEach((button) => {
            button.addEventListener("click", () => {
              const hookId = button.getAttribute("data-hook-trigger");
              const hook = hookId ? hooks[hookId] : null;
              if (!hook || !(modalTextarea instanceof HTMLTextAreaElement) || !modal || !modalTitle || !modalLabel) return;
              activeHookId = hookId;
              modalTitle.textContent = "Marketing hook";
              modalLabel.textContent = hook.label;
              modalTextarea.value = getText(hookId);
              modal.hidden = false;
              modalTextarea.focus();
            });
          });

          if (modalTextarea instanceof HTMLTextAreaElement) {
            modalTextarea.addEventListener("input", () => {
              if (!activeHookId) return;
              setText(activeHookId, modalTextarea.value);
            });
          }

          modalCopy?.addEventListener("click", () => {
            if (modalTextarea instanceof HTMLTextAreaElement) {
              copyText(modalTextarea);
            }
          });

          modalReset?.addEventListener("click", () => {
            if (!activeHookId || !(modalTextarea instanceof HTMLTextAreaElement)) return;
            resetText(activeHookId);
            modalTextarea.value = getDefaultText(activeHookId);
          });

          closeButtons.forEach((button) => {
            button.addEventListener("click", () => {
              if (modal) modal.hidden = true;
              activeHookId = null;
            });
          });

          modal?.addEventListener("click", (event) => {
            if (event.target === modal) {
              modal.hidden = true;
              activeHookId = null;
            }
          });

          window.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && modal && !modal.hidden) {
              modal.hidden = true;
              activeHookId = null;
            }
          });
        })();
      </script>
    </body>
  </html>`;
}

function parseScope(_requestUrl: string | undefined, _defaultScope: ReferralScope): ReferralScope {
  return "confirmed";
}

function shouldRefresh(requestUrl: string | undefined): boolean {
  if (!requestUrl) return false;
  const value = new URL(requestUrl, "http://localhost").searchParams.get("refresh");
  return value === "1" || value === "true";
}

async function defaultLoadRows(): Promise<WaitlistReferralRow[]> {
  const db = createDbClient();
  const rawRows = await fetchAllWaitlistRows(db, { onlyVerified: true });
  return toWaitlistReferralRows(rawRows);
}

export async function renderMarketingDashboardHtml(
  rows: WaitlistReferralRow[],
  scope: ReferralScope = "confirmed",
  now = new Date(),
): Promise<string> {
  return renderDocument(buildMarketingDashboardSnapshot(rows, scope, now));
}

export function createMarketingDashboardServer(options: MarketingDashboardServerOptions = {}): Server {
  const loadRows = options.loadRows ?? defaultLoadRows;
  const now = options.now ?? (() => new Date());
  const defaultScope = options.defaultScope ?? "confirmed";
  const cache = new Map<ReferralScope, CachedDashboard>();

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (url.pathname === "/") {
        res.statusCode = 302;
        res.setHeader("location", "/dashboard");
        res.end();
        return;
      }

      if (url.pathname !== "/dashboard") {
        res.statusCode = 404;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end("Not found");
        return;
      }

      const scope = parseScope(req.url, defaultScope);
      const refresh = shouldRefresh(req.url);
      const cached = cache.get(scope);
      const currentTime = now().getTime();

      if (!refresh && cached && currentTime - cached.generatedAt < DASHBOARD_CACHE_TTL_MS) {
        res.statusCode = 200;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(cached.html);
        return;
      }

      const rows = await loadRows();
      const html = await renderMarketingDashboardHtml(rows, scope, new Date(currentTime));
      cache.set(scope, { html, generatedAt: currentTime });
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(html);
    } catch (error) {
      console.error("[marketing-dashboard] render failed:", error);
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : JSON.stringify(error);
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end(`Failed to render dashboard: ${message}`);
    }
  });
}

export async function startMarketingDashboardServer(
  options: MarketingDashboardServerOptions & { port?: number } = {},
): Promise<Server> {
  const port = options.port ?? Number(process.env.PORT || 3000);
  const server = createMarketingDashboardServer(options);

  await new Promise<void>((resolve) => {
    server.listen(port, resolve);
  });

  return server;
}
