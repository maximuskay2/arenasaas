import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

/** Tenant "league command post" — only users with global role super_admin (org owner seat). */
export default function RequireTenantSuperAdmin({ children }) {
  const { user } = useAuth();
  if (user?.role !== "super_admin") {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
