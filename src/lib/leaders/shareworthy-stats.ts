import {
  DEFAULT_CONVERSION_BY_BUCKET,
  DEFAULT_PRICE_BY_BUCKET,
  calculateReferralProjection,
  type ReferralScope,
  type WaitlistReferralRow,
} from "./referral-dashboard.js";
import { buildLeaderboardFromRows, getLeadersDataFromRows, getReferralDashboardFromRows, getWaitlistStatsFromRows, type LeaderboardEntry } from "./stats.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const TOP_LIMIT = 5;

export interface DashboardLeaderIdentity {
  name: string;
  referralCode: string;
  canonicalReferralCode: string;
}

export interface DashboardHeadlineKpis {
  waitlist: number;
  referred: number;
  nonReferred: number;
  referredSharePct: number;
  rewardsPot: number;
  allTimeLeader: DashboardLeaderIdentity | null;
  dailyLeader: DashboardLeaderIdentity | null;
  weeklyLeader: DashboardLeaderIdentity | null;
}

export interface DashboardStreakWinner {
  date: string;
  leader: DashboardLeaderIdentity;
  count: number;
  badge: "red" | "blue" | null;
}

export interface DashboardStreaks {
  currentLeader: DashboardLeaderIdentity | null;
  streakLength: number;
  recentDailyWinners: DashboardStreakWinner[];
}

export interface DashboardNewcomerEntry {
  name: string;
  referralCode: string;
  canonicalReferralCode: string;
  firstAttributedReferralAt: string;
  current7DayAttributedReferrals: number;
  totalAttributedReferrals: number;
  leaderboardRank: number | null;
}

export interface DashboardMoverEntry {
  name: string;
  referralCode: string;
  canonicalReferralCode: string;
  current7DayAttributedReferrals: number;
  previous7DayAttributedReferrals: number;
  gain: number;
  leaderboardRank: number | null;
}

export interface DashboardLeaderChange {
  current: DashboardLeaderIdentity | null;
  previous: DashboardLeaderIdentity | null;
  changed: boolean;
  comparisonWindow: string;
}

export interface DashboardZecChangeEntry {
  name: string;
  referralCode: string;
  canonicalReferralCode: string;
  currentProjectedZec: number;
  previousProjectedZec: number;
  delta: number;
}

export interface DashboardWinnerWhy {
  leader: DashboardLeaderIdentity | null;
  runnerUp: DashboardLeaderIdentity | null;
  leaderReferrals: number;
  gapToRunnerUp: number;
  shareOfTotalPct: number;
  onStreak: boolean;
  leadershipChanged: boolean;
}

export interface DashboardCampaignHealth {
  totalReferrals: number;
  totalSignups: number;
  growthPct: number;
  referredSharePct: number;
  nonReferredSharePct: number;
  rewardsPot: number;
  rewardsDelta: number;
}

export interface DashboardReviewBlock {
  label: string;
  periodStart: string;
  periodEnd: string;
  winnerWhy: DashboardWinnerWhy;
  campaignHealth: DashboardCampaignHealth;
  narrativeSummary: string;
}

export interface DashboardCabalProtectionEntry {
  name: string;
  referralCode: string;
  canonicalReferralCode: string;
  totalAttributedReferrals: number;
  projectedRevenue: number;
  fixedPayout: number;
  commissionPayout: number;
  protectedDelta: number;
  commissionRate: number;
  referralsToNextTier: number | null;
  nextTierRate: number | null;
  nextTierProjectedPayout: number | null;
}

export interface DashboardReferralFunnel {
  waitlist: number;
  referred: number;
  nonReferred: number;
  referredSharePct: number;
  nonReferredSharePct: number;
}

export interface DashboardReferralTreeWindowStats {
  directReferrals: number;
  secondOrderReferrals: number;
  thirdOrderReferrals: number;
  fourthPlusReferrals: number;
  indirectReferrals: number;
  attributedReferrals: number;
}

export interface DashboardReferralTreeLeaderEntry extends DashboardReferralTreeWindowStats {
  name: string;
  referralCode: string;
  canonicalReferralCode: string;
  leaderboardRank: number | null;
}

export interface DashboardReferralTreeMoverEntry {
  name: string;
  referralCode: string;
  canonicalReferralCode: string;
  gain: number;
  currentIndirectReferrals: number;
  previousIndirectReferrals: number;
  secondOrderDelta: number;
  thirdOrderDelta: number;
  fourthPlusDelta: number;
  leaderboardRank: number | null;
}

export interface DashboardReferralTreeAnalysis {
  leaders: DashboardReferralTreeLeaderEntry[];
  movers: DashboardReferralTreeMoverEntry[];
}

export type DashboardSectionId =
  | "overview"
  | "streaks"
  | "newcomers"
  | "movers"
  | "referral-tree"
  | "daily-review"
  | "weekly-review"
  | "leader-changes"
  | "zec-changes"
  | "cabal-protection"
  | "shareworthy"
  | "funnel";

export interface DashboardMarketingHook {
  id: string;
  label: string;
  defaultText: string;
  eli5Text: string;
}

export interface DashboardSectionMarketingHooks {
  section: DashboardMarketingHook;
  items: DashboardMarketingHook[];
}

export interface DashboardMarketingHooks {
  sections: Record<DashboardSectionId, DashboardSectionMarketingHooks>;
}

export interface MarketingDashboardSnapshot {
  generatedAt: string;
  scope: ReferralScope;
  headlineKpis: DashboardHeadlineKpis;
  streaks: DashboardStreaks;
  newcomers: DashboardNewcomerEntry[];
  movers: DashboardMoverEntry[];
  dailyReview: DashboardReviewBlock;
  weeklyReview: DashboardReviewBlock;
  referralTree: DashboardReferralTreeAnalysis;
  leaderChanges: {
    allTime: DashboardLeaderChange;
    daily: DashboardLeaderChange;
    weekly: DashboardLeaderChange;
  };
  zecChanges: {
    daily: DashboardZecChangeEntry[];
    weekly: DashboardZecChangeEntry[];
  };
  cabalProtection: DashboardCabalProtectionEntry[];
  funnel: DashboardReferralFunnel;
  shareworthyCallouts: DashboardMarketingHook[];
  marketingHooks: DashboardMarketingHooks;
}

export interface ShareworthyStatsSnapshot {
  generatedAt: string;
  streakLeader: LeaderboardEntry | null;
  topNewcomers: LeaderboardEntry[];
  topMovers: LeaderboardEntry[];
  dailyReview: {
    date: string | null;
    topDailyLeader: string | null;
    topAllTimeLeader: string | null;
    totalReferrals: number;
    totalGrowthPct: number;
  } | null;
  weeklyReview: {
    week: string | null;
    topWeeklyLeader: string | null;
    topAllTimeLeader: string | null;
    totalReferrals: number;
    totalGrowthPct: number;
  } | null;
  leaderChanges: {
    allTime: string | null;
    daily: string | null;
    weekly: string | null;
  };
  zecEarnedLeaders: Array<{
    referralCode: string;
    canonicalReferralCode: string;
    projectedZec: number;
  }>;
  cabalProtection: Array<{
    referralCode: string;
    canonicalReferralCode: string;
    totalAttributedReferrals: number;
    projectedRevenue: number;
    fixedPayout: number;
    commissionPayout: number;
    protectedDelta: number;
    commissionRate: number;
    referralsToNextTier: number | null;
    nextTierRate: number | null;
    nextTierProjectedPayout: number | null;
  }>;
}

interface CodeMetadata {
  name: string;
  referralCode: string;
}

interface WindowSummary {
  start: string;
  end: string;
  label: string;
  referrals: number;
  totalSignups: number;
  topCode: string | null;
  secondCode: string | null;
  counts: Record<string, number>;
}

