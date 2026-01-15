import { createFileRoute, redirect } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminStats, getAdminUsers, getSession } from "../../../lib/server-functions";

export const Route = createFileRoute("/_app/app/admin")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      throw redirect({ to: "/app" });
    }
  },
  loader: async () => {
    const [stats, users] = await Promise.all([getAdminStats(), getAdminUsers()]);
    return { stats, users };
  },
  component: AdminPage,
});

function StatCard({ title, value, description }: { title: string; value: string | number; description?: string }) {
  return (
    <div className="border border-border bg-card p-6">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

function AdminPage() {
  const { stats, users } = Route.useLoaderData();

  const formatCost = (cost: number) => `$${cost.toFixed(2)}`;
  const formatNumber = (num: number) => num.toLocaleString();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">Overview of all users and system statistics.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Users" value={formatNumber(stats.totalUsers ?? 0)} />
        <StatCard title="Waitlist" value={formatNumber(stats.waitlistUsers ?? 0)} description="Pending approval" />
        <StatCard title="Active Users" value={formatNumber(stats.activeUsers ?? 0)} description="With access" />
        <StatCard title="Admins" value={formatNumber(stats.adminUsers ?? 0)} description="Full access" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Transcripts" value={formatNumber(stats.totalTranscripts ?? 0)} />
        <StatCard title="Total Repositories" value={formatNumber(stats.totalRepos ?? 0)} />
        <StatCard title="Total Tokens" value={formatNumber(stats.totalTokens ?? 0)} description="All time usage" />
        <StatCard title="Total Cost" value={formatCost(stats.totalCost ?? 0)} description="Estimated API cost" />
      </div>

      {/* Users Table */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">All Users</h2>
        <div className="border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[250px]">User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Transcripts</TableHead>
                <TableHead className="text-right">Total Cost</TableHead>
                <TableHead className="text-right">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarImage src={user.image ?? undefined} alt={user.name} />
                        <AvatarFallback>{user.name?.charAt(0) ?? "?"}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{user.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === "admin" ? "default" : user.role === "user" ? "secondary" : "outline"}>
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{user.transcriptCount}</TableCell>
                  <TableCell className="text-right font-mono">{formatCost(user.totalCost ?? 0)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
