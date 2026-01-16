import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { acceptInvite, getInviteInfo, getSession } from "../../lib/server-functions";

export const Route = createFileRoute("/_app/join/$code")({
  loader: async ({ params }) => {
    const [invite, session] = await Promise.all([getInviteInfo({ data: params.code }), getSession()]);
    return { invite, session, code: params.code };
  },
  component: JoinPage,
});

function JoinPage() {
  const { invite, session, code } = Route.useLoaderData();
  const navigate = useNavigate();
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    setIsJoining(true);
    setError(null);
    try {
      await acceptInvite({ data: code });
      navigate({ to: "/app/team" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join team");
    } finally {
      setIsJoining(false);
    }
  };

  // Not logged in
  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="text-center space-y-4 max-w-md">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to Join</h1>
          <p className="text-muted-foreground">You need to be signed in to accept this team invite.</p>
          <Button asChild size="lg">
            <Link to="/">Sign In</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Invalid or not found invite
  if (!invite) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="text-center space-y-4 max-w-md">
          <h1 className="text-2xl font-semibold tracking-tight">Invite Not Found</h1>
          <p className="text-muted-foreground">
            This invite link is invalid or has been revoked. Please ask for a new invite.
          </p>
          <Button asChild variant="outline">
            <Link to="/app">Go to Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Expired invite
  if (invite.expired) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="text-center space-y-4 max-w-md">
          <h1 className="text-2xl font-semibold tracking-tight">Invite Expired</h1>
          <p className="text-muted-foreground">
            This invite link has expired. Please ask the team owner for a new one.
          </p>
          <Button asChild variant="outline">
            <Link to="/app">Go to Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Valid invite - show join UI
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="text-center space-y-6 max-w-md">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Join {invite.teamName}</h1>
          <p className="text-muted-foreground">
            {invite.ownerName} has invited you to join their team.
            <br />
            {invite.memberCount} member{invite.memberCount !== 1 ? "s" : ""} currently.
          </p>
        </div>

        <div className="space-y-2">
          <Button size="lg" onClick={handleJoin} disabled={isJoining} className="w-full">
            {isJoining ? "Joining..." : "Join Team"}
          </Button>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <Button asChild variant="link" className="text-muted-foreground">
          <Link to="/app">Cancel</Link>
        </Button>
      </div>
    </div>
  );
}
