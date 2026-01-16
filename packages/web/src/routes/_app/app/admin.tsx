import * as Sentry from "@sentry/tanstackstart-react";
import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Check, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminStats, getAdminUsers, getSession, updateUserRole } from "../../../lib/server-functions";
import { userRoles, type UserRole } from "../../../db/schema";

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

function UserRoleSelect({ userId, initialRole }: { userId: string; initialRole: UserRole }) {
  const [role, setRole] = useState(initialRole);
  const [isLoading, setIsLoading] = useState(false);
  const [showCheck, setShowCheck] = useState(false);

  async function handleRoleChange(newRole: string) {
    if (newRole === role) return;

    setIsLoading(true);
    try {
      await updateUserRole({ data: { userId, role: newRole } });
      setRole(newRole as UserRole);
      setShowCheck(true);
      setTimeout(() => setShowCheck(false), 2000);
    } catch (error) {
      console.error("Failed to update role:", error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={role} onValueChange={handleRoleChange} disabled={isLoading}>
        <SelectTrigger className="w-[100px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {userRoles.map((r) => (
            <SelectItem key={r} value={r} className="text-xs">
              {r}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      {showCheck && !isLoading && <Check className="size-4 text-green-500" />}
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground">Overview of all users and system statistics.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted"
            onClick={() => {
              throw new Error("Sentry Test Error (Client)");
            }}
          >
            Test Sentry (Client)
          </button>
          <button
            type="button"
            className="border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted"
            onClick={async () => {
              await Sentry.startSpan({ name: "Test API Span", op: "test" }, async () => {
                const res = await fetch("/api/sentry-test");
                if (!res.ok) {
                  throw new Error("Sentry Test Error (Frontend)");
                }
              });
            }}
          >
            Test Sentry (API)
          </button>
        </div>
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
                    <UserRoleSelect userId={user.id} initialRole={user.role as UserRole} />
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
