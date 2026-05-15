import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth-store";
import { api } from "../api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";

export default function LoginPage() {
  const { login } = useAuthStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Đăng nhập thất bại");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
      <Card className="w-full max-w-sm border-white/10 bg-[#0d1015]">
        <CardHeader>
          <CardTitle className="text-[#eee]">Zalo Hub Admin</CardTitle>
          <CardDescription>Đăng nhập để quản lý tài khoản</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-[#131620] border-white/10"
              required
            />
            <Input
              type="password"
              placeholder="Mật khẩu"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-[#131620] border-white/10"
              required
            />
            {error && <p className="text-[13px] text-[#ff8888]">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Đang đăng nhập..." : "Đăng nhập"}
            </Button>
          </form>
          <p className="text-[11px] text-muted-foreground mt-3 text-center">
            admin@zalohub.local / admin123
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
