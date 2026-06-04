import type { SupabaseClient } from "@supabase/supabase-js";
import { getPreferredReferralCode } from "../referral-code-core.js";
import {
  buildFixedDepthReferralSummaries,
  buildReferralDashboard,
  type ReferralDashboardBaseData,
  type ReferralDashboardData,
  type ReferralScope,
  type WaitlistReferralRow,
} from "./referral-dashboard.js";
import {
  buildDailyRankingsFromRows,
  buildWeeklyRankingsFromRows,
  type DailyRow,
  type WeeklyRow,
} from "./rankings.js";

export interface TimeSeriesPoint {
  date: string;
  total: number;
  referred: number;
  nonReferred: number;
  rewardsPot: number;
  totalDelta?: number;
  referredDelta?: number;
  nonReferredDelta?: number;
  rewardsDelta?: number;
  topReferrer?: { name: string; count: number; streak: boolean; code?: string };
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  referral_code: string;
  canonical_referral_code: string;
  referrals: number;
  indirectReferrals: number;
  attributedReferrals: number;
  recent: number;
  recentGrowthPct: number;
  weeklyRecent: number;
  weeklyGrowthPct: number;
  potential_rewards: number;
  streak: boolean;
  topRecent: boolean;
}

export interface LeadersData {
  timeSeries: TimeSeriesPoint[];
  leaderboard: LeaderboardEntry[];
  dailyRankings: DailyRow[];
  weeklyRankings: WeeklyRow[];
  stats: { waitlist: number; referred: number; rewardsPot: number };
}

export interface DailyNewNameEntry {
  name: string;
  referral_code: string;
  referred_by: string | null;
  created_at: string;
  email_verified: boolean;
}

export interface RawWaitlistRow {
  name?: unknown;
  referral_code?: unknown;
  human_referral_code?: unknown;
  referred_by?: unknown;
  created_at?: unknown;
  email_verified?: unknown;
  cabal?: unknown;
}

const WAITLIST_PAGE_SIZE = 10000;
const DAY_MS = 24 * 60 * 60 * 1000;

function calculateGrowthPct(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : Number.POSITIVE_INFINITY;
  return Math.round(((current - previous) / previous) * 100);
}

export function toWaitlistReferralRows(data: RawWaitlistRow[]): WaitlistReferralRow[] {
  return data
    .map((row) => ({
      name: typeof row.name === "string" ? row.name : "",
      referral_code: typeof row.referral_code === "string" ? row.referral_code : "",
      human_referral_code: typeof row.human_referral_code === "string" ? row.human_referral_code : null,
      preferred_referral_code: getPreferredReferralCode({
        referral_code: typeof row.referral_code === "string" ? row.referral_code : "",
        human_referral_code: typeof row.human_referral_code === "string" ? row.human_referral_code : null,
      }),
      referred_by: typeof row.referred_by === "string" ? row.referred_by : null,
      created_at: typeof row.created_at === "string" ? row.created_at : "",
      email_verified: Boolean(row.email_verified),
      cabal: Boolean(row.cabal),
    }))
    .filter((row) => Boolean(row.referral_code) && Boolean(row.created_at));
}

