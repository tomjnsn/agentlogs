import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getTeam,
  getTeamDashboardStats,
  getTeamDailyActivity,
  getTeamMembersWithStats,
  getTeamModelUsage,
  getTeamDailyLines,
  getTeamDailyAgentUsage,
  getTeamMembersDailyActivity,
  getTeamMembersAgentUsage,
} from "@/lib/server-functions";
import { formatCompactNumber, getModelDisplayName, getAgentDisplayName } from "@/lib/formatters";

type Period = "today" | "week" | "month";

export const Route = createFileRoute("/_app/app/team/dashboard")({
  loader: async () => {
    const team = await getTeam();

    if (!team) {
      // No team - redirect to team page to create/join one
      throw redirect({ to: "/app/team" });
    }

    const [
      stats,
      dailyActivity,
      members,
      modelUsage,
      dailyLines,
      dailyAgentUsage,
      membersDailyActivity,
      membersAgentUsage,
    ] = await Promise.all([
      getTeamDashboardStats({ data: { teamId: team.id, period: "week" } }),
      getTeamDailyActivity({ data: { teamId: team.id, days: 365 } }),
      getTeamMembersWithStats({ data: { teamId: team.id, period: "week" } }),
      getTeamModelUsage({ data: { teamId: team.id, period: "week" } }),
      getTeamDailyLines({ data: { teamId: team.id, days: 30 } }),
      getTeamDailyAgentUsage({ data: { teamId: team.id, days: 30 } }),
      getTeamMembersDailyActivity({ data: { teamId: team.id, days: 7 } }),
      getTeamMembersAgentUsage({ data: { teamId: team.id, period: "week" } }),
    ]);

    return {
      team,
      stats,
      dailyActivity,
      members,
      modelUsage,
      dailyLines,
      dailyAgentUsage,
      membersDailyActivity,
      membersAgentUsage,
    };
  },
  component: TeamDashboardPage,
});

