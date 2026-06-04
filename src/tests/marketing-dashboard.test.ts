import test from "node:test";
import assert from "node:assert/strict";
import { buildMarketingDashboardSnapshot } from "../lib/leaders/shareworthy-stats.js";
import type { WaitlistReferralRow } from "../lib/leaders/referral-dashboard.js";
import { createMarketingDashboardServer } from "../server.js";

const NOW = new Date("2026-05-17T12:00:00.000Z");

test("buildMarketingDashboardSnapshot ranks newcomers by first attributed referral in the last 7 days", () => {
  const snapshot = buildMarketingDashboardSnapshot(fixtureRows(), "all", NOW);

  assert.deepEqual(
    snapshot.newcomers.map((entry) => entry.canonicalReferralCode),
    ["delta", "epsilon"],
  );
  assert.equal(snapshot.newcomers[0]?.current7DayAttributedReferrals, 3);
  assert.equal(snapshot.newcomers[0]?.firstAttributedReferralAt, "2026-05-12T09:00:00.000Z");
});

test("buildMarketingDashboardSnapshot ranks movers by 7-day attributed gain with deterministic ties", () => {
  const snapshot = buildMarketingDashboardSnapshot(fixtureRows(), "all", NOW);

  assert.deepEqual(
    snapshot.movers.map((entry) => entry.canonicalReferralCode),
    ["beta", "alpha", "delta", "epsilon"],
  );
  assert.equal(snapshot.movers[0]?.gain, 4);
  assert.equal(snapshot.movers[1]?.gain, 3);
});

test("buildMarketingDashboardSnapshot includes current and previous leader identities", () => {
  const snapshot = buildMarketingDashboardSnapshot(fixtureRows(), "all", NOW);

  assert.equal(snapshot.leaderChanges.allTime.current?.canonicalReferralCode, "beta");
  assert.equal(snapshot.leaderChanges.allTime.previous?.canonicalReferralCode, "alpha");
  assert.equal(snapshot.leaderChanges.daily.current?.canonicalReferralCode, "beta");
  assert.equal(snapshot.leaderChanges.daily.previous?.canonicalReferralCode, "alpha");
  assert.equal(snapshot.leaderChanges.weekly.current?.canonicalReferralCode, "beta");
  assert.equal(snapshot.leaderChanges.weekly.previous?.canonicalReferralCode, "gamma");
});

test("buildMarketingDashboardSnapshot computes positive daily and weekly zec deltas", () => {
  const snapshot = buildMarketingDashboardSnapshot(fixtureRows(), "all", NOW);

  assert.equal(snapshot.zecChanges.daily[0]?.canonicalReferralCode, "beta");
  assert.equal(snapshot.zecChanges.daily[0]?.delta, 0.15);
  assert.equal(snapshot.zecChanges.weekly[0]?.canonicalReferralCode, "beta");
  assert.ok((snapshot.zecChanges.weekly[0]?.delta ?? 0) > 0);
});

test("buildMarketingDashboardSnapshot builds daily and weekly review blocks with narrative summaries", () => {
  const snapshot = buildMarketingDashboardSnapshot(fixtureRows(), "all", NOW);

  assert.equal(snapshot.dailyReview.winnerWhy.leader?.canonicalReferralCode, "beta");
  assert.equal(snapshot.dailyReview.winnerWhy.runnerUp?.canonicalReferralCode, "alpha");
  assert.equal(snapshot.dailyReview.campaignHealth.totalReferrals, 5);
  assert.match(snapshot.dailyReview.narrativeSummary, /beta/i);

  assert.equal(snapshot.weeklyReview.winnerWhy.leader?.canonicalReferralCode, "beta");
  assert.equal(snapshot.weeklyReview.campaignHealth.totalReferrals, 13);
  assert.match(snapshot.weeklyReview.narrativeSummary, /2026-05-11 to 2026-05-17/);
});

test("buildMarketingDashboardSnapshot includes named cabal protection payout comparisons", () => {
  const snapshot = buildMarketingDashboardSnapshot(fixtureRows(), "all", NOW);

  assert.equal(snapshot.cabalProtection[0]?.canonicalReferralCode, "alpha");
  assert.equal(snapshot.cabalProtection[0]?.name, "Alpha");
  assert.ok((snapshot.cabalProtection[0]?.commissionPayout ?? 0) > (snapshot.cabalProtection[0]?.fixedPayout ?? 0));
  assert.ok((snapshot.cabalProtection[0]?.protectedDelta ?? 0) > 0);
});

