import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { serverFetch } from "../lib/server-fetch";
import AdminPage from "../../src/features/admin/AdminPage";

export async function loader({ request }: LoaderFunctionArgs) {
  const cookie = request.headers.get("cookie") || "";

  const authRes = await serverFetch("/bff/auth/me", cookie);
  if (!authRes.ok) throw redirect("/login");
  const authBody = (await authRes.json()) as { ok: boolean; data?: { user: unknown } };

  const [usersRes, botsRes, accountsRes] = await Promise.all([
    serverFetch("/bff/admin/users", cookie),
    serverFetch("/bff/admin/bots", cookie),
    serverFetch("/bff/admin/accounts/all", cookie),
  ]);

  return {
    user: authBody?.data?.user ?? null,
    users: usersRes.ok ? ((await usersRes.json()) as { ok: boolean; data?: unknown }).data : null,
    bots: botsRes.ok ? ((await botsRes.json()) as { ok: boolean; data?: unknown }).data : null,
    accounts: accountsRes.ok ? ((await accountsRes.json()) as { ok: boolean; data?: unknown }).data : null,
  };
}

export default function AdminRoute() {
  return <AdminPage />;
}