function roundZec(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function roundPct(value: number): number {
  return Math.round(value * 10) / 10;
}

const COMMISSION_TIERS = [
  { threshold: 0, rate: 0.15 },
  { threshold: 500, rate: 0.18 },
  { threshold: 1500, rate: 0.2 },
  { threshold: 3000, rate: 0.25 },
  { threshold: 5000, rate: 0.3 },
] as const;

function calculateGrowthPct(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : Number.POSITIVE_INFINITY;
  return Math.round(((current - previous) / previous) * 100);
}

function safePct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return roundPct((numerator / denominator) * 100);
}

function formatInfinitePct(value: number): string {
  return Number.isFinite(value) ? `${value}%` : "up from zero";
}

function formatRatePercent(value: number): string {
  return `${roundPct(value)}%`;
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDate(date);
}

function formatUtcWeekday(dateString: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
  }).format(new Date(`${dateString}T00:00:00.000Z`));
}

function formatUtcWeekdayPossessive(dateString: string): string {
  const weekday = formatUtcWeekday(dateString);
  return weekday.endsWith("s") ? `${weekday}'` : `${weekday}'s`;
}

function getUtcWeekRange(date: Date): { weekStart: string; weekEnd: string; label: string } {
  const utcDate = new Date(`${formatUtcDate(date)}T00:00:00.000Z`);
  const dayOffset = (utcDate.getUTCDay() + 6) % 7;
  const weekStartDate = new Date(utcDate.getTime() - dayOffset * DAY_MS);
  const weekEndDate = new Date(weekStartDate.getTime() + 6 * DAY_MS);
  const weekStart = formatUtcDate(weekStartDate);
  const weekEnd = formatUtcDate(weekEndDate);

  return {
    weekStart,
    weekEnd,
    label: `${weekStart} to ${weekEnd}`,
  };
}

function isEligibleRow(row: WaitlistReferralRow, scope: ReferralScope): boolean {
  return scope === "all" || row.email_verified;
}

function buildCodeMetadataMap(rows: WaitlistReferralRow[]): Map<string, CodeMetadata> {
  const metadata = new Map<string, CodeMetadata>();

  for (const row of rows) {
    if (!row.referral_code || metadata.has(row.referral_code)) continue;
    metadata.set(row.referral_code, {
      name: row.name || row.referral_code,
      referralCode: row.preferred_referral_code ?? row.human_referral_code ?? row.referral_code,
    });
  }

  return metadata;
}

function buildEntryMap(entries: LeaderboardEntry[]): Map<string, LeaderboardEntry> {
  return new Map(entries.map((entry) => [entry.canonical_referral_code, entry]));
}

function buildAllTimeAttributedStats(
  rows: WaitlistReferralRow[],
  scope: ReferralScope,
): {
  totals: Map<string, number>;
  firstAttributedReferralAt: Map<string, string>;
} {
  const eligibleRows = rows
    .filter((row) => Boolean(row.referred_by) && isEligibleRow(row, scope))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const parentByCode = new Map<string, string | null>();

  for (const row of rows) {
    if (!row.referral_code) continue;
    if (!parentByCode.has(row.referral_code)) {
      parentByCode.set(row.referral_code, row.referred_by);
    }
  }

  const totals = new Map<string, number>();
  const firstAttributedReferralAt = new Map<string, string>();

  for (const row of eligibleRows) {
    let currentCode: string | null = row.referred_by;
    const visited = new Set<string>();

    while (currentCode && !visited.has(currentCode)) {
      visited.add(currentCode);
      totals.set(currentCode, (totals.get(currentCode) ?? 0) + 1);

      const existing = firstAttributedReferralAt.get(currentCode);
      if (!existing || existing > row.created_at) {
        firstAttributedReferralAt.set(currentCode, row.created_at);
      }

      currentCode = parentByCode.get(currentCode) ?? null;
    }
  }

  return { totals, firstAttributedReferralAt };
}

function buildAttributedCountsForRange(
  rows: WaitlistReferralRow[],
  scope: ReferralScope,
  startMs: number,
  endMs: number,
): Map<string, number> {
  const eligibleRows = rows.filter((row) => isEligibleRow(row, scope));
  const parentByCode = new Map<string, string | null>();

  for (const row of eligibleRows) {
    if (!row.referral_code || parentByCode.has(row.referral_code)) continue;
    parentByCode.set(row.referral_code, row.referred_by);
  }

  const counts = new Map<string, number>();

  for (const row of eligibleRows) {
    if (!row.referred_by) continue;
    const createdAtMs = new Date(row.created_at).getTime();
    if (!Number.isFinite(createdAtMs) || createdAtMs < startMs || createdAtMs >= endMs) continue;

    let currentCode: string | null = row.referred_by;
    const visited = new Set<string>();

    while (currentCode && !visited.has(currentCode)) {
      visited.add(currentCode);
      counts.set(currentCode, (counts.get(currentCode) ?? 0) + 1);
      currentCode = parentByCode.get(currentCode) ?? null;
    }
  }

  return counts;
}

export function buildReferralTreeWindowCounts(
  rows: WaitlistReferralRow[],
  scope: ReferralScope,
  startMs: number,
  endMs: number,
): Map<string, DashboardReferralTreeWindowStats> {
  const eligibleRows = rows.filter((row) => isEligibleRow(row, scope));
  const parentByCode = new Map<string, string | null>();

  for (const row of eligibleRows) {
    if (!row.referral_code || parentByCode.has(row.referral_code)) continue;
    parentByCode.set(row.referral_code, row.referred_by);
  }

  const counts = new Map<string, DashboardReferralTreeWindowStats>();

  const getOrCreate = (code: string): DashboardReferralTreeWindowStats => {
    const existing = counts.get(code);
    if (existing) return existing;

    const created: DashboardReferralTreeWindowStats = {
      directReferrals: 0,
      secondOrderReferrals: 0,
      thirdOrderReferrals: 0,
      fourthPlusReferrals: 0,
      indirectReferrals: 0,
      attributedReferrals: 0,
    };
    counts.set(code, created);
    return created;
  };

  for (const row of eligibleRows) {
    if (!row.referred_by) continue;

    const createdAtMs = new Date(row.created_at).getTime();
    if (!Number.isFinite(createdAtMs) || createdAtMs < startMs || createdAtMs >= endMs) continue;

    let currentCode: string | null = row.referred_by;
    let depth = 1;
    const visited = new Set<string>();

    while (currentCode && !visited.has(currentCode)) {
      visited.add(currentCode);
      const stats = getOrCreate(currentCode);

      if (depth === 1) {
        stats.directReferrals += 1;
      } else if (depth === 2) {
        stats.secondOrderReferrals += 1;
      } else if (depth === 3) {
        stats.thirdOrderReferrals += 1;
      } else {
        stats.fourthPlusReferrals += 1;
      }

      stats.indirectReferrals =
        stats.secondOrderReferrals + stats.thirdOrderReferrals + stats.fourthPlusReferrals;
      stats.attributedReferrals = stats.directReferrals + stats.indirectReferrals;

      currentCode = parentByCode.get(currentCode) ?? null;
      depth += 1;
    }
  }

  return counts;
}

function buildDirectCountsByDate(
  rows: WaitlistReferralRow[],
  scope: ReferralScope,
): { countsByDate: Map<string, Map<string, number>>; signupCountsByDate: Map<string, number> } {
  const countsByDate = new Map<string, Map<string, number>>();
  const signupCountsByDate = new Map<string, number>();

  for (const row of rows) {
    const date = row.created_at.slice(0, 10);
    signupCountsByDate.set(date, (signupCountsByDate.get(date) ?? 0) + 1);

    if (!row.referred_by || !isEligibleRow(row, scope)) continue;

    const dateCounts = countsByDate.get(date) ?? new Map<string, number>();
    dateCounts.set(row.referred_by, (dateCounts.get(row.referred_by) ?? 0) + 1);
    countsByDate.set(date, dateCounts);
  }

  return { countsByDate, signupCountsByDate };
}

