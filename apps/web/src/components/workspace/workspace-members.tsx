"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authClient } from "@/lib/auth-client";
import {
  UserAdd01Icon,
  UserGroupIcon,
  UserMinus01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

type OrganizationMember = {
  id: string;
  userId: string;
  role: string;
  user?: { name?: string | null; email?: string | null; image?: string | null };
  email?: string;
};

type WorkspaceOrganization = {
  id: string;
  name: string;
  members?: unknown[];
  invitations?: unknown[];
};

type WorkspaceSession = {
  user?: { id?: string; name?: string | null; email?: string | null };
};

type WorkspaceRole = {
  key: string;
  name: string;
  permissions: Array<{ resource: string; action: string }>;
};

export function WorkspaceMembers({
  organization,
  session,
  isPending,
  refetchOrganization,
}: {
  organization?: WorkspaceOrganization | null;
  session?: WorkspaceSession | null;
  isPending: boolean;
  refetchOrganization?: () => Promise<unknown>;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [busy, setBusy] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const { data: roleData } = useSWR<{ roles: WorkspaceRole[] }>(
    organization?.id ? "/api/workspace/roles" : null,
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Unable to load workspace roles");
      return response.json();
    },
  );
  const organizationApi = authClient.organization as unknown as Record<
    string,
    (input: Record<string, unknown>) => Promise<unknown>
  >;

  const run = async (
    action: string,
    input: Record<string, unknown>,
    success: string,
  ) => {
    const method = organizationApi[action];
    if (!method) {
      toast.error("Organization membership actions are unavailable");
      return;
    }
    setBusy(true);
    try {
      const result = await method(input);
      if ((result as { error?: unknown })?.error)
        throw new Error("The organization service rejected this request");
      await refetchOrganization?.();
      toast.success(success);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update workspace membership",
      );
    } finally {
      setBusy(false);
    }
  };

  const requestMemberRoleUpdate = async (memberId: string, roleKey: string) => {
    const response = await fetch(`/api/workspace/members/${memberId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleKey }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        payload?.message ?? payload?.error ?? "Unable to update member role",
      );
    }
  };

  const updateMemberRole = async (memberId: string, roleKey: string) => {
    setBusy(true);
    try {
      await requestMemberRoleUpdate(memberId, roleKey);
      await refetchOrganization?.();
      toast.success("Role updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update member role",
      );
    } finally {
      setBusy(false);
    }
  };

  if (isPending)
    return (
      <div className="text-sm text-muted-foreground">
        Loading workspace members…
      </div>
    );
  if (!organization)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={UserGroupIcon} />
          </EmptyMedia>
          <EmptyTitle>No active workspace</EmptyTitle>
          <EmptyDescription>
            Select a workspace before managing membership.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  const members = (organization.members ?? []) as OrganizationMember[];
  const invitations = (organization.invitations ?? []) as Array<{
    id: string;
    email: string;
    role: string;
  }>;
  const currentMember = members.find(
    (member) => member.userId === session?.user?.id,
  );
  const ownerCount = members.filter((member) =>
    member.role
      .split(",")
      .map((value) => value.trim())
      .includes("owner"),
  ).length;
  const isWorkspaceOwner = Boolean(
    currentMember?.role
      .split(",")
      .map((value) => value.trim())
      .includes("owner"),
  );
  const currentRole = roleData?.roles.find(
    (item) => item.key === currentMember?.role,
  );
  const canManageTeam =
    currentMember?.role === "owner" ||
    currentMember?.role === "admin" ||
    Boolean(
      currentRole?.permissions.some(
        (permission) =>
          (permission.resource === "member" &&
            ["create", "update"].includes(permission.action)) ||
          (permission.resource === "workspace" &&
            permission.action === "manage"),
      ),
    );
  const assignableRoles = (roleData?.roles ?? []).filter(
    (item) => item.key !== "owner" || isWorkspaceOwner,
  );
  const roleOptions = assignableRoles.length
    ? assignableRoles
    : [
        { key: "member", name: "Member", permissions: [] },
        { key: "admin", name: "Admin", permissions: [] },
      ];
  const roleName = (roleKey: string) =>
    roleData?.roles.find((item) => item.key === roleKey)?.name ??
    (roleKey === "owner" ? "Owner" : roleKey === "admin" ? "Admin" : "Member");

  const leaveWorkspace = async () => {
    if (!organization || !currentMember) return;
    setBusy(true);
    try {
      if (isWorkspaceOwner) {
        if (ownerCount < 2) {
          throw new Error(
            "Promote another member to owner before leaving this workspace.",
          );
        }
        // Better Auth prevents owners from leaving. Once another owner exists,
        // safely demote this owner first, then use Better Auth's leave endpoint.
        await requestMemberRoleUpdate(currentMember.id, "admin");
      }

      const leave = (await organizationApi.leave({
        organizationId: organization.id,
      })) as { error?: { message?: string } | null };
      if (leave?.error) {
        throw new Error(leave.error.message ?? "Unable to leave workspace");
      }
      const active = (await organizationApi.setActive({
        organizationId: null,
      })) as { error?: { message?: string } | null };
      if (active?.error) {
        throw new Error(
          active.error.message ?? "Unable to switch away from this workspace",
        );
      }
      setLeaveOpen(false);
      await refetchOrganization?.();
      toast.success("You left the workspace");
      router.replace("/chat");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to leave workspace",
      );
      await refetchOrganization?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Invite people</CardTitle>
          <CardDescription>
            Members can collaborate across chats, agents, knowledge, and
            workspace resources.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-end">
              <Field>
                <FieldLabel htmlFor="workspace-invite-email">
                  Email address
                </FieldLabel>
                <Input
                  id="workspace-invite-email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="member@example.com"
                  type="email"
                  value={email}
                />
                <FieldDescription>
                  They will receive an invitation to this workspace.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Role</FieldLabel>
                <Select
                  onValueChange={(value) => setRole(String(value))}
                  value={role}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Button
                disabled={busy || !canManageTeam || !email.trim()}
                onClick={() =>
                  void run(
                    "inviteMember",
                    {
                      email: email.trim(),
                      role,
                      organizationId: organization.id,
                    },
                    "Invitation sent",
                  )
                }
              >
                <HugeiconsIcon
                  icon={UserAdd01Icon}
                  data-icon="inline-start"
                  strokeWidth={2}
                />{" "}
                Invite
              </Button>
            </div>
          </FieldGroup>
          {!canManageTeam && (
            <p className="mt-4 text-xs text-muted-foreground">
              You need the workspace membership permission to invite or remove
              people.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>People with access</CardTitle>
          <CardDescription>
            {members.length} member{members.length === 1 ? "" : "s"} in{" "}
            {organization.name}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {members.map((member) => {
            const name =
              member.user?.name ||
              member.user?.email ||
              member.email ||
              member.id;
            const memberIsOwner = member.role
              .split(",")
              .map((value) => value.trim())
              .includes("owner");
            const isCurrentUser = member.userId === session?.user?.id;
            const canEditRole =
              canManageTeam &&
              (!memberIsOwner || (isCurrentUser && isWorkspaceOwner));
            return (
              <div
                className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                key={member.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.user?.email ?? member.email ?? "Workspace member"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={member.role === "owner" ? "default" : "secondary"}
                  >
                    {roleName(member.role)}
                  </Badge>
                  <Select
                    disabled={busy || !canEditRole}
                    onValueChange={(value) =>
                      void updateMemberRole(member.id, String(value))
                    }
                    value={member.role}
                  >
                    <SelectTrigger
                      aria-label={`Role for ${name}`}
                      className="w-28"
                      size="sm"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {roleOptions.map((roleOption) => (
                          <SelectItem
                            key={roleOption.key}
                            value={roleOption.key}
                          >
                            {roleOption.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Button
                    aria-label={
                      isCurrentUser ? "Leave workspace" : `Remove ${name}`
                    }
                    disabled={
                      busy ||
                      (isCurrentUser
                        ? memberIsOwner && ownerCount < 2
                        : !canManageTeam || memberIsOwner)
                    }
                    onClick={() =>
                      isCurrentUser
                        ? setLeaveOpen(true)
                        : void run(
                            "removeMember",
                            {
                              memberIdOrEmail: member.id,
                              organizationId: organization.id,
                            },
                            "Member removed",
                          )
                    }
                    size="icon"
                    variant="ghost"
                    title={
                      isCurrentUser && memberIsOwner && ownerCount < 2
                        ? "Promote another member to owner before leaving"
                        : undefined
                    }
                  >
                    {isCurrentUser ? (
                      <LogOut />
                    ) : (
                      <HugeiconsIcon icon={UserMinus01Icon} strokeWidth={2} />
                    )}
                  </Button>
                </div>
                {isCurrentUser && memberIsOwner && ownerCount < 2 && (
                  <p className="text-xs text-muted-foreground sm:basis-full sm:text-right">
                    Assign another member as owner before leaving.
                  </p>
                )}
              </div>
            );
          })}
          {!members.length && (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={UserGroupIcon} />
                </EmptyMedia>
                <EmptyTitle>No members yet</EmptyTitle>
                <EmptyDescription>
                  Invite your first collaborator to start working together.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
            <CardDescription>
              Invitations that have not been accepted yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {invitations.map((invitation) => (
              <div
                className="flex items-center justify-between gap-3 rounded-xl border p-4 text-sm"
                key={invitation.id}
              >
                <div>
                  <p className="font-medium">{invitation.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Invited as {invitation.role}
                  </p>
                </div>
                <Button
                  disabled={!canManageTeam || busy}
                  onClick={() =>
                    void run(
                      "cancelInvitation",
                      {
                        invitationId: invitation.id,
                        organizationId: organization.id,
                      },
                      "Invitation cancelled",
                    )
                  }
                  size="sm"
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <AlertDialog
        onOpenChange={(open) => !busy && setLeaveOpen(open)}
        open={leaveOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave {organization.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              You will lose access to this workspace and its chats, agents, and
              shared resources. You can rejoin only if a workspace owner invites
              you again.
              {isWorkspaceOwner &&
                " Your role will change to Admin before you leave so another owner remains in place."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void leaveWorkspace();
              }}
              variant="destructive"
            >
              {busy ? "Leaving…" : "Leave workspace"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
