import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth-store";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { token, isChecking, checkSession } = useAuthStore();
  const navigate = useNavigate();
  const [done, setDone] = useState(false);

  useEffect(() => {
    checkSession().then(() => setDone(true));
  }, []);

  useEffect(() => {
    if (done && !token) {
      navigate("/login", { state: { from: location.pathname } });
    }
  }, [done, token]);

  if (!done || isChecking) return <div className="p-8 text-muted-foreground text-sm">Đang kiểm tra đăng nhập...</div>;
  if (!token) return null;

  return <>{children}</>;
}