function topTwoCodes(counts: Record<string, number>): [string | null, string | null] {
  const ordered = Object.entries(counts)
    .sort(([codeA, countA], [codeB, countB]) => {
      if (countB !== countA) return countB - countA;
      return codeA.localeCompare(codeB);
    })
    .map(([code]) => code);

  return [ordered[0] ?? null, ordered[1] ?? null];
}

function mapCountsToRecord(counts: Map<string, number>): Record<string, number> {
  const record: Record<string, number> = {};

  for (const [code, count] of counts.entries()) {
    record[code] = count;
  }

  return record;
}

function buildLeaderIdentity(code: string | null, metadata: Map<string, CodeMetadata>): DashboardLeaderIdentity | null {
  if (!code) return null;
  const info = metadata.get(code);

  return {
    name: info?.name ?? code,
    referralCode: info?.referralCode ?? code,
    canonicalReferralCode: code,
  };
}

function getNextCommissionTier(totalAttributedReferrals: number): { referralsToNextTier: number | null; nextTierRate: number | null } {
  const nextTier = COMMISSION_TIERS.find((tier) => tier.threshold > totalAttributedReferrals);
  if (!nextTier) {
    return { referralsToNextTier: null, nextTierRate: null };
  }

  return {
    referralsToNextTier: nextTier.threshold - totalAttributedReferrals,
    nextTierRate: nextTier.rate,
  };
}

function buildCabalHookText(entry: DashboardCabalProtectionEntry): string {
  const currentRate = formatRatePercent(entry.commissionRate * 100);
  const baseText = `${entry.name}, you're projected to earn ${entry.commissionPayout.toFixed(4)} ZEC at ${currentRate} commission, compared with ${entry.fixedPayout.toFixed(4)} ZEC under the fixed model.`;

  if (
    entry.referralsToNextTier === null ||
    entry.nextTierRate === null ||
    entry.nextTierProjectedPayout === null
  ) {
    return `${baseText}\n\nYou are already at the top 30% commission tier.\n\nReferrals must buy during early access to count.`;
  }

  return `${baseText}\n\n${entry.referralsToNextTier} more referrals get you to the ${formatRatePercent(entry.nextTierRate * 100)} tier, raising this projection to ${entry.nextTierProjectedPayout.toFixed(4)} ZEC.\n\nReferrals must buy during early access to count.`;
}

function buildWindowSummaryFromCounts(
  start: string,
  end: string,
  countsByDate: Map<string, Map<string, number>>,
  signupCountsByDate: Map<string, number>,
): WindowSummary {
  const counts: Record<string, number> = {};
  let referrals = 0;
  let totalSignups = 0;
  let cursor = start;

  while (cursor <= end) {
    const dayCounts = countsByDate.get(cursor);
    if (dayCounts) {
      for (const [code, count] of dayCounts.entries()) {
        counts[code] = (counts[code] ?? 0) + count;
        referrals += count;
      }
    }

    totalSignups += signupCountsByDate.get(cursor) ?? 0;
    cursor = addDays(cursor, 1);
  }

  const [topCode, secondCode] = topTwoCodes(counts);

  return {
    start,
    end,
    label: start === end ? start : `${start} to ${end}`,
    referrals,
    totalSignups,
    topCode,
    secondCode,
    counts,
  };
}

function filterRowsBefore(rows: WaitlistReferralRow[], endExclusiveMs: number): WaitlistReferralRow[] {
  return rows.filter((row) => new Date(row.created_at).getTime() < endExclusiveMs);
}

function buildZecMap(rows: WaitlistReferralRow[], scope: ReferralScope, now: Date): Map<string, number> {
  return new Map(
    buildLeaderboardFromRows(rows, scope, now).map((entry) => [entry.canonical_referral_code, entry.potential_rewards]),
  );
}

function buildZecChanges(
  metadata: Map<string, CodeMetadata>,
  current: Map<string, number>,
  previous: Map<string, number>,
): DashboardZecChangeEntry[] {
  const codes = new Set<string>([...current.keys(), ...previous.keys()]);

  return [...codes]
    .map((code) => {
      const currentProjectedZec = roundZec(current.get(code) ?? 0);
      const previousProjectedZec = roundZec(previous.get(code) ?? 0);
      const delta = roundZec(currentProjectedZec - previousProjectedZec);
      const identity = buildLeaderIdentity(code, metadata);

      return identity
        ? {
            name: identity.name,
            referralCode: identity.referralCode,
            canonicalReferralCode: identity.canonicalReferralCode,
            currentProjectedZec,
            previousProjectedZec,
            delta,
          }
        : null;
    })
    .filter((entry): entry is DashboardZecChangeEntry => entry !== null && entry.delta > 0)
    .sort((a, b) => b.delta - a.delta || a.canonicalReferralCode.localeCompare(b.canonicalReferralCode))
    .slice(0, TOP_LIMIT);
}

function buildNarrativeSummary(args: {
  label: string;
  winnerWhy: DashboardWinnerWhy;
  campaignHealth: DashboardCampaignHealth;
  previousLeader: DashboardLeaderIdentity | null;
}): string {
  const leaderName = args.winnerWhy.leader?.name ?? "No leader";
  const leaderPart = args.winnerWhy.leader
    ? `${leaderName} led ${args.label} with ${args.winnerWhy.leaderReferrals} referrals`
    : `No referral leader emerged in ${args.label}`;
  const gapPart =
    args.winnerWhy.runnerUp && args.winnerWhy.leader
      ? `, a gap of ${args.winnerWhy.gapToRunnerUp} over ${args.winnerWhy.runnerUp.name}`
      : "";
  const growthPart = `; referral volume ${formatInfinitePct(args.campaignHealth.growthPct)} versus the previous window`;
  const compositionPart = ` and referred signups were ${args.campaignHealth.referredSharePct}% of ${args.campaignHealth.totalSignups} signups`;
  const leaderChangePart =
    args.winnerWhy.leadershipChanged && args.previousLeader
      ? `. Leadership flipped from ${args.previousLeader.name}`
      : args.winnerWhy.onStreak
        ? ". The same leader is holding a streak"
        : ". Leadership stayed steady";

  return `${leaderPart}${gapPart}${growthPart}${compositionPart}${leaderChangePart}.`;
}

function buildReviewBlock(args: {
  label: string;
  current: WindowSummary;
  previous: WindowSummary;
  currentLeader: DashboardLeaderIdentity | null;
  previousLeader: DashboardLeaderIdentity | null;
  runnerUp: DashboardLeaderIdentity | null;
  onStreak: boolean;
  currentRewardsPot: number;
  previousRewardsPot: number;
}): DashboardReviewBlock {
  const leaderReferrals = args.current.topCode ? args.current.counts[args.current.topCode] ?? 0 : 0;
  const runnerUpReferrals = args.current.secondCode ? args.current.counts[args.current.secondCode] ?? 0 : 0;
  const winnerWhy: DashboardWinnerWhy = {
    leader: args.currentLeader,
    runnerUp: args.runnerUp,
    leaderReferrals,
    gapToRunnerUp: Math.max(0, leaderReferrals - runnerUpReferrals),
    shareOfTotalPct: safePct(leaderReferrals, args.current.referrals),
    onStreak: args.onStreak,
    leadershipChanged:
      (args.currentLeader?.canonicalReferralCode ?? null) !== (args.previousLeader?.canonicalReferralCode ?? null),
  };
  const campaignHealth: DashboardCampaignHealth = {
    totalReferrals: args.current.referrals,
    totalSignups: args.current.totalSignups,
    growthPct: calculateGrowthPct(args.current.referrals, args.previous.referrals),
    referredSharePct: safePct(args.current.referrals, args.current.totalSignups),
    nonReferredSharePct: safePct(args.current.totalSignups - args.current.referrals, args.current.totalSignups),
    rewardsPot: args.currentRewardsPot,
    rewardsDelta: roundZec(args.currentRewardsPot - args.previousRewardsPot),
  };

  return {
    label: args.label,
    periodStart: args.current.start,
    periodEnd: args.current.end,
    winnerWhy,
    campaignHealth,
    narrativeSummary: buildNarrativeSummary({
      label: args.label,
      winnerWhy,
      campaignHealth,
      previousLeader: args.previousLeader,
    }),
  };
}