function roundZec(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function resolveTopReferrer(
  dailyCounts: Record<string, number>,
  nameMap: Record<string, string>,
  previousTopCode: string | null,
): { name: string; count: number; streak: boolean; code: string } | undefined {
  const entries = Object.entries(dailyCounts);
  if (entries.length === 0) return undefined;
  entries.sort(([, a], [, b]) => b - a);
  const [code, count] = entries[0];
  return { name: nameMap[code] || code, count, streak: code === previousTopCode, code };
}

function isNextDay(previousDate: string, nextDate: string): boolean {
  const previous = new Date(`${previousDate}T00:00:00.000Z`).getTime();
  const next = new Date(`${nextDate}T00:00:00.000Z`).getTime();
  return next - previous === DAY_MS;
}

function buildPreferredCodeMap(rows: WaitlistReferralRow[]): Record<string, string> {
  const preferredCodeMap: Record<string, string> = {};

  for (const row of rows) {
    if (row.referral_code && !preferredCodeMap[row.referral_code]) {
      preferredCodeMap[row.referral_code] = row.preferred_referral_code ?? row.human_referral_code ?? row.referral_code;
    }
  }

  return preferredCodeMap;
}

function calculateRewardsPot(rows: WaitlistReferralRow[], scope: ReferralScope): number {
  const summaries = buildFixedDepthReferralSummaries(rows, scope);
  const rewardsPot = Array.from(summaries.values()).reduce(
    (total, summary) => total + (summary.directReferrals > 0 ? summary.potentialRewards : 0),
    0,
  );

  return roundZec(rewardsPot);
}

export async function fetchAllWaitlistRows(
  db: SupabaseClient,
  options: { onlyVerified?: boolean } = {},
  pageSize = WAITLIST_PAGE_SIZE,
): Promise<RawWaitlistRow[]> {
  const rows: RawWaitlistRow[] = [];
  let offset = 0;

  while (true) {
    let query = db
      .from("zn_waitlist")
      .select("name, referral_code, human_referral_code, referred_by, created_at, email_verified, cabal")
      .order("created_at", { ascending: true });

    if (options.onlyVerified) {
      query = query.eq("email_verified", true);
    }

    const { data, error } = await query.range(offset, offset + pageSize - 1);

    if (error || !data) {
      throw new Error(error?.message ?? "No data returned from zn_waitlist.");
    }

    rows.push(...(data as RawWaitlistRow[]));

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

export function getWaitlistStatsFromRows(
  rows: WaitlistReferralRow[],
  scope: ReferralScope = "all",
): { waitlist: number; referred: number; rewardsPot: number } {
  const eligibleRows = rows.filter((row) => scope === "all" || row.email_verified);
  const referred = rows.filter((row) => row.referred_by && (scope === "all" || row.email_verified)).length;

  return {
    waitlist: eligibleRows.length,
    referred,
    rewardsPot: calculateRewardsPot(rows, scope),
  };
}

export function getLeadersTimeSeriesFromRows(
  rows: WaitlistReferralRow[],
  scope: ReferralScope = "all",
): TimeSeriesPoint[] {
  if (rows.length === 0) return [];

  const orderedRows = [...rows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const nameMap: Record<string, string> = {};

  for (const row of orderedRows) {
    if (row.referral_code && row.name && !nameMap[row.referral_code]) {
      nameMap[row.referral_code] = row.name;
    }
  }

  const points: TimeSeriesPoint[] = [];
  const cumulativeRows: WaitlistReferralRow[] = [];
  let total = 0;
  let referred = 0;
  let lastDate = "";
  let dailyCounts: Record<string, number> = {};
  let previousTopCode: string | null = null;

  for (const row of orderedRows) {
    const date = row.created_at.slice(0, 10);
    total += 1;
    if (row.referral_code) cumulativeRows.push(row);

    const isCountedReferral = Boolean(row.referred_by) && (scope === "all" || row.email_verified);
    if (isCountedReferral) referred += 1;

    const rewardsPot = calculateRewardsPot(cumulativeRows, scope);

    if (date !== lastDate) {
      if (points.length > 0) {
        const top = resolveTopReferrer(dailyCounts, nameMap, previousTopCode);
        points[points.length - 1].topReferrer = top;
        previousTopCode = top?.code ?? null;
      }

      dailyCounts = {};
      points.push({ date, total, referred, nonReferred: total - referred, rewardsPot });
      lastDate = date;
    } else {
      points[points.length - 1] = { date, total, referred, nonReferred: total - referred, rewardsPot };
    }

    if (isCountedReferral && row.referred_by) {
      dailyCounts[row.referred_by] = (dailyCounts[row.referred_by] || 0) + 1;
    }
  }

  if (points.length > 0) {
    const top = resolveTopReferrer(dailyCounts, nameMap, previousTopCode);
    points[points.length - 1].topReferrer = top;
  }

  for (let i = 1; i < points.length; i += 1) {
    points[i].totalDelta = points[i].total - points[i - 1].total;
    points[i].referredDelta = points[i].referred - points[i - 1].referred;
    points[i].nonReferredDelta = points[i].nonReferred - points[i - 1].nonReferred;
    points[i].rewardsDelta = roundZec(points[i].rewardsPot - points[i - 1].rewardsPot);
  }

  return points;
}

export function buildLeaderboardFromRows(
  rows: WaitlistReferralRow[],
  scope: ReferralScope = "all",
  now = new Date(),
): LeaderboardEntry[] {
  const summaries = buildFixedDepthReferralSummaries(rows, scope);

  const nameMap: Record<string, string> = {};
  const preferredCodeMap = buildPreferredCodeMap(rows);
  for (const row of rows) {
    if (row.referral_code && row.name && !nameMap[row.referral_code]) {
      nameMap[row.referral_code] = row.name;
    }
  }

  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - DAY_MS).toISOString().slice(0, 10);
  const nowMs = now.getTime();
  const recentCutoff = nowMs - DAY_MS;
  const previousRecentCutoff = nowMs - 2 * DAY_MS;
  const weeklyCutoff = nowMs - 7 * DAY_MS;
  const previousWeeklyCutoff = nowMs - 14 * DAY_MS;

  const counts: Record<string, number> = {};
  const recentCounts: Record<string, number> = {};
  const previousRecentCounts: Record<string, number> = {};
  const weeklyCounts: Record<string, number> = {};
  const previousWeeklyCounts: Record<string, number> = {};
  const todayCounts: Record<string, number> = {};
  const yesterdayCounts: Record<string, number> = {};

  for (const row of rows) {
    if (!row.referred_by) continue;
    if (scope === "confirmed" && !row.email_verified) continue;

    const code = row.referred_by;
    const date = row.created_at.slice(0, 10);

    counts[code] = (counts[code] || 0) + 1;

    const createdAtMs = new Date(row.created_at).getTime();

    if (createdAtMs >= recentCutoff) {
      recentCounts[code] = (recentCounts[code] || 0) + 1;
    } else if (createdAtMs >= previousRecentCutoff) {
      previousRecentCounts[code] = (previousRecentCounts[code] || 0) + 1;
    }

    if (createdAtMs >= weeklyCutoff) {
      weeklyCounts[code] = (weeklyCounts[code] || 0) + 1;
    } else if (createdAtMs >= previousWeeklyCutoff) {
      previousWeeklyCounts[code] = (previousWeeklyCounts[code] || 0) + 1;
    }

    if (date === today) todayCounts[code] = (todayCounts[code] || 0) + 1;
    if (date === yesterday) yesterdayCounts[code] = (yesterdayCounts[code] || 0) + 1;
  }

  const topToday = Object.entries(todayCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;
  const topYesterday = Object.entries(yesterdayCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;
  const streakCode = topToday && topToday === topYesterday ? topToday : null;
  const topRecentCode = Object.entries(recentCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;

  return Object.entries(counts)
    .map(([referral_code, referrals]) => {
      const summary = summaries.get(referral_code);
      const indirectReferrals = summary?.indirectReferrals ?? 0;
      const displayedReferrals = referrals + indirectReferrals;

      return {
        name: nameMap[referral_code] || referral_code,
        referral_code: preferredCodeMap[referral_code] || referral_code,
        canonical_referral_code: referral_code,
        referrals,
        indirectReferrals,
        attributedReferrals: displayedReferrals,
        recent: recentCounts[referral_code] || 0,
        recentGrowthPct: calculateGrowthPct(
          recentCounts[referral_code] || 0,
          previousRecentCounts[referral_code] || 0,
        ),
        weeklyRecent: weeklyCounts[referral_code] || 0,
        weeklyGrowthPct: calculateGrowthPct(
          weeklyCounts[referral_code] || 0,
          previousWeeklyCounts[referral_code] || 0,
        ),
        potential_rewards: summary?.potentialRewards ?? roundZec(referrals * 0.05),
        streak: referral_code === streakCode,
        topRecent: referral_code === topRecentCode && referral_code !== streakCode,
      };
    })
    .sort((a, b) => {
      if (b.attributedReferrals !== a.attributedReferrals) {
        return b.attributedReferrals - a.attributedReferrals;
      }
      if (b.referrals !== a.referrals) return b.referrals - a.referrals;
      return a.canonical_referral_code.localeCompare(b.canonical_referral_code);
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function getDailyRankingsFromRows(rows: WaitlistReferralRow[], scope: ReferralScope = "all"): DailyRow[] {
  return buildDailyRankingsFromRows(rows, scope);
}

export function getWeeklyRankingsFromRows(rows: WaitlistReferralRow[], scope: ReferralScope = "all"): WeeklyRow[] {
  return buildWeeklyRankingsFromRows(rows, scope);
}

export function getLeadersDataFromRows(
  rows: WaitlistReferralRow[],
  scope: ReferralScope = "all",
  now = new Date(),
  options: { skipTimeSeries?: boolean } = {},
): LeadersData {
  const timeSeries = options.skipTimeSeries ? [] : getLeadersTimeSeriesFromRows(rows, scope);
  const leaderboard = buildLeaderboardFromRows(rows, scope, now);
  const dailyRankings: DailyRow[] = buildDailyRankingsFromRows(rows, scope).map((row) => ({
    ...row,
    topBadge: null,
  }));
  const weeklyRankings = buildWeeklyRankingsFromRows(rows, scope);
  const stats = getWaitlistStatsFromRows(rows, scope);

  let previousDate: string | null = null;
  let previousTopCode: string | null = null;
  let currentStreak = 0;

  for (const row of dailyRankings) {
    const topEntry = row.daily[0];
    if (!topEntry) {
      row.topBadge = null;
      previousDate = row.date;
      previousTopCode = null;
      currentStreak = 0;
      continue;
    }

    const topCode = topEntry.canonical_referral_code ?? topEntry.referral_code;
    const continuesStreak = previousTopCode === topCode && previousDate !== null && isNextDay(previousDate, row.date);

    currentStreak = continuesStreak ? currentStreak + 1 : 1;
    row.topBadge = currentStreak >= 2 ? "red" : "blue";

    previousDate = row.date;
    previousTopCode = topCode;
  }

  return { timeSeries, leaderboard, dailyRankings, weeklyRankings, stats };
}

export function getDailyNewNamesFromRows(rows: WaitlistReferralRow[], date: string): DailyNewNameEntry[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];

  return [...rows]
    .filter((row) => row.created_at.slice(0, 10) === date)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((row) => ({
      name: row.name,
      referral_code: row.preferred_referral_code ?? row.human_referral_code ?? row.referral_code,
      referred_by: row.referred_by,
      created_at: row.created_at,
      email_verified: row.email_verified,
    }))
    .filter((row) => Boolean(row.name));
}

export function getReferralDashboardFromRows(
  referralCode: string,
  rows: WaitlistReferralRow[],
  scope: ReferralScope = "all",
  now = new Date(),
): ReferralDashboardData | null {
  const normalizedCode = referralCode.trim();
  if (!normalizedCode) return null;

  const dashboard: ReferralDashboardBaseData = buildReferralDashboard(normalizedCode, rows, scope, now);
  const leaderboard = buildLeaderboardFromRows(rows, scope, now);
  const leaderboardRank =
    leaderboard.find((entry) => entry.canonical_referral_code === dashboard.canonicalReferralCode)?.rank ?? null;
  const root = rows.find((row) => row.referral_code === normalizedCode) ?? null;

  return {
    ...dashboard,
    leaderboardRank,
    commissionUnlocked: Boolean(root?.cabal),
    referralsUnlocked: true,
  };
}
