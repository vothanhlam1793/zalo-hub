import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { useAuthStore } from '../stores/auth-store';

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
    <div className="flex-1 flex items-center justify-center flex-col gap-6 bg-gradient-to-br from-[#0f1117] to-[#1a2035] min-h-screen">
      <h1 className="text-[32px] font-bold text-white m-0">Zalo Hub</h1>
      <p className="text-[#888] text-[15px] m-0">Đăng nhập vào hệ thống</p>

      <Card className="bg-white/5 border-white/10 p-8 w-[360px] flex flex-col gap-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email" className="text-[#ccc]">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@zalohub.local"
              className="h-10"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password" className="text-[#ccc]">Mật khẩu</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-10"
            />
          </div>
          {error && <p className="text-[#ff8888] text-[13px] m-0">{error}</p>}
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </Button>
        </form>
        <p className="text-[#666] text-xs text-center m-0">
          Mặc định: admin@zalohub.local / admin123
        </p>
      </Card>
    </div>
  );
}