function buildEli5Text(id: string, label: string, defaultText: string): string {
  if (id.startsWith("section:daily-review") || id.startsWith("section:weekly-review")) {
    return "This sums up who led the review window, by how much, and how it compared with the previous window.";
  }

  if (id.startsWith("leader-changes:all-time")) {
    return "This compares the current all-time leader with the person who led before them.";
  }

  if (id.startsWith("leader-changes:daily")) {
    return "This compares the top referrer for the current UTC day with the top referrer from the previous UTC day.";
  }

  if (id.startsWith("leader-changes:weekly")) {
    return "This compares the current Monday-Sunday UTC leader with the previous week's leader.";
  }

  if (id.startsWith("overview:waitlist") || id.startsWith("funnel:waitlist")) {
    return "People can claim their name during early access in the order they joined.";
  }

  if (id.includes("referred")) {
    return "These signups came from someone sharing a referral code.";
  }

  if (id.includes("non-referred")) {
    return "These people joined without using a referral code.";
  }

  if (id.includes("streak")) {
    return "The daily winner is the person with the most direct referrals on that UTC day.";
  }

  if (id.includes("newcomer")) {
    return "This shows how fast a new referrer started growing after their first attributed referral.";
  }

  if (id.includes("mover")) {
    return "This compares the last 7 days with the 7 days right before that.";
  }

  if (id.includes("indirect") || id.includes("referral-tree")) {
    return "Indirect referrals come from people referred by someone you referred, or deeper in the tree.";
  }

  if (id.includes("zec")) {
    return id.startsWith("zec-daily:")
      ? "This is the change in projected payout for the current UTC day compared with the previous one."
      : "This is the change in projected payout for the current week compared with the previous week.";
  }

  if (id.includes("cabal")) {
    return "This compares payout under commission pricing and the fixed model.";
  }

  if (id.includes("leader")) {
    return "This shows who is currently in first place.";
  }

  return defaultText;
}

function buildHook(id: string, label: string, defaultText: string, eli5Text?: string): DashboardMarketingHook {
  return { id, label, defaultText, eli5Text: eli5Text ?? buildEli5Text(id, label, defaultText) };
}

function leaderDisplayName(identity: DashboardLeaderIdentity | null): string {
  return identity?.name ?? "No one";
}

function buildShareworthyCallouts(args: {
  streaks: DashboardStreaks;
  newcomers: DashboardNewcomerEntry[];
  movers: DashboardMoverEntry[];
  leaderChanges: MarketingDashboardSnapshot["leaderChanges"];
  zecChanges: MarketingDashboardSnapshot["zecChanges"];
  funnel: DashboardReferralFunnel;
}): DashboardMarketingHook[] {
  const callouts: DashboardMarketingHook[] = [];

  if (args.streaks.currentLeader && args.streaks.streakLength >= 2) {
    callouts.push(
      buildHook(
        "shareworthy:streak",
        "Streak momentum",
        `${args.streaks.currentLeader.name} has led referrals for ${args.streaks.streakLength} days in a row.`,
        "This is the strongest active daily referral streak.",
      ),
    );
  }

  if (args.newcomers[0]) {
    callouts.push(
      buildHook(
        `shareworthy:newcomer:${args.newcomers[0].canonicalReferralCode}`,
        "Newcomer breakout",
        `${args.newcomers[0].name} stood out as a new referrer with ${args.newcomers[0].current7DayAttributedReferrals} attributed referrals in 7 days.`,
        "This highlights the strongest recent newcomer.",
      ),
    );
  }

  if (args.movers[0]) {
    callouts.push(
      buildHook(
        `shareworthy:mover:${args.movers[0].canonicalReferralCode}`,
        "Mover acceleration",
        `${args.movers[0].name} had the biggest weekly referral gain at +${args.movers[0].gain}.`,
        "This highlights the strongest week-over-week referral gain.",
      ),
    );
  }

  if (args.leaderChanges.weekly.changed && args.leaderChanges.weekly.current && args.leaderChanges.weekly.previous) {
    callouts.push(
      buildHook(
        `shareworthy:weekly-flip:${args.leaderChanges.weekly.current.canonicalReferralCode}`,
        "Weekly lead flip",
        `${args.leaderChanges.weekly.current.name} passed ${args.leaderChanges.weekly.previous.name} for the weekly lead.`,
        "This highlights a change at the top of the weekly leaderboard.",
      ),
    );
  }

  if (args.zecChanges.weekly[0]) {
    callouts.push(
      buildHook(
        `shareworthy:zec:${args.zecChanges.weekly[0].canonicalReferralCode}`,
        "Payout momentum",
        `${args.zecChanges.weekly[0].name} had the biggest weekly projected payout gain at +${args.zecChanges.weekly[0].delta} ZEC.`,
        "This highlights the biggest weekly jump in projected ZEC payout.",
      ),
    );
  }

  callouts.push(
    buildHook(
      "shareworthy:funnel",
      "Referral mix",
      `${args.funnel.referredSharePct}% of verified waitlist signups came from referrals.\n\n${args.funnel.nonReferred} people signed up without a referral, so they can still be encouraged to invite others, move up the list, and earn ZEC.`,
      "This shows how much of the verified waitlist came from referrals versus direct signup.",
    ),
  );

  return callouts.slice(0, TOP_LIMIT + 1);
}

