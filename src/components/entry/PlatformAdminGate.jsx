import { useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';

/**
 * Restricts children to authenticated users with platform role `admin`.
 * Used only on the system super-admin entry host (admin.* or VITE_SIMULATE_ENTRY=admin).
 */
export default function PlatformAdminGate({ children }) {
  const { user, isAuthenticated, isLoadingAuth, navigateToLogin } = useAuth();

  useEffect(() => {
    if (isLoadingAuth) return;
    if (!isAuthenticated || user?.role !== 'admin') {
      navigateToLogin();
    }
  }, [isLoadingAuth, isAuthenticated, user, navigateToLogin]);

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== 'admin') {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background text-muted-foreground text-sm">
        Redirecting to sign in…
      </div>
    );
  }

  return children;
}