test("buildMarketingDashboardSnapshot exposes deterministic section and item hooks", () => {
  const snapshot = buildMarketingDashboardSnapshot(fixtureRows(), "all", NOW);

  assert.deepEqual(Object.keys(snapshot.marketingHooks.sections), [
    "overview",
    "streaks",
    "newcomers",
    "movers",
    "daily-review",
    "weekly-review",
    "leader-changes",
    "zec-changes",
    "cabal-protection",
    "shareworthy",
    "funnel",
  ]);
  assert.equal(snapshot.marketingHooks.sections.overview.section.id, "section:overview");
  assert.equal(snapshot.marketingHooks.sections.overview.items[0]?.id, "overview:waitlist");
  assert.equal(snapshot.marketingHooks.sections.newcomers.items[0]?.id, "newcomers:delta");
  assert.equal(snapshot.marketingHooks.sections.movers.items[0]?.id, "movers:beta");
  assert.equal(snapshot.marketingHooks.sections["zec-changes"].items[0]?.id, "zec-daily:beta");
  assert.equal(snapshot.marketingHooks.sections["cabal-protection"].items[0]?.id, "cabal:alpha");
  assert.ok(snapshot.marketingHooks.sections.shareworthy.items.every((hook) => hook.defaultText.length > 0));
  assert.ok(snapshot.marketingHooks.sections.funnel.section.defaultText.length > 0);
});

test("createMarketingDashboardServer renders html from fixture rows", async () => {
  const server = createMarketingDashboardServer({
    loadRows: async () => fixtureRows(),
    now: () => NOW,
  });

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/dashboard`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /Referral marketing dashboard/i);
    assert.match(html, /Top newcomers/i);
    assert.match(html, /Cabal protection/i);
    assert.match(html, /Last updated UTC:/i);
    assert.match(html, /US Eastern:/i);
    assert.match(html, /May 17, 2026, 12:00:00 UTC/i);
    assert.match(html, /May 17, 2026, 08:00:00 EDT/i);
    assert.match(html, /href="\/dashboard\?refresh=1"/i);
    assert.doesNotMatch(html, /<th[^>]*>\s*Badge\s*<\/th>/i);
    assert.match(html, /data-hook-trigger="overview:waitlist"/i);
    assert.match(html, /data-hook-editor="section:overview"/i);
    assert.match(html, /id="hook-modal"/i);
    assert.match(html, /id="dashboard-hook-data"/i);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});

test("home page redirects directly to dashboard", async () => {
  const server = createMarketingDashboardServer({
    loadRows: async () => fixtureRows(),
    now: () => NOW,
  });

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const homeResponse = await fetch(`http://127.0.0.1:${address.port}/`, {
      redirect: "manual",
    });

    assert.equal(homeResponse.status, 302);
    assert.equal(homeResponse.headers.get("location"), "/dashboard");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});

function fixtureRows(): WaitlistReferralRow[] {
  return [
    owner("Alpha", "alpha", "2026-05-01", { cabal: true, human_referral_code: "alice" }),
    owner("Beta", "beta", "2026-05-01"),
    owner("Gamma", "gamma", "2026-05-01"),
    owner("Delta", "delta", "2026-05-10"),
    owner("Epsilon", "epsilon", "2026-05-15"),
    referral("Bprev1", "bprev1", "beta", "2026-05-08T08:00:00.000Z"),
    referral("Gprev1", "gprev1", "gamma", "2026-05-09T08:00:00.000Z"),
    referral("Gprev2", "gprev2", "gamma", "2026-05-10T08:00:00.000Z"),
    referral("Aprev", "aprev", "alpha", "2026-05-10T09:00:00.000Z"),
    referral("D1", "d1", "delta", "2026-05-12T09:00:00.000Z"),
    referral("D2", "d2", "delta", "2026-05-13T09:00:00.000Z"),
    referral("A1", "a1", "alpha", "2026-05-14T08:00:00.000Z"),
    referral("A2", "a2", "alpha", "2026-05-15T08:00:00.000Z"),
    referral("B1", "b1", "beta", "2026-05-15T12:00:00.000Z"),
    referral("A3", "a3", "alpha", "2026-05-16T08:00:00.000Z"),
    referral("D3", "d3", "delta", "2026-05-16T12:00:00.000Z"),
    referral("B2", "b2", "beta", "2026-05-16T15:00:00.000Z"),
    referral("E1", "e1", "epsilon", "2026-05-17T08:00:00.000Z"),
    referral("A4", "a4", "alpha", "2026-05-17T09:00:00.000Z"),
    referral("B3", "b3", "beta", "2026-05-17T10:00:00.000Z"),
    referral("B4", "b4", "beta", "2026-05-17T11:00:00.000Z"),
    referral("B5", "b5", "beta", "2026-05-17T11:30:00.000Z"),
  ];
}

function owner(
  name: string,
  referral_code: string,
  date: string,
  options: { cabal?: boolean; human_referral_code?: string } = {},
): WaitlistReferralRow {
  return {
    name,
    referral_code,
    human_referral_code: options.human_referral_code ?? null,
    preferred_referral_code: options.human_referral_code ?? referral_code,
    referred_by: null,
    email_verified: true,
    cabal: Boolean(options.cabal),
    created_at: `${date}T00:00:00.000Z`,
  };
}

function referral(name: string, referral_code: string, referred_by: string, created_at: string): WaitlistReferralRow {
  return {
    name,
    referral_code,
    human_referral_code: null,
    preferred_referral_code: referral_code,
    referred_by,
    email_verified: true,
    cabal: false,
    created_at,
  };
}