function buildSectionHooks(args: {
  headlineKpis: DashboardHeadlineKpis;
  streaks: DashboardStreaks;
  newcomers: DashboardNewcomerEntry[];
  movers: DashboardMoverEntry[];
  dailyReview: DashboardReviewBlock;
  weeklyReview: DashboardReviewBlock;
  referralTree: DashboardReferralTreeAnalysis;
  leaderChanges: MarketingDashboardSnapshot["leaderChanges"];
  zecChanges: MarketingDashboardSnapshot["zecChanges"];
  cabalProtection: DashboardCabalProtectionEntry[];
  shareworthyCallouts: DashboardMarketingHook[];
  funnel: DashboardReferralFunnel;
  currentDate: string;
}): DashboardMarketingHooks {
  const overviewItems = [
    buildHook(
      "overview:waitlist",
      "Waitlist",
      `${args.headlineKpis.waitlist} verified people are on the waitlist.`,
      "People can claim their name during early access in the order they joined.",
    ),
    buildHook(
      "overview:referred",
      "Referred",
      `${args.headlineKpis.referred} verified waitlist signups came from referrals. That is ${args.headlineKpis.referredSharePct}% of the total.`,
      "These people joined with someone else's referral code.",
    ),
    buildHook(
      "overview:rewards-pot",
      "Rewards pot",
      `The projected fixed-model rewards total is ${roundZec(args.headlineKpis.rewardsPot).toFixed(4)} ZEC.`,
      "This is the current projected ZEC total from referral rewards.",
    ),
    buildHook(
      "overview:all-time-leader",
      "All-time leader",
      `${leaderDisplayName(args.headlineKpis.allTimeLeader)} has the most total attributed referrals so far.`,
      "This is the current all-time leader on the referral leaderboard.",
    ),
    buildHook(
      "overview:daily-leader",
      "Daily leader",
      `${leaderDisplayName(args.headlineKpis.dailyLeader)} is leading ${formatUtcWeekdayPossessive(args.currentDate)} referrals.`,
      "This is the top referrer for the current UTC day.",
    ),
    buildHook(
      "overview:weekly-leader",
      "Weekly leader",
      `${leaderDisplayName(args.headlineKpis.weeklyLeader)} is leading this week's referrals.`,
      "This is the top referrer for the current Monday-Sunday UTC week.",
    ),
  ];
  const streakItems = args.streaks.recentDailyWinners.map((entry) =>
    buildHook(
      `streaks:${entry.date}:${entry.leader.canonicalReferralCode}`,
      `${formatUtcWeekday(entry.date)} winner`,
      `${entry.leader.name} led ${formatUtcWeekday(entry.date)} with ${entry.count} direct referrals${
        entry.badge === "red"
          ? ". That was their second straight day on top"
          : entry.badge === "blue"
            ? ". They had the most referrals that day"
            : ""
      }.`,
      "The daily winner is the person with the most direct referrals on that UTC day.",
    ),
  );
  const newcomerItems = args.newcomers.map((entry) =>
    buildHook(
      `newcomers:${entry.canonicalReferralCode}`,
      entry.name,
      `${entry.name} got their first referral and reached ${entry.current7DayAttributedReferrals} attributed signups in 7 days. They now have ${entry.totalAttributedReferrals} total.`,
      "This shows how fast a new referrer started growing after their first attributed referral.",
    ),
  );
  const moverItems = args.movers.map((entry) =>
    buildHook(
      `movers:${entry.canonicalReferralCode}`,
      entry.name,
      `${entry.name} gained ${entry.gain} more attributed referrals than in the previous 7-day window.`,
      "This compares the last 7 days with the 7 days right before that.",
    ),
  );
  const referralTreeItems = [
    ...args.referralTree.leaders.map((entry) =>
      buildHook(
        `referral-tree:leader:${entry.canonicalReferralCode}`,
        `${entry.name} indirect leader`,
        `${entry.name} generated ${entry.indirectReferrals} indirect referrals in the last 7 days. That includes ${entry.secondOrderReferrals} second-order and ${entry.thirdOrderReferrals} third-order referrals.`,
        `This tracks referrals that came through ${entry.name}'s referral tree, not just direct invites.`,
      ),
    ),
    ...args.referralTree.movers.map((entry) =>
      buildHook(
        `referral-tree:mover:${entry.canonicalReferralCode}`,
        `${entry.name} indirect mover`,
        `${entry.name} had ${entry.gain} more indirect referrals than in the previous 7-day window.`,
        "This compares indirect referral growth across two back-to-back 7-day windows.",
      ),
    ),
  ];
  const zecItems = [
    ...args.zecChanges.daily.map((entry) =>
      buildHook(
        `zec-daily:${entry.canonicalReferralCode}`,
        `${entry.name} ${formatUtcWeekday(args.currentDate)} daily delta`,
        `${entry.name} added ${entry.delta.toFixed(4)} ZEC in projected payout on ${formatUtcWeekday(args.currentDate)}.`,
        "This is the change in projected payout for the current UTC day compared with the previous one.",
      ),
    ),
    ...args.zecChanges.weekly.map((entry) =>
      buildHook(
        `zec-weekly:${entry.canonicalReferralCode}`,
        `${entry.name} weekly delta`,
        `${entry.name} added ${entry.delta.toFixed(4)} ZEC in projected payout this week.`,
        "This is the change in projected payout for the current week compared with the previous week.",
      ),
    ),
  ];
  const cabalItems = args.cabalProtection.map((entry) =>
    buildHook(
      `cabal:${entry.canonicalReferralCode}`,
      entry.name,
      buildCabalHookText(entry),
      `This is how much more ${entry.name} would earn under commission pricing than under the fixed model.`,
    ),
  );
  const leaderChangeItems = [
    buildHook(
      `leader-changes:all-time:${args.leaderChanges.allTime.current?.canonicalReferralCode ?? "none"}`,
      "All-time leader change",
      args.leaderChanges.allTime.changed && args.leaderChanges.allTime.current && args.leaderChanges.allTime.previous
        ? `${args.leaderChanges.allTime.current.name} passed ${args.leaderChanges.allTime.previous.name} for the all-time lead.`
        : `${leaderDisplayName(args.leaderChanges.allTime.current)} is still the all-time leader.`,
      "This compares the current all-time leader with the person who led before them.",
    ),
    buildHook(
      `leader-changes:daily:${args.leaderChanges.daily.current?.canonicalReferralCode ?? "none"}`,
      "Daily leader change",
      args.leaderChanges.daily.changed && args.leaderChanges.daily.current && args.leaderChanges.daily.previous
        ? `${args.leaderChanges.daily.current.name} replaced ${args.leaderChanges.daily.previous.name} as the daily leader on ${formatUtcWeekday(args.currentDate)}.`
        : `${leaderDisplayName(args.leaderChanges.daily.current)} is still leading ${formatUtcWeekday(args.currentDate)}.`,
      "This compares the top referrer for the current UTC day with the top referrer from the previous UTC day.",
    ),
    buildHook(
      `leader-changes:weekly:${args.leaderChanges.weekly.current?.canonicalReferralCode ?? "none"}`,
      "Weekly leader change",
      args.leaderChanges.weekly.changed && args.leaderChanges.weekly.current && args.leaderChanges.weekly.previous
        ? `${args.leaderChanges.weekly.current.name} passed ${args.leaderChanges.weekly.previous.name} for the weekly lead.`
        : `${leaderDisplayName(args.leaderChanges.weekly.current)} is still leading the week.`,
      "This compares the current Monday-Sunday UTC leader with the previous week's leader.",
    ),
  ];
  const funnelItems = [
    buildHook(
      "funnel:referred",
      "Referred signups",
      `${args.funnel.referred} verified waitlist signups came from referrals. That is ${args.funnel.referredSharePct}% of the total.`,
      "These signups came from someone sharing a referral code.",
    ),
    buildHook(
      "funnel:non-referred",
      "Non-referred signups",
      `${args.funnel.nonReferred} people signed up without a referral. They can still be encouraged to invite others, move up the list, and earn ZEC.`,
      "These people joined without using a referral code.",
    ),
    buildHook(
      "funnel:waitlist",
      "Funnel waitlist",
      `${args.funnel.waitlist} verified people are currently on the waitlist.`,
      "People can claim their name during early access in the order they joined.",
    ),
  ];

  return {
    sections: {
      overview: {
        section: buildHook(
          "section:overview",
          "Overview",
          `${leaderDisplayName(args.headlineKpis.weeklyLeader)} is leading this week's referrals. ${args.headlineKpis.referredSharePct}% of verified waitlist signups came from referrals.`,
          "People can claim their name during early access in the order they joined. They can move up the list and earn ZEC by inviting others.",
        ),
        items: overviewItems,
      },
      streaks: {
        section: buildHook(
          "section:streaks",
          "Streaks",
          args.streaks.currentLeader
            ? `${args.streaks.currentLeader.name} has led referrals for ${args.streaks.streakLength} days in a row.`
            : "No one has a referral streak right now.",
          "A streak means the same person had the most direct referrals on back-to-back UTC days.",
        ),
        items: streakItems,
      },
      newcomers: {
        section: buildHook(
          "section:newcomers",
          "Top newcomers",
          args.newcomers[0]
            ? `${args.newcomers[0].name} had the strongest new referral start in the last 7 days with ${args.newcomers[0].current7DayAttributedReferrals} attributed referrals.`
            : "No new referral breakout happened in the last 7 days.",
          "A newcomer is someone who only recently started getting credited with referrals.",
        ),
        items: newcomerItems,
      },
      movers: {
        section: buildHook(
          "section:movers",
          "Top movers",
          args.movers[0]
            ? `${args.movers[0].name} had the biggest 7-day referral gain, up ${args.movers[0].gain} from the prior 7 days.`
            : "No one posted a positive referral gain in the current 7-day window.",
          "This compares the last 7 days with the 7 days right before that.",
        ),
        items: moverItems,
      },
      "referral-tree": {
        section: buildHook(
          "section:referral-tree",
          "Referral tree",
          args.referralTree.leaders[0]
            ? `${args.referralTree.leaders[0].name} led indirect referrals in the last 7 days with ${args.referralTree.leaders[0].indirectReferrals} second-order-or-deeper referrals.`
            : "No indirect referral activity showed up in the current 7-day window.",
          "Indirect referrals come from people referred by someone you referred, or deeper in the tree.",
        ),
        items: referralTreeItems,
      },
      "daily-review": {
        section: buildHook(
          "section:daily-review",
          "Daily review",
          args.dailyReview.narrativeSummary,
        ),
        items: [],
      },
      "weekly-review": {
        section: buildHook(
          "section:weekly-review",
          "Weekly review",
          args.weeklyReview.narrativeSummary,
        ),
        items: [],
      },
      "leader-changes": {
        section: buildHook(
          "section:leader-changes",
          "Leader changes",
          args.leaderChanges.weekly.changed && args.leaderChanges.weekly.current && args.leaderChanges.weekly.previous
            ? `${args.leaderChanges.weekly.current.name} took the weekly lead from ${args.leaderChanges.weekly.previous.name}.`
            : `${leaderDisplayName(args.leaderChanges.weekly.current)} is still leading the week.`,
          "This section shows whether the top spot changed for all-time, daily, or weekly leaderboards.",
        ),
        items: leaderChangeItems,
      },
      "zec-changes": {
        section: buildHook(
          "section:zec-changes",
          "ZEC changes",
          args.zecChanges.weekly[0]
            ? `${args.zecChanges.weekly[0].name} had the biggest projected ZEC gain this week, up ${args.zecChanges.weekly[0].delta.toFixed(4)} ZEC.`
            : "No one posted a positive projected ZEC gain in the current comparison window.",
          "This shows whose projected payout increased the most.",
        ),
        items: zecItems,
      },
      "cabal-protection": {
        section: buildHook(
          "section:cabal-protection",
          "Cabal rewards",
          args.cabalProtection[0]
            ? `${args.cabalProtection[0].name} gains the most under commission pricing, at ${args.cabalProtection[0].protectedDelta.toFixed(4)} ZEC more than the fixed model.`
            : "No cabal protection difference is visible in the current verified data.",
          "This compares projected payout under the commission model and the fixed model.",
        ),
        items: cabalItems,
      },
      shareworthy: {
        section: buildHook(
          "section:shareworthy",
          "Shareworthy callouts",
          args.shareworthyCallouts[0]?.defaultText ?? "No shareworthy referral highlight is ready right now.",
          "These are short social-ready referral highlights from the current dashboard.",
        ),
        items: args.shareworthyCallouts,
      },
      funnel: {
        section: buildHook(
          "section:funnel",
          "Referral funnel",
          `${args.funnel.referredSharePct}% of verified waitlist signups came from referrals.\n\n${args.funnel.nonReferred} people signed up without a referral, so they can still be encouraged to invite others, move up the list, and earn ZEC.`,
          "People can claim their name during early access in the order they joined. They can move up the list and earn ZEC by inviting others.",
        ),
        items: funnelItems,
      },
    },
  };
}

