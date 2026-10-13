"use client";

import { WorkspaceMembers } from "@/components/workspace/workspace-members";
import { authClient } from "@/lib/auth-client";

export function Team() {
  const {
    data: organization,
    isPending,
    refetch,
  } = authClient.useActiveOrganization();
  const { data: session } = authClient.useSession();

  return (
    <WorkspaceMembers
      isPending={isPending}
      organization={organization}
      refetchOrganization={async () => refetch?.()}
      session={session}
    />
  );
}
