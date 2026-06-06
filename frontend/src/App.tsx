// App.tsx is now a thin entrypoint.
// useDashboardState lives in features/chat/useDashboardState.ts
// DashboardPage lives in features/chat/DashboardPage.tsx
import AppRoutes from './app/AppRoutes';

export { useDashboardState, type DashboardState } from './features/chat/useDashboardState';

export default function App() {
  return <AppRoutes />;
}