export function buildMarketingDashboardSnapshot(
  rows: WaitlistReferralRow[],
  scope: ReferralScope = "all",
  now = new Date(),
): MarketingDashboardSnapshot {
  const leaders = getLeadersDataFromRows(rows, scope, now, { skipTimeSeries: true });
  const metadata = buildCodeMetadataMap(rows);
  const leaderboardByCode = buildEntryMap(leaders.leaderboard);
  const waitlistStats = getWaitlistStatsFromRows(rows, scope);
  const nowMs = now.getTime();
  const current7DayCounts = buildAttributedCountsForRange(rows, scope, nowMs - WEEK_MS, nowMs + 1);
  const previous7DayCounts = buildAttributedCountsForRange(rows, scope, nowMs - 2 * WEEK_MS, nowMs - WEEK_MS);
  const currentReferralTreeCounts = buildReferralTreeWindowCounts(rows, scope, nowMs - WEEK_MS, nowMs + 1);
  const previousReferralTreeCounts = buildReferralTreeWindowCounts(rows, scope, nowMs - 2 * WEEK_MS, nowMs - WEEK_MS);
  const allTimeAttributed = buildAllTimeAttributedStats(rows, scope);
  const latestDaily = leaders.dailyRankings.at(-1) ?? null;
  const previousDaily = leaders.dailyRankings.at(-2) ?? null;
  const latestWeekly = leaders.weeklyRankings.at(-1) ?? null;
  const previousWeekly = leaders.weeklyRankings.at(-2) ?? null;
  const { countsByDate, signupCountsByDate } = buildDirectCountsByDate(rows, scope);
  const currentDate = formatUtcDate(now);
  const previousDate = formatUtcDate(new Date(nowMs - DAY_MS));
  const weekRange = getUtcWeekRange(now);
  const previousWeekEnd = addDays(weekRange.weekStart, -1);
  const previousWeekRange = getUtcWeekRange(new Date(`${previousWeekEnd}T00:00:00.000Z`));
  const dailyCurrentSummary = buildWindowSummaryFromCounts(currentDate, currentDate, countsByDate, signupCountsByDate);
  const dailyPreviousSummary = buildWindowSummaryFromCounts(previousDate, previousDate, countsByDate, signupCountsByDate);
  const weeklyCurrentSummary = buildWindowSummaryFromCounts(
    weekRange.weekStart,
    weekRange.weekEnd,
    countsByDate,
    signupCountsByDate,
  );
  const weeklyPreviousSummary = buildWindowSummaryFromCounts(
    previousWeekRange.weekStart,
    previousWeekRange.weekEnd,
    countsByDate,
    signupCountsByDate,
  );
  const startOfTodayMs = new Date(`${currentDate}T00:00:00.000Z`).getTime();
  const startOfCurrentWeekMs = new Date(`${weekRange.weekStart}T00:00:00.000Z`).getTime();
  const previousAllTimeRows = filterRowsBefore(rows, startOfTodayMs);
  const previousWeekRows = filterRowsBefore(rows, startOfCurrentWeekMs);
  const currentZecMap = buildZecMap(rows, scope, now);
  const previousDailyZecMap = buildZecMap(previousAllTimeRows, scope, new Date(startOfTodayMs - 1));
  const previousWeeklyZecMap = buildZecMap(previousWeekRows, scope, new Date(startOfCurrentWeekMs - 1));
  const streakDailyRows = leaders.dailyRankings.filter((row) => row.daily[0]).slice(-7);
  const currentStreakLeader = leaders.leaderboard.find((entry) => entry.streak) ?? null;
  let streakLength = 0;

  if (currentStreakLeader) {
    for (let index = leaders.dailyRankings.length - 1; index >= 0; index -= 1) {
      const topCode = leaders.dailyRankings[index]?.daily[0]?.canonical_referral_code ?? null;
      if (topCode !== currentStreakLeader.canonical_referral_code) break;
      streakLength += 1;
    }
  }

  const newcomers = [...allTimeAttributed.firstAttributedReferralAt.entries()]
    .filter(([, firstSeen]) => {
      const firstSeenMs = new Date(firstSeen).getTime();
      return firstSeenMs >= nowMs - WEEK_MS && firstSeenMs <= nowMs;
    })
    .map(([code, firstSeen]) => {
      const identity = buildLeaderIdentity(code, metadata);
      if (!identity) return null;
      const leaderboardEntry = leaderboardByCode.get(code);

      return {
        name: identity.name,
        referralCode: identity.referralCode,
        canonicalReferralCode: code,
        firstAttributedReferralAt: firstSeen,
        current7DayAttributedReferrals: current7DayCounts.get(code) ?? 0,
        totalAttributedReferrals: allTimeAttributed.totals.get(code) ?? 0,
        leaderboardRank: leaderboardEntry?.rank ?? null,
      };
    })
    .filter((entry): entry is DashboardNewcomerEntry => Boolean(entry))
    .sort((a, b) => {
      if (b.current7DayAttributedReferrals !== a.current7DayAttributedReferrals) {
        return b.current7DayAttributedReferrals - a.current7DayAttributedReferrals;
      }
      if (b.totalAttributedReferrals !== a.totalAttributedReferrals) {
        return b.totalAttributedReferrals - a.totalAttributedReferrals;
      }
      return a.canonicalReferralCode.localeCompare(b.canonicalReferralCode);
    })
    .slice(0, TOP_LIMIT);

  const moverCodes = new Set<string>([...current7DayCounts.keys(), ...previous7DayCounts.keys()]);
  const movers = [...moverCodes]
    .map((code) => {
      const identity = buildLeaderIdentity(code, metadata);
      if (!identity) return null;
      const currentWindow = current7DayCounts.get(code) ?? 0;
      const previousWindow = previous7DayCounts.get(code) ?? 0;
      const gain = currentWindow - previousWindow;
      const leaderboardEntry = leaderboardByCode.get(code);

      return {
        name: identity.name,
        referralCode: identity.referralCode,
        canonicalReferralCode: code,
        current7DayAttributedReferrals: currentWindow,
        previous7DayAttributedReferrals: previousWindow,
        gain,
        leaderboardRank: leaderboardEntry?.rank ?? null,
      };
    })
    .filter((entry): entry is DashboardMoverEntry => entry !== null && entry.gain > 0)
    .sort((a, b) => {
      if (b.gain !== a.gain) return b.gain - a.gain;
      if (b.current7DayAttributedReferrals !== a.current7DayAttributedReferrals) {
        return b.current7DayAttributedReferrals - a.current7DayAttributedReferrals;
      }
      return a.canonicalReferralCode.localeCompare(b.canonicalReferralCode);
    })
    .slice(0, TOP_LIMIT);

  const referralTreeLeaderCodes = new Set<string>([
    ...currentReferralTreeCounts.keys(),
    ...previousReferralTreeCounts.keys(),
  ]);
  const referralTreeLeaders = [...referralTreeLeaderCodes]
    .map((code) => {
      const identity = buildLeaderIdentity(code, metadata);
      if (!identity) return null;

      const currentStats = currentReferralTreeCounts.get(code);
      if (!currentStats || currentStats.indirectReferrals <= 0) return null;

      return {
        name: identity.name,
        referralCode: identity.referralCode,
        canonicalReferralCode: code,
        leaderboardRank: leaderboardByCode.get(code)?.rank ?? null,
        ...currentStats,
      };
    })
    .filter((entry): entry is DashboardReferralTreeLeaderEntry => entry !== null)
    .sort((a, b) => {
      if (b.indirectReferrals !== a.indirectReferrals) return b.indirectReferrals - a.indirectReferrals;
      if (b.attributedReferrals !== a.attributedReferrals) return b.attributedReferrals - a.attributedReferrals;
      return a.canonicalReferralCode.localeCompare(b.canonicalReferralCode);
    })
    .slice(0, TOP_LIMIT);

  const referralTreeMovers = [...referralTreeLeaderCodes]
    .map((code) => {
      const identity = buildLeaderIdentity(code, metadata);
      if (!identity) return null;

      const currentStats = currentReferralTreeCounts.get(code) ?? {
        directReferrals: 0,
        secondOrderReferrals: 0,
        thirdOrderReferrals: 0,
        fourthPlusReferrals: 0,
        indirectReferrals: 0,
        attributedReferrals: 0,
      };
      const previousStats = previousReferralTreeCounts.get(code) ?? {
        directReferrals: 0,
        secondOrderReferrals: 0,
        thirdOrderReferrals: 0,
        fourthPlusReferrals: 0,
        indirectReferrals: 0,
        attributedReferrals: 0,
      };
      const gain = currentStats.indirectReferrals - previousStats.indirectReferrals;

      if (gain <= 0) return null;

      return {
        name: identity.name,
        referralCode: identity.referralCode,
        canonicalReferralCode: code,
        gain,
        currentIndirectReferrals: currentStats.indirectReferrals,
        previousIndirectReferrals: previousStats.indirectReferrals,
        secondOrderDelta: currentStats.secondOrderReferrals - previousStats.secondOrderReferrals,
        thirdOrderDelta: currentStats.thirdOrderReferrals - previousStats.thirdOrderReferrals,
        fourthPlusDelta: currentStats.fourthPlusReferrals - previousStats.fourthPlusReferrals,
        leaderboardRank: leaderboardByCode.get(code)?.rank ?? null,
      };
    })
    .filter((entry): entry is DashboardReferralTreeMoverEntry => entry !== null)
    .sort((a, b) => {
      if (b.gain !== a.gain) return b.gain - a.gain;
      if (b.currentIndirectReferrals !== a.currentIndirectReferrals) {
        return b.currentIndirectReferrals - a.currentIndirectReferrals;
      }
      return a.canonicalReferralCode.localeCompare(b.canonicalReferralCode);
    })
    .slice(0, TOP_LIMIT);

  const referralTree: DashboardReferralTreeAnalysis = {
    leaders: referralTreeLeaders,
    movers: referralTreeMovers,
  };

  const allTimePreviousLeader = buildLeaderboardFromRows(previousAllTimeRows, scope, new Date(startOfTodayMs - 1))[0] ?? null;
  const leaderChanges = {
    allTime: {
      current: buildLeaderIdentity(leaders.leaderboard[0]?.canonical_referral_code ?? null, metadata),
      previous: buildLeaderIdentity(allTimePreviousLeader?.canonical_referral_code ?? null, metadata),
      changed:
        (leaders.leaderboard[0]?.canonical_referral_code ?? null) !==
        (allTimePreviousLeader?.canonical_referral_code ?? null),
      comparisonWindow: `vs before ${currentDate}`,
    },
    daily: {
      current: buildLeaderIdentity(latestDaily?.daily[0]?.canonical_referral_code ?? null, metadata),
      previous: buildLeaderIdentity(previousDaily?.daily[0]?.canonical_referral_code ?? null, metadata),
      changed:
        (latestDaily?.daily[0]?.canonical_referral_code ?? null) !==
        (previousDaily?.daily[0]?.canonical_referral_code ?? null),
      comparisonWindow: `${previousDate} -> ${currentDate}`,
    },
    weekly: {
      current: buildLeaderIdentity(latestWeekly?.weekly[0]?.canonical_referral_code ?? null, metadata),
      previous: buildLeaderIdentity(previousWeekly?.weekly[0]?.canonical_referral_code ?? null, metadata),
      changed:
        (latestWeekly?.weekly[0]?.canonical_referral_code ?? null) !==
        (previousWeekly?.weekly[0]?.canonical_referral_code ?? null),
      comparisonWindow: `${previousWeekRange.label} -> ${weekRange.label}`,
    },
  };

  const headlineKpis: DashboardHeadlineKpis = {
    waitlist: waitlistStats.waitlist,
    referred: waitlistStats.referred,
    nonReferred: waitlistStats.waitlist - waitlistStats.referred,
    referredSharePct: safePct(waitlistStats.referred, waitlistStats.waitlist),
    rewardsPot: waitlistStats.rewardsPot,
    allTimeLeader: buildLeaderIdentity(leaders.leaderboard[0]?.canonical_referral_code ?? null, metadata),
    dailyLeader: buildLeaderIdentity(latestDaily?.daily[0]?.canonical_referral_code ?? null, metadata),
    weeklyLeader: buildLeaderIdentity(latestWeekly?.weekly[0]?.canonical_referral_code ?? null, metadata),
  };

  const streaks: DashboardStreaks = {
    currentLeader: buildLeaderIdentity(currentStreakLeader?.canonical_referral_code ?? null, metadata),
    streakLength,
    recentDailyWinners: streakDailyRows
      .map((row) => {
        const topEntry = row.daily[0];
        if (!topEntry) return null;
        const leader = buildLeaderIdentity(topEntry.canonical_referral_code, metadata);
        if (!leader) return null;

        return {
          date: row.date,
          leader,
          count: topEntry.count,
          badge: row.topBadge ?? null,
        };
      })
      .filter((entry): entry is DashboardStreakWinner => Boolean(entry)),
  };

  const dailyReview = buildReviewBlock({
    label: currentDate,
    current: dailyCurrentSummary,
    previous: dailyPreviousSummary,
    currentLeader: buildLeaderIdentity(dailyCurrentSummary.topCode, metadata),
    previousLeader: buildLeaderIdentity(dailyPreviousSummary.topCode, metadata),
    runnerUp: buildLeaderIdentity(dailyCurrentSummary.secondCode, metadata),
    onStreak: Boolean(currentStreakLeader && currentStreakLeader.canonical_referral_code === dailyCurrentSummary.topCode),
    currentRewardsPot: waitlistStats.rewardsPot,
    previousRewardsPot: getWaitlistStatsFromRows(previousAllTimeRows, scope).rewardsPot,
  });

  const weeklyReview = buildReviewBlock({
    label: weekRange.label,
    current: weeklyCurrentSummary,
    previous: weeklyPreviousSummary,
    currentLeader: buildLeaderIdentity(weeklyCurrentSummary.topCode, metadata),
    previousLeader: buildLeaderIdentity(weeklyPreviousSummary.topCode, metadata),
    runnerUp: buildLeaderIdentity(weeklyCurrentSummary.secondCode, metadata),
    onStreak:
      (weeklyCurrentSummary.topCode ?? null) !== null &&
      (weeklyCurrentSummary.topCode ?? null) === (weeklyPreviousSummary.topCode ?? null),
    currentRewardsPot: waitlistStats.rewardsPot,
    previousRewardsPot: getWaitlistStatsFromRows(previousWeekRows, scope).rewardsPot,
  });

  const cabalProtection = rows
    .filter((row) => row.cabal)
    .map((row) => {
      const dashboard = getReferralDashboardFromRows(row.referral_code, rows, scope, now);
      if (!dashboard) return null;

      const fixed = calculateReferralProjection({
        data: dashboard,
        model: "fixed",
        prices: DEFAULT_PRICE_BY_BUCKET,
        conversions: DEFAULT_CONVERSION_BY_BUCKET,
      });
      const commission = calculateReferralProjection({
        data: dashboard,
        model: "commission",
        prices: DEFAULT_PRICE_BY_BUCKET,
        conversions: DEFAULT_CONVERSION_BY_BUCKET,
      });
      const identity = buildLeaderIdentity(dashboard.canonicalReferralCode, metadata);
      if (!identity) return null;

      return {
        name: identity.name,
        referralCode: dashboard.referralCode,
        canonicalReferralCode: dashboard.canonicalReferralCode,
        totalAttributedReferrals: dashboard.totalAttributedReferrals,
        projectedRevenue: roundZec(commission.projectedRevenue),
        fixedPayout: roundZec(fixed.projectedPayout),
        commissionPayout: roundZec(commission.projectedPayout),
        protectedDelta: roundZec(commission.projectedPayout - fixed.projectedPayout),
        commissionRate: commission.commissionRate,
        ...(() => {
          const nextTier = getNextCommissionTier(dashboard.totalAttributedReferrals);
          return {
            ...nextTier,
            nextTierProjectedPayout:
              nextTier.nextTierRate === null ? null : roundZec(commission.projectedRevenue * nextTier.nextTierRate),
          };
        })(),
      };
    })
    .filter((entry): entry is DashboardCabalProtectionEntry => Boolean(entry))
    .sort((a, b) => b.protectedDelta - a.protectedDelta || a.canonicalReferralCode.localeCompare(b.canonicalReferralCode));

  const zecChanges = {
    daily: buildZecChanges(metadata, currentZecMap, previousDailyZecMap),
    weekly: buildZecChanges(metadata, currentZecMap, previousWeeklyZecMap),
  };

  const funnel: DashboardReferralFunnel = {
    waitlist: waitlistStats.waitlist,
    referred: waitlistStats.referred,
    nonReferred: waitlistStats.waitlist - waitlistStats.referred,
    referredSharePct: safePct(waitlistStats.referred, waitlistStats.waitlist),
    nonReferredSharePct: safePct(waitlistStats.waitlist - waitlistStats.referred, waitlistStats.waitlist),
  };
  const shareworthyCallouts = buildShareworthyCallouts({
    streaks,
    newcomers,
    movers,
    leaderChanges,
    zecChanges,
    funnel,
  });
  const marketingHooks = buildSectionHooks({
    headlineKpis,
    streaks,
    newcomers,
    movers,
    dailyReview,
    weeklyReview,
    referralTree,
    leaderChanges,
    zecChanges,
    cabalProtection,
    shareworthyCallouts,
    funnel,
    currentDate,
  });

  return {
    generatedAt: now.toISOString(),
    scope,
    headlineKpis,
    streaks,
    newcomers,
    movers,
    dailyReview,
    weeklyReview,
    referralTree,
    leaderChanges,
    zecChanges,
    cabalProtection,
    funnel,
    shareworthyCallouts,
    marketingHooks,
  };
}

