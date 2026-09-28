// App.tsx is now a thin entrypoint.
// useDashboardState lives in features/chat/useDashboardState.ts
// DashboardPage lives in features/chat/DashboardPage.tsx
import AppRoutes from './app/AppRoutes';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAutoVersionCheck } from './hooks/useAutoVersionCheck';

export { useDashboardState, type DashboardState } from './features/chat/useDashboardState';

export default function App() {
  useAutoVersionCheck();

  return (
    <TooltipProvider delayDuration={300}>
      <AppRoutes />
    </TooltipProvider>
  );
}
