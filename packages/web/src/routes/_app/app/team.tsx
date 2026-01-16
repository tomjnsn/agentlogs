import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import {
  addMemberByEmail,
  createTeam,
  deleteTeam,
  generateInvite,
  getSession,
  getTeam,
  leaveTeam,
  removeMember,
} from "../../../lib/server-functions";

export const Route = createFileRoute("/_app/app/team")({
  loader: async () => {
    const [team, session] = await Promise.all([getTeam(), getSession()]);
    return { team, session };
  },
  component: TeamPage,
});

function TeamPage() {
  const { team, session } = Route.useLoaderData();
  const router = useRouter();

  const refresh = () => router.invalidate();

  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const handleCreateTeam = async () => {
    setIsCreating(true);
    try {
      await createTeam();
      refresh();
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteTeam = async () => {
    if (!team || !confirm("Are you sure you want to delete this team? All members will be removed.")) return;
    setIsDeleting(true);
    try {
      await deleteTeam({ data: team.id });
      refresh();
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLeaveTeam = async () => {
    if (!team || !confirm("Are you sure you want to leave this team?")) return;
    setIsLeaving(true);
    try {
      await leaveTeam({ data: team.id });
      refresh();
    } finally {
      setIsLeaving(false);
    }
  };

  if (!team) {
    return <NoTeamView onCreateTeam={handleCreateTeam} isCreating={isCreating} />;
  }

  const isOwner = session?.user?.id === team.ownerId;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{team.name}</h1>
          <p className="text-muted-foreground">
            {team.members.length} member{team.members.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {isOwner ? (
            <Button variant="destructive" onClick={handleDeleteTeam} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete Team"}
            </Button>
          ) : (
            <Button variant="outline" onClick={handleLeaveTeam} disabled={isLeaving}>
              {isLeaving ? "Leaving..." : "Leave Team"}
            </Button>
          )}
        </div>
      </div>

      {/* Invite Section (owner only) */}
      {isOwner && <InviteSection teamId={team.id} />}

      {/* Add Member Section (owner only) */}
      {isOwner && <AddMemberSection teamId={team.id} onSuccess={refresh} />}

      {/* Members List */}
      <MembersList team={team} isOwner={isOwner} onMemberRemoved={refresh} />
    </div>
  );
}

function NoTeamView({ onCreateTeam, isCreating }: { onCreateTeam: () => void; isCreating: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="text-center space-y-4 max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">No Team Yet</h1>
        <p className="text-muted-foreground">
          Create a team to share transcripts with colleagues. Team members can see each other's team-shared transcripts.
        </p>
        <Button onClick={onCreateTeam} disabled={isCreating} size="lg">
          {isCreating ? "Creating..." : "Create Team"}
        </Button>
      </div>
    </div>
  );
}

type TeamData = NonNullable<Awaited<ReturnType<typeof getTeam>>>;

function InviteSection({ teamId }: { teamId: string }) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateInvite = async () => {
    setIsGenerating(true);
    try {
      const data = await generateInvite({ data: teamId });
      const baseUrl = window.location.origin;
      setInviteUrl(`${baseUrl}${data.url}`);
      setExpiresAt(new Date(data.expiresAt));
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    if (inviteUrl) {
      navigator.clipboard.writeText(inviteUrl);
    }
  };

  return (
    <div className="border border-border bg-card p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Invite Link</h2>
        <p className="text-sm text-muted-foreground">Generate a link to invite others to join your team.</p>
      </div>

      {inviteUrl ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input value={inviteUrl} readOnly className="font-mono text-sm" />
            <Button variant="outline" onClick={copyToClipboard}>
              Copy
            </Button>
          </div>
          {expiresAt && <p className="text-sm text-muted-foreground">Expires {expiresAt.toLocaleDateString()}</p>}
          <Button variant="outline" onClick={handleGenerateInvite} disabled={isGenerating}>
            Generate New Link
          </Button>
        </div>
      ) : (
        <Button onClick={handleGenerateInvite} disabled={isGenerating}>
          {isGenerating ? "Generating..." : "Generate Invite Link"}
        </Button>
      )}
    </div>
  );
}

function AddMemberSection({ teamId, onSuccess }: { teamId: string; onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsAdding(true);
    setError(null);
    try {
      await addMemberByEmail({ data: { teamId, email } });
      setEmail("");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="border border-border bg-card p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Add Member by Email</h2>
        <p className="text-sm text-muted-foreground">Add existing users directly by their email address.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          type="email"
          placeholder="colleague@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          className="flex-1"
        />
        <Button type="submit" disabled={isAdding || !email.trim()}>
          {isAdding ? "Adding..." : "Add"}
        </Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function MembersList({
  team,
  isOwner,
  onMemberRemoved,
}: {
  team: TeamData;
  isOwner: boolean;
  onMemberRemoved: () => void;
}) {
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleRemoveMember = async (targetUserId: string, memberName: string) => {
    if (!confirm(`Remove ${memberName} from the team?`)) return;

    setRemovingId(targetUserId);
    try {
      await removeMember({ data: { teamId: team.id, targetUserId } });
      onMemberRemoved();
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Members</h2>
      <div className="border border-border divide-y divide-border">
        {team.members.map((member) => {
          const isMemberOwner = member.userId === team.ownerId;
          return (
            <div key={member.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Avatar className="size-10">
                  <AvatarImage src={member.user.image ?? undefined} alt={member.user.name} />
                  <AvatarFallback>{member.user.name?.charAt(0) ?? "?"}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{member.user.name}</span>
                    {isMemberOwner && <Badge variant="secondary">Owner</Badge>}
                  </div>
                  <span className="text-sm text-muted-foreground">{member.user.email}</span>
                </div>
              </div>

              {/* Remove button (owner can remove others, but not self) */}
              {isOwner && !isMemberOwner && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveMember(member.userId, member.user.name)}
                  disabled={removingId === member.userId}
                >
                  {removingId === member.userId ? "Removing..." : "Remove"}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
