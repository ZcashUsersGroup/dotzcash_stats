import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLeaderboardFromRows,
  getLeadersDataFromRows,
  toWaitlistReferralRows,
} from "../lib/leaders/stats.js";
import { buildShareworthyStatsSnapshot } from "../lib/leaders/shareworthy-stats.js";
import type { WaitlistReferralRow } from "../lib/leaders/referral-dashboard.js";

test("toWaitlistReferralRows normalizes raw rows into waitlist referral rows", () => {
  const rows = toWaitlistReferralRows([
    {
      name: "Alice",
      referral_code: "abc12345",
      human_referral_code: "alice",
      referred_by: null,
      created_at: "2026-05-10T00:00:00.000Z",
      email_verified: 1,
      cabal: "yes",
    },
  ]);

  assert.deepEqual(rows, [
    {
      name: "Alice",
      referral_code: "abc12345",
      human_referral_code: "alice",
      preferred_referral_code: "alice",
      referred_by: null,
      created_at: "2026-05-10T00:00:00.000Z",
      email_verified: true,
      cabal: true,
    },
  ]);
});

test("getLeadersDataFromRows marks continuing daily winners with a red streak badge", () => {
  const rows = fixtureRows();
  const data = getLeadersDataFromRows(rows, "all", new Date("2026-05-17T12:00:00.000Z"));

  assert.equal(data.dailyRankings.at(-3)?.daily[0]?.canonical_referral_code, "alpha");
  assert.equal(data.dailyRankings.at(-2)?.daily[0]?.canonical_referral_code, "alpha");
  assert.equal(data.dailyRankings.at(-1)?.daily[0]?.canonical_referral_code, "alpha");
  assert.equal(data.dailyRankings.at(-3)?.topBadge, "blue");
  assert.equal(data.dailyRankings.at(-2)?.topBadge, "red");
  assert.equal(data.dailyRankings.at(-1)?.topBadge, "red");
});

test("buildLeaderboardFromRows exposes streak and recent-leader state", () => {
  const leaderboard = buildLeaderboardFromRows(
    fixtureRows(),
    "all",
    new Date("2026-05-17T12:00:00.000Z"),
  );

  assert.equal(leaderboard[0]?.canonical_referral_code, "alpha");
  assert.equal(leaderboard[0]?.streak, true);
  assert.equal(leaderboard.some((entry) => entry.topRecent), false);
});

test("buildShareworthyStatsSnapshot returns cabal protection comparisons", () => {
  const snapshot = buildShareworthyStatsSnapshot(fixtureRows(), "all", new Date("2026-05-17T12:00:00.000Z"));

  assert.equal(snapshot.streakLeader?.canonical_referral_code, "alpha");
  assert.equal(snapshot.dailyReview?.topDailyLeader, "Alpha");
  assert.equal(snapshot.cabalProtection[0]?.canonicalReferralCode, "alpha");
  assert.ok(snapshot.cabalProtection[0]?.commissionPayout > snapshot.cabalProtection[0]?.fixedPayout);
});

function fixtureRows(): WaitlistReferralRow[] {
  return [
    owner("Alpha", "alpha", "2026-05-01", true, "alice"),
    owner("Beta", "beta", "2026-05-01"),
    owner("Gamma", "gamma", "2026-05-01"),
    owner("Delta", "delta", "2026-05-10"),
    referral("A1", "a1", "alpha", "2026-05-15"),
    referral("A2", "a2", "alpha", "2026-05-16"),
    referral("A3", "a3", "alpha", "2026-05-17"),
    referral("A4", "a4", "alpha", "2026-05-17"),
    referral("B1", "b1", "beta", "2026-05-11"),
    referral("B2", "b2", "beta", "2026-05-12"),
    referral("G1", "g1", "gamma", "2026-05-13"),
    referral("D1", "d1", "delta", "2026-05-17"),
  ];
}

function owner(
  name: string,
  referral_code: string,
  date: string,
  cabal = false,
  human_referral_code?: string,
): WaitlistReferralRow {
  return {
    name,
    referral_code,
    human_referral_code: human_referral_code ?? null,
    preferred_referral_code: human_referral_code ?? referral_code,
    referred_by: null,
    email_verified: true,
    cabal,
    created_at: `${date}T00:00:00.000Z`,
  };
}

function referral(name: string, referral_code: string, referred_by: string, date: string): WaitlistReferralRow {
  return {
    name,
    referral_code,
    human_referral_code: null,
    preferred_referral_code: referral_code,
    referred_by,
    email_verified: true,
    cabal: false,
    created_at: `${date}T12:00:00.000Z`,
  };
}
