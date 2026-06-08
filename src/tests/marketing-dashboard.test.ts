import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMarketingDashboardSnapshot,
  buildReferralTreeWindowCounts,
} from "../lib/leaders/shareworthy-stats.js";
import type { WaitlistReferralRow } from "../lib/leaders/referral-dashboard.js";
import { createMarketingDashboardServer } from "../server.js";

const NOW = new Date("2026-05-17T12:00:00.000Z");

test("buildMarketingDashboardSnapshot ranks newcomers by first attributed referral in the last 7 days", () => {
  const snapshot = buildMarketingDashboardSnapshot(fixtureRows(), "all", NOW);

  assert.deepEqual(
    snapshot.newcomers.map((entry) => entry.canonicalReferralCode),
    ["delta", "a1", "b1", "a1c", "b1c"],
  );
  assert.equal(snapshot.newcomers[0]?.current7DayAttributedReferrals, 4);
  assert.equal(snapshot.newcomers[0]?.firstAttributedReferralAt, "2026-05-12T09:00:00.000Z");
});

test("buildMarketingDashboardSnapshot ranks movers by 7-day attributed gain with deterministic ties", () => {
  const snapshot = buildMarketingDashboardSnapshot(fixtureRows(), "all", NOW);

  assert.deepEqual(
    snapshot.movers.map((entry) => entry.canonicalReferralCode),
    ["beta", "alpha", "delta", "a1", "b1"],
  );
  assert.equal(snapshot.movers[0]?.gain, 6);
  assert.equal(snapshot.movers[1]?.gain, 5);
});

test("buildReferralTreeWindowCounts tracks direct and indirect buckets by depth", () => {
  const counts = buildReferralTreeWindowCounts(
    fixtureRows(),
    "all",
    NOW.getTime() - 7 * 24 * 60 * 60 * 1000,
    NOW.getTime() + 1,
  );

  assert.deepEqual(counts.get("beta"), {
    directReferrals: 5,
    secondOrderReferrals: 1,
    thirdOrderReferrals: 1,
    fourthPlusReferrals: 0,
    indirectReferrals: 2,
    attributedReferrals: 7,
  });
  assert.deepEqual(counts.get("alpha"), {
    directReferrals: 4,
    secondOrderReferrals: 1,
    thirdOrderReferrals: 1,
    fourthPlusReferrals: 0,
    indirectReferrals: 2,
    attributedReferrals: 6,
  });
});

test("buildReferralTreeWindowCounts preserves confirmed filtering and cycle protection", () => {
  const rows: WaitlistReferralRow[] = [
    owner("Root", "root", "2026-05-01"),
    referral("Direct", "direct", "root", "2026-05-15T08:00:00.000Z"),
    {
      ...referral("Unverified", "unverified", "direct", "2026-05-15T09:00:00.000Z"),
      email_verified: false,
    },
    referral("Leaf", "leaf", "unverified", "2026-05-15T10:00:00.000Z"),
    referral("Cycle A", "cycle-a", "cycle-b", "2026-05-15T11:00:00.000Z"),
    referral("Cycle B", "cycle-b", "cycle-a", "2026-05-15T12:00:00.000Z"),
  ];

  const confirmed = buildReferralTreeWindowCounts(rows, "confirmed", NOW.getTime() - 7 * 24 * 60 * 60 * 1000, NOW.getTime() + 1);
  const all = buildReferralTreeWindowCounts(rows, "all", NOW.getTime() - 7 * 24 * 60 * 60 * 1000, NOW.getTime() + 1);

  assert.deepEqual(confirmed.get("root"), {
    directReferrals: 1,
    secondOrderReferrals: 0,
    thirdOrderReferrals: 0,
    fourthPlusReferrals: 0,
    indirectReferrals: 0,
    attributedReferrals: 1,
  });
  assert.equal(all.get("root")?.secondOrderReferrals, 1);
  assert.equal(all.get("root")?.thirdOrderReferrals, 1);
  assert.equal(all.get("cycle-a")?.attributedReferrals, 2);
  assert.equal(all.get("cycle-b")?.attributedReferrals, 2);
});

