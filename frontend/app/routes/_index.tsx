import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { serverFetch } from "../lib/server-fetch";
import { DashboardPage } from "../../src/features/chat/DashboardPage";
import { useHydrate } from "../../src/hooks/useHydrate";

export async function loader({ request }: LoaderFunctionArgs) {
  const cookie = request.headers.get("cookie") || "";

  const authRes = await serverFetch("/bff/auth/me", cookie);
  if (!authRes.ok) throw redirect("/login");
  const authBody = (await authRes.json()) as { ok: boolean; data?: { user: unknown } };

  const initRes = await serverFetch("/bff/workspace/init", cookie, { method: "POST" });
  const initBody = initRes.ok ? (await initRes.json()) as { ok: boolean; data?: unknown } : null;

  return {
    user: authBody?.data?.user ?? null,
    init: initBody?.data ?? null,
  };
}

export default function IndexRoute() {
  useHydrate();
  return <DashboardPage mobileMode={false} />;
}
