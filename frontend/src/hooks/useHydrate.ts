import { useEffect } from "react";
import { useLoaderData } from "react-router";
import { useAuthStore } from "../../src/stores/auth-store";
import { useWorkspaceStore } from "../../src/stores/workspace-store";

interface SystemUser {
  id: string;
  email: string;
  displayName: string;
  type: "human" | "ai_bot";
  role?: string;
}

interface LoaderData {
  user?: SystemUser | null;
  init?: {
    status?: unknown;
    accounts?: { accounts: unknown[]; activeAccountId?: string };
    myAccounts?: { accounts: Array<{ accountId: string; visible: boolean }> };
  } | null;
}

export function useHydrate() {
  const data = useLoaderData() as LoaderData | undefined;
  const auth = useAuthStore();
  const workspace = useWorkspaceStore();

  useEffect(() => {
    if (data?.user) {
      auth.setUser(data.user);
    }
    if (data?.init) {
      if (data.init.accounts) {
        workspace.setKnownAccounts(
          data.init.accounts.accounts.map((a: any) => ({
            accountId: a.accountId,
            hubAlias: a.hubAlias,
            displayName: a.account?.displayName ?? a.displayName,
            phoneNumber: a.account?.phoneNumber ?? a.phoneNumber,
            avatar: a.account?.avatar ?? a.avatar,
            isActive: a.isActive,
            hasCredential: a.hasCredential,
            runtimeLoaded: a.runtimeLoaded,
            sessionActive: a.sessionActive,
          }))
        );
        if (data.init.accounts.activeAccountId) {
          workspace.setSelectedAccountId(data.init.accounts.activeAccountId);
        }
      }
    }
  }, [data, auth, workspace]);
}
