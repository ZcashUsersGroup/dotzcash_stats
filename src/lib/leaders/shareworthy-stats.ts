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
  fixedPayout: number;
  commissionPayout: number;
  protectedDelta: number;
  commissionRate: number;
}

export interface DashboardReferralFunnel {
  waitlist: number;
  referred: number;
  nonReferred: number;
  referredSharePct: number;
  nonReferredSharePct: number;
}

export type DashboardSectionId =
  | "overview"
  | "streaks"
  | "newcomers"
  | "movers"
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
    fixedPayout: number;
    commissionPayout: number;
    protectedDelta: number;
    commissionRate: number;
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

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDate(date);
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

function buildHook(id: string, label: string, defaultText: string): DashboardMarketingHook {
  return { id, label, defaultText };
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
        `${args.streaks.currentLeader.name} is stacking a ${args.streaks.streakLength}-day run as the referral leader.`,
      ),
    );
  }

  if (args.newcomers[0]) {
    callouts.push(
      buildHook(
        `shareworthy:newcomer:${args.newcomers[0].canonicalReferralCode}`,
        "Newcomer breakout",
        `${args.newcomers[0].name} broke into the mix with ${args.newcomers[0].current7DayAttributedReferrals} attributed referrals in 7 days.`,
      ),
    );
  }

  if (args.movers[0]) {
    callouts.push(
      buildHook(
        `shareworthy:mover:${args.movers[0].canonicalReferralCode}`,
        "Mover acceleration",
        `${args.movers[0].name} just posted the biggest weekly jump at +${args.movers[0].gain} attributed referrals.`,
      ),
    );
  }

  if (args.leaderChanges.weekly.changed && args.leaderChanges.weekly.current && args.leaderChanges.weekly.previous) {
    callouts.push(
      buildHook(
        `shareworthy:weekly-flip:${args.leaderChanges.weekly.current.canonicalReferralCode}`,
        "Weekly lead flip",
        `${args.leaderChanges.weekly.current.name} just passed ${args.leaderChanges.weekly.previous.name} for the weekly lead.`,
      ),
    );
  }

  if (args.zecChanges.weekly[0]) {
    callouts.push(
      buildHook(
        `shareworthy:zec:${args.zecChanges.weekly[0].canonicalReferralCode}`,
        "Payout momentum",
        `${args.zecChanges.weekly[0].name} added the largest projected weekly payout swing at +${args.zecChanges.weekly[0].delta} ZEC.`,
      ),
    );
  }

  callouts.push(
    buildHook(
      "shareworthy:funnel",
      "Referral mix",
      `${args.funnel.referredSharePct}% of verified signups are referral-driven, with ${args.funnel.nonReferred} more non-referred signups still open to activate.`,
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
  leaderChanges: MarketingDashboardSnapshot["leaderChanges"];
  zecChanges: MarketingDashboardSnapshot["zecChanges"];
  cabalProtection: DashboardCabalProtectionEntry[];
  shareworthyCallouts: DashboardMarketingHook[];
  funnel: DashboardReferralFunnel;
}): DashboardMarketingHooks {
  const overviewItems = [
    buildHook("overview:waitlist", "Waitlist", `${args.headlineKpis.waitlist} verified signups are now on the waitlist, giving the campaign fresh surface area to convert.`),
    buildHook("overview:referred", "Referred", `${args.headlineKpis.referred} verified signups came through referrals, a ${args.headlineKpis.referredSharePct}% referral share.`),
    buildHook("overview:rewards-pot", "Rewards pot", `The projected rewards pot is already at ${roundZec(args.headlineKpis.rewardsPot).toFixed(4)} ZEC and climbing with every new referral.`),
    buildHook("overview:all-time-leader", "All-time leader", `${leaderDisplayName(args.headlineKpis.allTimeLeader)} is the all-time pace setter for attributed referrals.`),
    buildHook("overview:daily-leader", "Daily leader", `${leaderDisplayName(args.headlineKpis.dailyLeader)} is leading today's referral push.`),
    buildHook("overview:weekly-leader", "Weekly leader", `${leaderDisplayName(args.headlineKpis.weeklyLeader)} is setting the weekly pace on referrals.`),
  ];
  const streakItems = args.streaks.recentDailyWinners.map((entry) =>
    buildHook(
      `streaks:${entry.date}:${entry.leader.canonicalReferralCode}`,
      `${entry.date} winner`,
      `${entry.leader.name} owned ${entry.date} with ${entry.count} direct referrals${entry.badge ? ` and a ${entry.badge} badge finish` : ""}.`,
    ),
  );
  const newcomerItems = args.newcomers.map((entry) =>
    buildHook(
      `newcomers:${entry.canonicalReferralCode}`,
      entry.name,
      `${entry.name} turned a first referral into ${entry.current7DayAttributedReferrals} attributed signups in seven days and already sits at ${entry.totalAttributedReferrals} all-time.`,
    ),
  );
  const moverItems = args.movers.map((entry) =>
    buildHook(
      `movers:${entry.canonicalReferralCode}`,
      entry.name,
      `${entry.name} accelerated by +${entry.gain} attributed referrals week over week, reaching ${entry.current7DayAttributedReferrals} in the current window.`,
    ),
  );
  const zecItems = [
    ...args.zecChanges.daily.map((entry) =>
      buildHook(
        `zec-daily:${entry.canonicalReferralCode}`,
        `${entry.name} daily delta`,
        `${entry.name} added ${entry.delta.toFixed(4)} ZEC in projected daily payout momentum.`,
      ),
    ),
    ...args.zecChanges.weekly.map((entry) =>
      buildHook(
        `zec-weekly:${entry.canonicalReferralCode}`,
        `${entry.name} weekly delta`,
        `${entry.name} widened the weekly payout outlook by ${entry.delta.toFixed(4)} ZEC.`,
      ),
    ),
  ];
  const cabalItems = args.cabalProtection.map((entry) =>
    buildHook(
      `cabal:${entry.canonicalReferralCode}`,
      entry.name,
      `${entry.name} gains ${entry.protectedDelta.toFixed(4)} ZEC of protection under commission pricing versus the fixed model.`,
    ),
  );
  const funnelItems = [
    buildHook("funnel:referred", "Referred signups", `${args.funnel.referred} verified signups are referral-driven, accounting for ${args.funnel.referredSharePct}% of the funnel.`),
    buildHook("funnel:non-referred", "Non-referred signups", `${args.funnel.nonReferred} verified signups still have no referral tie, leaving room for activation plays.`),
    buildHook("funnel:waitlist", "Funnel waitlist", `${args.funnel.waitlist} verified signups define the current referral funnel baseline.`),
  ];

  return {
    sections: {
      overview: {
        section: buildHook(
          "section:overview",
          "Overview",
          `${leaderDisplayName(args.headlineKpis.weeklyLeader)} is setting the weekly pace while referrals already drive ${args.headlineKpis.referredSharePct}% of verified signups.`,
        ),
        items: overviewItems,
      },
      streaks: {
        section: buildHook(
          "section:streaks",
          "Streaks",
          args.streaks.currentLeader
            ? `${args.streaks.currentLeader.name} is defending a ${args.streaks.streakLength}-day streak, giving the campaign a repeatable daily winner story.`
            : "The streak board is still open, giving the next referrer a clean shot at owning the daily story.",
        ),
        items: streakItems,
      },
      newcomers: {
        section: buildHook(
          "section:newcomers",
          "Top newcomers",
          args.newcomers[0]
            ? `${args.newcomers[0].name} leads the latest wave of newcomer activation with ${args.newcomers[0].current7DayAttributedReferrals} attributed referrals in seven days.`
            : "No fresh newcomer breakout has landed in the current seven-day window yet.",
        ),
        items: newcomerItems,
      },
      movers: {
        section: buildHook(
          "section:movers",
          "Top movers",
          args.movers[0]
            ? `${args.movers[0].name} is the momentum story of the week after adding ${args.movers[0].gain} more attributed referrals than the prior window.`
            : "The mover board is flat right now, which makes the next gain especially visible.",
        ),
        items: moverItems,
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
            ? `${args.leaderChanges.weekly.current.name} flipped the weekly leaderboard away from ${args.leaderChanges.weekly.previous.name}.`
            : `${leaderDisplayName(args.leaderChanges.weekly.current)} is holding the weekly top spot without a leaderboard shakeup.`,
        ),
        items: [],
      },
      "zec-changes": {
        section: buildHook(
          "section:zec-changes",
          "ZEC changes",
          args.zecChanges.weekly[0]
            ? `${args.zecChanges.weekly[0].name} leads projected payout growth with a ${args.zecChanges.weekly[0].delta.toFixed(4)} ZEC weekly lift.`
            : "Projected ZEC payouts are stable right now, with no positive delta leader yet.",
        ),
        items: zecItems,
      },
      "cabal-protection": {
        section: buildHook(
          "section:cabal-protection",
          "Cabal protection",
          args.cabalProtection[0]
            ? `${args.cabalProtection[0].name} benefits most from commission protection at +${args.cabalProtection[0].protectedDelta.toFixed(4)} ZEC over fixed pricing.`
            : "No cabal protection edge is visible in the current verified data set.",
        ),
        items: cabalItems,
      },
      shareworthy: {
        section: buildHook(
          "section:shareworthy",
          "Shareworthy callouts",
          args.shareworthyCallouts[0]?.defaultText ?? "The dashboard is ready to surface its next shareable referral story.",
        ),
        items: args.shareworthyCallouts,
      },
      funnel: {
        section: buildHook(
          "section:funnel",
          "Referral funnel",
          `${args.funnel.referredSharePct}% of verified signups are referral-led, while ${args.funnel.nonReferred} signups remain open to conversion nudges.`,
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
        fixedPayout: roundZec(fixed.projectedPayout),
        commissionPayout: roundZec(commission.projectedPayout),
        protectedDelta: roundZec(commission.projectedPayout - fixed.projectedPayout),
        commissionRate: commission.commissionRate,
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
    leaderChanges,
    zecChanges,
    cabalProtection,
    shareworthyCallouts,
    funnel,
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
      fixedPayout: entry.fixedPayout,
      commissionPayout: entry.commissionPayout,
      protectedDelta: entry.protectedDelta,
      commissionRate: entry.commissionRate,
    })),
  };
}
