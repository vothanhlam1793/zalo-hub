import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { token, isChecking, checkSession } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (!token) checkSession();
  }, []);

  if (isChecking) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0f1117] text-[#888] text-sm">
        Đang kiểm tra đăng nhập...
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