test("buildMarketingDashboardSnapshot builds referral tree leaders and movers", () => {
  const snapshot = buildMarketingDashboardSnapshot(fixtureRows(), "all", NOW);

  assert.deepEqual(
    snapshot.referralTree.leaders.map((entry) => entry.canonicalReferralCode),
    ["beta", "alpha", "delta", "a1", "b1"],
  );
  assert.equal(snapshot.referralTree.leaders[0]?.indirectReferrals, 2);
  assert.equal(snapshot.referralTree.leaders[0]?.secondOrderReferrals, 1);
  assert.equal(snapshot.referralTree.leaders[0]?.thirdOrderReferrals, 1);

  assert.deepEqual(
    snapshot.referralTree.movers.map((entry) => entry.canonicalReferralCode),
    ["alpha", "beta", "a1", "b1", "delta"],
  );
  assert.equal(snapshot.referralTree.movers[0]?.gain, 2);
  assert.equal(snapshot.referralTree.movers[0]?.secondOrderDelta, 1);
  assert.equal(snapshot.referralTree.movers[0]?.thirdOrderDelta, 1);
});

test("buildMarketingDashboardSnapshot includes current and previous leader identities", () => {
  const snapshot = buildMarketingDashboardSnapshot(fixtureRows(), "all", NOW);

  assert.equal(snapshot.leaderChanges.allTime.current?.canonicalReferralCode, "beta");
  assert.equal(snapshot.leaderChanges.allTime.previous?.canonicalReferralCode, "alpha");
  assert.equal(snapshot.leaderChanges.daily.current?.canonicalReferralCode, "beta");
  assert.equal(snapshot.leaderChanges.daily.previous?.canonicalReferralCode, "a1");
  assert.equal(snapshot.leaderChanges.weekly.current?.canonicalReferralCode, "beta");
  assert.equal(snapshot.leaderChanges.weekly.previous?.canonicalReferralCode, "gamma");
});

test("buildMarketingDashboardSnapshot computes positive daily and weekly zec deltas", () => {
  const snapshot = buildMarketingDashboardSnapshot(fixtureRows(), "all", NOW);

  assert.equal(snapshot.zecChanges.daily[0]?.canonicalReferralCode, "beta");
  assert.equal(snapshot.zecChanges.daily[0]?.delta, 0.1875);
  assert.equal(snapshot.zecChanges.weekly[0]?.canonicalReferralCode, "beta");
  assert.ok((snapshot.zecChanges.weekly[0]?.delta ?? 0) > 0);
});

test("buildMarketingDashboardSnapshot builds daily and weekly review blocks with narrative summaries", () => {
  const snapshot = buildMarketingDashboardSnapshot(fixtureRows(), "all", NOW);

  assert.equal(snapshot.dailyReview.winnerWhy.leader?.canonicalReferralCode, "beta");
  assert.equal(snapshot.dailyReview.winnerWhy.runnerUp?.canonicalReferralCode, "a1c");
  assert.equal(snapshot.dailyReview.campaignHealth.totalReferrals, 8);
  assert.match(snapshot.dailyReview.narrativeSummary, /beta/i);

  assert.equal(snapshot.weeklyReview.winnerWhy.leader?.canonicalReferralCode, "beta");
  assert.equal(snapshot.weeklyReview.campaignHealth.totalReferrals, 18);
  assert.match(snapshot.weeklyReview.narrativeSummary, /2026-05-11 to 2026-05-17/);
});

test("buildMarketingDashboardSnapshot includes named cabal protection payout comparisons", () => {
  const snapshot = buildMarketingDashboardSnapshot(fixtureRows(), "all", NOW);

  assert.equal(snapshot.cabalProtection[0]?.canonicalReferralCode, "alpha");
  assert.equal(snapshot.cabalProtection[0]?.name, "Alpha");
  assert.ok((snapshot.cabalProtection[0]?.commissionPayout ?? 0) > (snapshot.cabalProtection[0]?.fixedPayout ?? 0));
  assert.ok((snapshot.cabalProtection[0]?.protectedDelta ?? 0) > 0);
  assert.doesNotMatch(
    snapshot.marketingHooks.sections["cabal-protection"].items[0]?.defaultText ?? "",
    /of protection under commission pricing/i,
  );
});

