import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuthStore } from '@/stores/auth-store';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const result = await login(email, password);
    if (result.ok) {
      navigate('/');
    } else {
      setError(result.error || 'Lỗi đăng nhập');
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center flex-col gap-6 bg-[var(--background)] text-[var(--foreground)] min-h-screen p-4 transition-colors relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="flex flex-col items-center text-center gap-1.5">
        <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-2xl font-bold shadow-lg shadow-blue-600/30 mb-2">
          Z
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--foreground)] tracking-tight">ZaloHub Workspace</h1>
        <p className="text-muted-foreground text-xs sm:text-sm max-w-sm">Hệ thống quản lý tin nhắn và phân loại khách hàng Zalo đa tài khoản</p>
      </div>

      <Card className="bg-[var(--card)] border-[var(--border)] p-6 sm:p-8 w-full max-w-[380px] flex flex-col gap-4 shadow-xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="text-xs font-semibold">Email đăng nhập</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@zalohub.local"
              className="h-10 text-xs"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password" className="text-xs font-semibold">Mật khẩu</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-10 text-xs"
            />
          </div>
          {error && <p className="text-red-500 text-xs m-0 font-medium">{error}</p>}
          <Button type="submit" disabled={isLoading} className="w-full h-10 text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-md">
            {isLoading ? 'Đang xác thực...' : 'Đăng nhập'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