export function buildShareworthyStatsSnapshot(
  rows: WaitlistReferralRow[],
  scope: ReferralScope = "all",
  now = new Date(),
): ShareworthyStatsSnapshot {
  const marketing = buildMarketingDashboardSnapshot(rows, scope, now);
  const leaders = getLeadersDataFromRows(rows, scope, now);
  const leaderboardByCode = buildEntryMap(leaders.leaderboard);
  const latestDaily = leaders.dailyRankings.at(-1) ?? null;
  const latestWeekly = leaders.weeklyRankings.at(-1) ?? null;

  return {
    generatedAt: marketing.generatedAt,
    streakLeader: leaders.leaderboard.find((entry) => entry.streak) ?? null,
    topNewcomers: marketing.newcomers
      .map((entry) => leaderboardByCode.get(entry.canonicalReferralCode) ?? null)
      .filter((entry): entry is LeaderboardEntry => Boolean(entry)),
    topMovers: marketing.movers
      .map((entry) => leaderboardByCode.get(entry.canonicalReferralCode) ?? null)
      .filter((entry): entry is LeaderboardEntry => Boolean(entry)),
    dailyReview: latestDaily
      ? {
          date: latestDaily.date,
          topDailyLeader: latestDaily.daily[0]?.name ?? null,
          topAllTimeLeader: latestDaily.allTime[0]?.name ?? null,
          totalReferrals: latestDaily.totalCount,
          totalGrowthPct: latestDaily.totalGrowthPct,
        }
      : null,
    weeklyReview: latestWeekly
      ? {
          week: latestWeekly.week,
          topWeeklyLeader: latestWeekly.weekly[0]?.name ?? null,
          topAllTimeLeader: latestWeekly.allTime[0]?.name ?? null,
          totalReferrals: latestWeekly.totalCount,
          totalGrowthPct: latestWeekly.totalGrowthPct,
        }
      : null,
    leaderChanges: {
      allTime: marketing.leaderChanges.allTime.current?.name ?? null,
      daily: marketing.leaderChanges.daily.current?.name ?? null,
      weekly: marketing.leaderChanges.weekly.current?.name ?? null,
    },
    zecEarnedLeaders: leaders.leaderboard.slice(0, TOP_LIMIT).map((entry) => ({
      referralCode: entry.referral_code,
      canonicalReferralCode: entry.canonical_referral_code,
      projectedZec: entry.potential_rewards,
    })),
    cabalProtection: marketing.cabalProtection.map((entry) => ({
      referralCode: entry.referralCode,
      canonicalReferralCode: entry.canonicalReferralCode,
      totalAttributedReferrals: entry.totalAttributedReferrals,
      projectedRevenue: entry.projectedRevenue,
      fixedPayout: entry.fixedPayout,
      commissionPayout: entry.commissionPayout,
      protectedDelta: entry.protectedDelta,
      commissionRate: entry.commissionRate,
      referralsToNextTier: entry.referralsToNextTier,
      nextTierRate: entry.nextTierRate,
      nextTierProjectedPayout: entry.nextTierProjectedPayout,
    })),
  };
}
