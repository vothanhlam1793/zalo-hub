import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import LoginPage from "../../src/features/auth/components/LoginPage";

export async function loader({ request }: LoaderFunctionArgs) {
  const cookie = request.headers.get("cookie") || "";
  if (cookie.includes("zalohub_token")) {
    const BFF_URL = process.env.BFF_URL || "http://127.0.0.1:3401";
    try {
      const res = await fetch(`${BFF_URL}/bff/auth/me`, { headers: { cookie } });
      if (res.ok) return redirect("/");
    } catch {
      // Token invalid, stay on login
    }
  }
  return null;
}

export default function LoginRoute() {
  return <LoginPage />;
}
