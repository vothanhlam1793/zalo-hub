import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import LoginPage from '../pages/LoginPage';
import AdminPage from '../pages/AdminPage';
import { AuthGuard } from '../components/AuthGuard';
import { useMobileRouteRedirect } from './useMobileRouteRedirect';
import { DashboardPage } from '../features/chat/DashboardPage';

function DashboardRedirect({ mobileMode }: { mobileMode: boolean }) {
  const location = useLocation();
  const isMobile = useMobileRouteRedirect();

  if (isMobile && !mobileMode && location.pathname === '/') {
    return <Navigate to="/m" replace />;
  }

  return <DashboardPage mobileMode={mobileMode} />;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<AuthGuard><DashboardRedirect mobileMode={false} /></AuthGuard>} />
      <Route path="/m" element={<AuthGuard><DashboardRedirect mobileMode /></AuthGuard>} />
      <Route path="/admin" element={<AuthGuard><AdminPage /></AuthGuard>} />
    </Routes>
  );
}
