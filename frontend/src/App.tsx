// App.tsx is now a thin entrypoint.
// useDashboardState lives in features/chat/useDashboardState.ts
// DashboardPage lives in features/chat/DashboardPage.tsx
import AppRoutes from './app/AppRoutes';
import { TooltipProvider } from '@/components/ui/tooltip';

export { useDashboardState, type DashboardState } from './features/chat/useDashboardState';

export default function App() {
  return (
    <TooltipProvider delayDuration={300}>
      <AppRoutes />
    </TooltipProvider>
  );
}