test("buildMarketingDashboardSnapshot exposes deterministic section and item hooks", () => {
  const snapshot = buildMarketingDashboardSnapshot(fixtureRows(), "all", NOW);

  assert.deepEqual(Object.keys(snapshot.marketingHooks.sections), [
    "overview",
    "streaks",
    "newcomers",
    "movers",
    "referral-tree",
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
  assert.match(snapshot.marketingHooks.sections.overview.items[4]?.defaultText ?? "", /Sunday's referrals/i);
  assert.equal(snapshot.marketingHooks.sections.streaks.items[0]?.label, "Sunday winner");
  assert.match(snapshot.marketingHooks.sections.streaks.items[0]?.defaultText ?? "", /most referrals that day/i);
  assert.equal(snapshot.marketingHooks.sections.newcomers.items[0]?.id, "newcomers:delta");
  assert.equal(snapshot.marketingHooks.sections.movers.items[0]?.id, "movers:beta");
  assert.equal(snapshot.marketingHooks.sections["referral-tree"].section.id, "section:referral-tree");
  assert.equal(snapshot.marketingHooks.sections["referral-tree"].items[0]?.id, "referral-tree:leader:beta");
  assert.equal(snapshot.marketingHooks.sections["referral-tree"].items.at(-1)?.id, "referral-tree:mover:delta");
  assert.match(snapshot.marketingHooks.sections["leader-changes"].items[1]?.defaultText ?? "", /daily leader on Sunday/i);
  assert.match(snapshot.marketingHooks.sections["zec-changes"].items[0]?.defaultText ?? "", /on Sunday/i);
  assert.equal(snapshot.marketingHooks.sections["leader-changes"].items[0]?.id, "leader-changes:all-time:beta");
  assert.equal(snapshot.marketingHooks.sections["zec-changes"].items[0]?.id, "zec-daily:beta");
  assert.equal(snapshot.marketingHooks.sections["cabal-protection"].items[0]?.id, "cabal:alpha");
  assert.doesNotMatch(snapshot.marketingHooks.sections.funnel.section.eli5Text ?? "", /plain-language explanation/i);
  assert.doesNotMatch(snapshot.marketingHooks.sections.funnel.section.eli5Text ?? "", /This is the plain-language explanation/i);
  assert.doesNotMatch(snapshot.marketingHooks.sections["leader-changes"].items[0]?.eli5Text ?? "", /ELI5:/i);
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
    assert.match(html, /Referral tree/i);
    assert.match(html, /Indirect leaders/i);
    assert.match(html, /Indirect movers/i);
    assert.match(html, /Cabal protection/i);
    assert.match(html, /Last updated UTC:/i);
    assert.match(html, /US Eastern:/i);
    assert.match(html, /May 17, 2026, 23:59:59 UTC/i);
    assert.match(html, /May 17, 2026, 19:59:59 EDT/i);
    assert.match(html, /href="\/dashboard\?refresh=1"/i);
    assert.match(html, /View dashboard as of date/i);
    assert.match(html, /id="dashboard-date-picker"/i);
    assert.match(html, /data-latest-href="\/dashboard"/i);
    assert.match(html, /data-date-href-prefix="\/dashboard\/"/i);
    assert.doesNotMatch(html, /<th[^>]*>\s*Badge\s*<\/th>/i);
    assert.match(html, /data-hook-trigger="overview:waitlist"/i);
    assert.match(html, /data-hook-trigger="referral-tree:leader:beta"/i);
    assert.match(html, /data-hook-trigger="leader-changes:all-time:beta"/i);
    assert.match(html, /data-hook-editor="section:overview"/i);
    assert.match(html, /data-hook-editor="section:referral-tree"/i);
    assert.match(html, /data-hook-more="section:overview"/i);
    assert.doesNotMatch(html, /data-hook-combine=/i);
    assert.doesNotMatch(html, /hook-modal-combine/i);
    assert.match(html, /id="hook-modal-more"/i);
    assert.match(html, /id="hook-modal"/i);
    assert.match(html, /id="dashboard-hook-data"/i);
    assert.match(html, /subpanel-highlight/i);
    assert.match(html, /class="stacked-panels"/i);
    assert.match(html, /dateHrefPrefix\.replace\(\/\\\/\+\$\/,\s*"\/"\)|dateHrefPrefix\.replace\(\/\/\+\$\/,\s*"\/"\)/i);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});

test("dated dashboard snapshots roll totals and streak dates back to the selected UTC day", async () => {
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

    const latestResponse = await fetch(`http://127.0.0.1:${address.port}/dashboard`);
    const latestHtml = await latestResponse.text();
    const datedResponse = await fetch(`http://127.0.0.1:${address.port}/dashboard/2026-05-16/`);
    const datedHtml = await datedResponse.text();

    assert.equal(latestResponse.status, 200);
    assert.equal(datedResponse.status, 200);
    assert.match(latestHtml, />27<\/strong>\s*<p>Total signups currently tracked\./i);
    assert.match(datedHtml, />19<\/strong>\s*<p>Total signups currently tracked\./i);
    assert.match(latestHtml, /<strong>Beta<\/strong><span class="meta">@beta<\/span><\/td>\s*<td>2<\/td>\s*<td>1<\/td>\s*<td>1<\/td>/i);
    assert.match(datedHtml, /<strong>Alpha<\/strong><span class="meta">@alice<\/span><\/td>\s*<td>1<\/td>\s*<td>1<\/td>\s*<td>0<\/td>/i);
    assert.match(latestHtml, /<td>\s*2026-05-17\s*<\/td>/i);
    assert.match(datedHtml, /<td>\s*2026-05-16\s*<\/td>/i);
    assert.doesNotMatch(datedHtml, /<td>\s*2026-05-17\s*<\/td>/i);
    assert.match(datedHtml, /value="2026-05-16"/i);
    assert.match(datedHtml, /May 16, 2026, 23:59:59 UTC/i);
    assert.match(datedHtml, /May 16, 2026, 19:59:59 EDT/i);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});

test("dashboard accepts the trailing-slash latest route", async () => {
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
    const response = await fetch(`http://127.0.0.1:${address.port}/dashboard/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /value="2026-05-17"/i);
    assert.match(html, /May 17, 2026, 23:59:59 UTC/i);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});

test("dashboard defaults to the latest available data date instead of the current clock date", async () => {
  const server = createMarketingDashboardServer({
    loadRows: async () => fixtureRows(),
    now: () => new Date("2026-05-20T12:00:00.000Z"),
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
    assert.match(html, /value="2026-05-17"/i);
    assert.match(html, /max="2026-05-17"/i);
    assert.match(html, />27<\/strong>\s*<p>Total signups currently tracked\./i);
    assert.match(html, /May 17, 2026, 23:59:59 UTC/i);
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
    referral("A1C", "a1c", "a1", "2026-05-16T09:00:00.000Z"),
    referral("D3", "d3", "delta", "2026-05-16T12:00:00.000Z"),
    referral("D2C", "d2c", "d2", "2026-05-16T13:00:00.000Z"),
    referral("B2", "b2", "beta", "2026-05-16T15:00:00.000Z"),
    referral("E1", "e1", "epsilon", "2026-05-17T08:00:00.000Z"),
    referral("A4", "a4", "alpha", "2026-05-17T09:00:00.000Z"),
    referral("A1GC", "a1gc", "a1c", "2026-05-17T09:30:00.000Z"),
    referral("B3", "b3", "beta", "2026-05-17T10:00:00.000Z"),
    referral("B4", "b4", "beta", "2026-05-17T11:00:00.000Z"),
    referral("B5", "b5", "beta", "2026-05-17T11:30:00.000Z"),
    referral("B1C", "b1c", "b1", "2026-05-17T11:45:00.000Z"),
    referral("B1GC", "b1gc", "b1c", "2026-05-17T11:50:00.000Z"),
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