function TeamDashboardPage() {
  const initialData = Route.useLoaderData();
  const [period, setPeriod] = useState<Period>("week");
  const [stats, setStats] = useState(initialData.stats);
  const [members, setMembers] = useState(initialData.members);
  const [modelUsage, setModelUsage] = useState(initialData.modelUsage);
  const [dailyAgentUsage, setDailyAgentUsage] = useState(initialData.dailyAgentUsage);
  const [membersDailyActivity, setMembersDailyActivity] = useState(initialData.membersDailyActivity);
  const [membersAgentUsage, setMembersAgentUsage] = useState(initialData.membersAgentUsage);
  const [isLoading, setIsLoading] = useState(false);

  const getPeriodDays = (p: Period) => {
    switch (p) {
      case "today":
        return 1;
      case "week":
        return 7;
      case "month":
        return 30;
    }
  };

  const handlePeriodChange = async (newPeriod: Period) => {
    setPeriod(newPeriod);
    setIsLoading(true);
    try {
      const days = getPeriodDays(newPeriod);
      const [newStats, newMembers, newModelUsage, newDailyAgentUsage, newMembersDailyActivity, newMembersAgentUsage] =
        await Promise.all([
          getTeamDashboardStats({ data: { teamId: initialData.team.id, period: newPeriod } }),
          getTeamMembersWithStats({ data: { teamId: initialData.team.id, period: newPeriod } }),
          getTeamModelUsage({ data: { teamId: initialData.team.id, period: newPeriod } }),
          getTeamDailyAgentUsage({ data: { teamId: initialData.team.id, days } }),
          getTeamMembersDailyActivity({ data: { teamId: initialData.team.id, days } }),
          getTeamMembersAgentUsage({ data: { teamId: initialData.team.id, period: newPeriod } }),
        ]);
      setStats(newStats);
      setMembers(newMembers);
      setModelUsage(newModelUsage);
      setDailyAgentUsage(newDailyAgentUsage);
      setMembersDailyActivity(newMembersDailyActivity);
      setMembersAgentUsage(newMembersAgentUsage);
    } finally {
      setIsLoading(false);
    }
  };

  const team = initialData.team;

  return (
    <div className="container max-w-4xl space-y-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl">{team.name}</h1>
          <p className="text-sm text-muted-foreground">
            {team.members.length} member{team.members.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Select value={period} onValueChange={(v) => handlePeriodChange(v as Period)}>
          <SelectTrigger className="h-8 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Stats (no cost) */}
      <div className={`rounded-lg border bg-card p-4 ${isLoading ? "opacity-50" : ""}`}>
        <TeamSummary
          period={period}
          sessionCount={stats.sessionCount}
          linesAdded={stats.linesAdded}
          linesRemoved={stats.linesRemoved}
          linesModified={stats.linesModified}
        />
      </div>

      {/* Activity Line Chart */}
      <div className="rounded-lg border bg-card p-4">
        <ActivityLineChart data={initialData.dailyActivity} />
      </div>

      {/* Agent Sparklines & Prompts by Model (side by side) */}
      <div className={`grid grid-cols-2 gap-4 ${isLoading ? "opacity-50" : ""}`}>
        <div className="rounded-lg border bg-card p-4">
          <AgentSparklines data={dailyAgentUsage} period={period} />
        </div>
        <div className="rounded-lg border bg-card p-4">
          <ModelUsageChart data={modelUsage} />
        </div>
      </div>

      {/* Lines Changed (Stacked Bar Chart) */}
      <div className="rounded-lg border bg-card p-4">
        <LinesAreaChart data={initialData.dailyLines} />
      </div>

      {/* Team Members Table */}
      <div className={`rounded-lg border bg-card p-4 ${isLoading ? "opacity-50" : ""}`}>
        <TeamMembersTable
          members={members}
          membersDailyActivity={membersDailyActivity}
          membersAgentUsage={membersAgentUsage}
          period={period}
        />
      </div>
    </div>
  );
}

// =============================================================================
// Team Summary Component (no cost metrics)
// =============================================================================

interface TeamSummaryProps {
  period: Period;
  sessionCount: number;
  linesAdded: number;
  linesRemoved: number;
  linesModified: number;
}

function getPeriodLabel(period: Period): string {
  switch (period) {
    case "today":
      return "Today";
    case "week":
      return "This Week";
    case "month":
      return "This Month";
  }
}

function TeamSummary({ period, sessionCount, linesAdded, linesRemoved, linesModified }: TeamSummaryProps) {
  if (sessionCount === 0) {
    return (
      <div>
        <div className="text-sm text-muted-foreground">{getPeriodLabel(period)}</div>
        <div className="mt-2 text-center text-muted-foreground">No activity yet</div>
      </div>
    );
  }

  return (
    <div>
      <div className="font-mono text-lg">
        <span className="text-muted-foreground">{getPeriodLabel(period)}:</span>
        <span className="ml-2 font-semibold">{sessionCount} transcripts</span>
      </div>
      <div className="mt-1 font-mono text-sm text-muted-foreground">
        <span className={linesAdded > 0 ? "text-green-500" : "text-muted-foreground"}>
          +{formatCompactNumber(linesAdded)}
        </span>
        <span className="mx-2">·</span>
        <span className={linesRemoved > 0 ? "text-red-500" : "text-muted-foreground"}>
          -{formatCompactNumber(linesRemoved)}
        </span>
        <span className="mx-2">·</span>
        <span className={linesModified > 0 ? "text-yellow-500" : "text-muted-foreground"}>
          ~{formatCompactNumber(linesModified)}
        </span>
        <span className="ml-1">lines</span>
      </div>
    </div>
  );
}

// =============================================================================
// Activity Line Chart Component
// =============================================================================

import { Area, AreaChart, XAxis, YAxis, ResponsiveContainer, Tooltip, BarChart, Bar } from "recharts";

interface DayActivity {
  date: string;
  count: number;
}

interface ActivityLineChartProps {
  data: DayActivity[];
}

function ActivityLineChart({ data }: ActivityLineChartProps) {
  // Show last 30 days for the line chart
  const last30 = data.slice(-30);

  if (last30.every((d) => d.count === 0)) {
    return (
      <div>
        <div className="mb-3 text-sm text-muted-foreground">Activity Trend</div>
        <div className="flex h-32 items-center justify-center text-muted-foreground">
          No activity in the last 30 days
        </div>
      </div>
    );
  }

  // Find max for better Y scaling
  const maxCount = Math.max(...last30.map((d) => d.count), 1);

  return (
    <div>
      <div className="mb-3 text-sm text-muted-foreground">Activity Trend (last 30 days)</div>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={last30} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="activityGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ffffff" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#ffffff" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }}
            tickFormatter={(d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis hide domain={[0, Math.max(maxCount * 1.2, 5)]} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const d = payload[0].payload as DayActivity;
              return (
                <div className="rounded border border-border bg-popover px-2 py-1 text-xs shadow-lg">
                  {new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}:{" "}
                  <strong>{d.count}</strong> session{d.count !== 1 ? "s" : ""}
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="#ffffff"
            strokeWidth={2}
            fill="url(#activityGradient)"
            dot={{ fill: "#ffffff", strokeWidth: 0, r: 3 }}
            activeDot={{ fill: "#ffffff", strokeWidth: 0, r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// =============================================================================
// Agent Sparklines Component
// =============================================================================

interface DailyAgentData {
  date: string;
  agent: string;
  count: number;
}

interface AgentSparklinesProps {
  data: DailyAgentData[];
  period: Period;
}

function getPeriodDaysCount(period: Period): number {
  switch (period) {
    case "today":
      return 1;
    case "week":
      return 7;
    case "month":
      return 30;
  }
}

function getPeriodDescription(period: Period): string {
  switch (period) {
    case "today":
      return "today";
    case "week":
      return "last 7 days";
    case "month":
      return "last 30 days";
  }
}

function AgentSparklines({ data, period }: AgentSparklinesProps) {
  const days = getPeriodDaysCount(period);

  // Generate all dates for the period
  const today = new Date();
  const allDates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    allDates.push(date.toISOString().split("T")[0]);
  }

  // Group data by agent
  const agentMap = new Map<string, Map<string, number>>();

  data.forEach((d) => {
    if (!agentMap.has(d.agent)) {
      agentMap.set(d.agent, new Map());
    }
    agentMap.get(d.agent)!.set(d.date, d.count);
  });

  // Build sparkline data per agent
  const agents = Array.from(agentMap.keys()).sort((a, b) => {
    // Sort by total count descending
    const totalA = Array.from(agentMap.get(a)!.values()).reduce((s, v) => s + v, 0);
    const totalB = Array.from(agentMap.get(b)!.values()).reduce((s, v) => s + v, 0);
    return totalB - totalA;
  });

  if (agents.length === 0) {
    return (
      <div>
        <div className="mb-3 text-sm text-muted-foreground">Agent Activity</div>
        <div className="flex h-16 items-center justify-center text-muted-foreground">No agent data</div>
      </div>
    );
  }

  const agentRows = agents.map((agent) => {
    const counts = allDates.map((d) => agentMap.get(agent)?.get(d) || 0);
    const total = counts.reduce((s, v) => s + v, 0);
    const max = Math.max(...counts, 1);

    return { agent, counts, total, max };
  });

  return (
    <div>
      <div className="mb-3 text-sm text-muted-foreground">Agent Activity ({getPeriodDescription(period)})</div>
      <div className="space-y-2">
        {agentRows.map(({ agent, counts, total, max }) => {
          return (
            <div key={agent} className="flex items-center gap-2">
              <span className="w-20 shrink-0 truncate font-mono text-xs text-muted-foreground">
                {getAgentDisplayName(agent)}
              </span>
              <div className="h-4 flex-1">
                <svg width="100%" height="100%" preserveAspectRatio="none">
                  {counts.map((c, i) => {
                    const height = max > 0 ? (c / max) * 100 : 0;
                    const barWidth = 100 / counts.length;
                    return (
                      <rect
                        key={i}
                        x={`${i * barWidth}%`}
                        y={`${100 - Math.max(height, 5)}%`}
                        width={`${barWidth}%`}
                        height={`${Math.max(height, 5)}%`}
                        fill="rgba(255,255,255,0.6)"
                      />
                    );
                  })}
                </svg>
              </div>
              <span className="w-8 shrink-0 text-right font-mono text-xs text-muted-foreground">{total}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// DailyLines interface (used by LinesAreaChart)
// =============================================================================

interface DailyLines {
  date: string;
  added: number;
  removed: number;
  modified: number;
}

// =============================================================================
// Lines Changed Chart (Stacked Bar with Log Scale)
// =============================================================================

interface LinesAreaChartProps {
  data: DailyLines[];
}

function LinesAreaChart({ data }: LinesAreaChartProps) {
  const last30 = data.slice(-30);

  const totalAdded = last30.reduce((s, d) => s + d.added, 0);
  const totalRemoved = last30.reduce((s, d) => s + d.removed, 0);
  const totalModified = last30.reduce((s, d) => s + d.modified, 0);

  if (totalAdded === 0 && totalRemoved === 0 && totalModified === 0) {
    return (
      <div>
        <div className="mb-3 text-sm text-muted-foreground">Lines Changed</div>
        <div className="flex h-32 items-center justify-center text-muted-foreground">
          No lines data in the last 30 days
        </div>
      </div>
    );
  }

  // Add log-scaled values for better visualization
  const chartData = last30.map((d) => ({
    ...d,
    // Use log scale: log(1 + value) to handle zeros
    addedLog: Math.log10(1 + d.added),
    removedLog: Math.log10(1 + d.removed),
    modifiedLog: Math.log10(1 + d.modified),
  }));

  // Calculate max log value for Y axis domain
  const maxLogValue = Math.max(...chartData.map((d) => d.addedLog + d.removedLog + d.modifiedLog), 1);
  const maxTick = Math.min(Math.ceil(maxLogValue) + 1, 4);

  return (
    <div>
      <div className="mb-3 text-sm text-muted-foreground">Lines Changed</div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: "rgba(255,255,255,0.5)" }}
            tickFormatter={(d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis hide domain={[0, maxTick]} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const original = last30.find((d) => d.date === label);
              return (
                <div className="rounded border border-border bg-popover px-2 py-1 text-xs shadow-lg">
                  <div className="mb-1">
                    {new Date(label).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                  <div className="text-green-500">+{original?.added ?? 0} added</div>
                  <div className="text-red-500">-{original?.removed ?? 0} removed</div>
                  <div className="text-yellow-500">~{original?.modified ?? 0} modified</div>
                </div>
              );
            }}
          />
          <Bar dataKey="addedLog" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
          <Bar dataKey="removedLog" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
          <Bar dataKey="modifiedLog" stackId="a" fill="#eab308" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex justify-center gap-4 text-xs">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-green-500"></span> Added
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-red-500"></span> Removed
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-yellow-500"></span> Modified
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// Model Usage Bar Chart Component
// =============================================================================

// BarChart and Bar imported above

interface ModelUsage {
  model: string;
  messageCount: number;
}

interface ModelUsageChartProps {
  data: ModelUsage[];
}

function ModelUsageChart({ data }: ModelUsageChartProps) {
  if (data.length === 0) {
    return (
      <div>
        <div className="mb-3 text-sm text-muted-foreground">Prompts by Model</div>
        <div className="flex h-32 items-center justify-center text-muted-foreground">No model data</div>
      </div>
    );
  }

  // Sort by count descending and take top 5
  const sorted = [...data].sort((a, b) => b.messageCount - a.messageCount).slice(0, 5);
  const maxCount = sorted[0]?.messageCount || 1;
  const barWidth = 20; // number of block characters

  return (
    <div>
      <div className="mb-3 text-sm text-muted-foreground">Prompts by Model</div>
      <div className="space-y-1 font-mono text-sm">
        {sorted.map((item) => {
          const filledBlocks = Math.round((item.messageCount / maxCount) * barWidth);
          const emptyBlocks = barWidth - filledBlocks;
          return (
            <div key={item.model} className="flex items-center gap-3">
              <span className="w-36 truncate text-foreground/90">{getModelDisplayName(item.model)}</span>
              <span className="text-foreground/70">
                {"█".repeat(filledBlocks)}
                <span className="text-foreground/20">{"░".repeat(emptyBlocks)}</span>
              </span>
              <span className="w-10 text-right text-foreground/50">{formatCompactNumber(item.messageCount)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Team Members Table Component (Enhanced with Sparklines)
// =============================================================================

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ClaudeCodeIcon, CodexIcon, OpenCodeIcon } from "@/components/icons/source-icons";

interface TeamMember {
  userId: string;
  name: string;
  image: string | null;
  transcriptCount: number;
  linesAdded: number;
  linesRemoved: number;
  linesModified: number;
  commitCount: number;
}

interface MemberDailyActivity {
  userId: string;
  date: string;
  count: number;
}

interface MemberAgentUsage {
  userId: string;
  agent: string;
  count: number;
}

interface TeamMembersTableProps {
  members: TeamMember[];
  membersDailyActivity: MemberDailyActivity[];
  membersAgentUsage: MemberAgentUsage[];
  period: Period;
}

// Agent icon components
const AGENT_ICONS: Record<string, React.FC<{ className?: string }>> = {
  "claude-code": ClaudeCodeIcon,
  codex: CodexIcon,
  opencode: OpenCodeIcon,
};

function TeamMembersTable({ members, membersDailyActivity, membersAgentUsage, period }: TeamMembersTableProps) {
  if (members.length === 0) {
    return (
      <div>
        <div className="mb-3 text-sm text-muted-foreground">Team Members</div>
        <div className="text-center text-muted-foreground">No members found</div>
      </div>
    );
  }

  // Sort by transcript count descending
  const sorted = [...members].sort((a, b) => b.transcriptCount - a.transcriptCount);

  // Get days for period
  const days = period === "today" ? 1 : period === "week" ? 7 : 30;

  // Generate all dates for sparklines
  const today = new Date();
  const allDates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    allDates.push(date.toISOString().split("T")[0]);
  }

  // Group daily activity by user
  const activityByUser = new Map<string, Map<string, number>>();
  membersDailyActivity.forEach((d) => {
    if (!activityByUser.has(d.userId)) {
      activityByUser.set(d.userId, new Map());
    }
    activityByUser.get(d.userId)!.set(d.date, d.count);
  });

  // Group agent usage by user
  const agentsByUser = new Map<string, { agent: string; count: number }[]>();
  membersAgentUsage.forEach((d) => {
    if (!agentsByUser.has(d.userId)) {
      agentsByUser.set(d.userId, []);
    }
    agentsByUser.get(d.userId)!.push({ agent: d.agent, count: d.count });
  });

  return (
    <div>
      <div className="mb-3 text-sm text-muted-foreground">Team Members</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="pb-2 text-left font-normal">User</th>
            <th className="pb-2 pl-3 text-left font-normal">Activity</th>
            <th className="pb-2 pl-3 text-left font-normal">Agents</th>
            <th className="pb-2 text-right font-normal">Sessions</th>
            <th className="pb-2 text-right font-normal">Lines</th>
            <th className="pb-2 text-right font-normal">Commits</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((member) => {
            // Build sparkline data for this member
            const userActivity = activityByUser.get(member.userId) || new Map();
            const counts = allDates.map((d) => userActivity.get(d) || 0);
            const maxCount = Math.max(...counts, 1);

            // Build agent breakdown for this member
            const userAgents = agentsByUser.get(member.userId) || [];
            const sortedAgents = [...userAgents].sort((a, b) => b.count - a.count);

            return (
              <tr key={member.userId} className="border-b border-border/50">
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={member.image || undefined} />
                      <AvatarFallback className="text-[10px]">{member.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="max-w-[120px] truncate">{member.name}</span>
                  </div>
                </td>
                <td className="py-2 pl-3">
                  {/* Activity Sparkline - SVG mini bar chart */}
                  {counts.every((c) => c === 0) ? (
                    <span className="text-muted-foreground/50">—</span>
                  ) : (
                    <div className="h-4 w-20">
                      <svg width="100%" height="100%" preserveAspectRatio="none">
                        {counts.map((c, i) => {
                          const height = maxCount > 0 ? (c / maxCount) * 100 : 0;
                          const barWidth = 100 / counts.length;
                          return (
                            <rect
                              key={i}
                              x={`${i * barWidth}%`}
                              y={`${100 - height}%`}
                              width={`${barWidth}%`}
                              height={`${height}%`}
                              fill={c > 0 ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.1)"}
                            />
                          );
                        })}
                      </svg>
                    </div>
                  )}
                </td>
                <td className="py-2 pl-3">
                  {/* Agent Breakdown - real icons with counts */}
                  {sortedAgents.length === 0 ? (
                    <span className="text-muted-foreground/50">—</span>
                  ) : (
                    <div className="flex items-center gap-3 font-mono text-xs">
                      {sortedAgents.slice(0, 3).map((a) => {
                        const IconComponent = AGENT_ICONS[a.agent];
                        return (
                          <span
                            key={a.agent}
                            className="flex items-center gap-1 text-foreground/70"
                            title={getAgentDisplayName(a.agent)}
                          >
                            {IconComponent ? (
                              <IconComponent className="h-3.5 w-3.5 text-foreground/60" />
                            ) : (
                              <span className="text-foreground/50">○</span>
                            )}
                            <span>{a.count}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </td>
                <td className="py-2 text-right">{member.transcriptCount}</td>
                <td className="py-2 text-right">
                  <span className={member.linesAdded > 0 ? "text-green-500" : "text-muted-foreground"}>
                    +{formatCompactNumber(member.linesAdded)}
                  </span>
                  <span className="mx-1 text-muted-foreground">/</span>
                  <span className={member.linesRemoved > 0 ? "text-red-500" : "text-muted-foreground"}>
                    -{formatCompactNumber(member.linesRemoved)}
                  </span>
                </td>
                <td className="py-2 text-right">{member.commitCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
