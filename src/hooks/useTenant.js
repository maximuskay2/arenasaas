import { useAuth } from "@/lib/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";

// Super Admin impersonation helpers
export function getImpersonatedTenantId() {
  return localStorage.getItem("impersonate_tenant_id") || null;
}
export function setImpersonatedTenantId(id) {
  if (id) localStorage.setItem("impersonate_tenant_id", id);
  else localStorage.removeItem("impersonate_tenant_id");
}

export function useTenant() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const impersonatedId = getImpersonatedTenantId();
  const tenantId = impersonatedId || user?.tenant_id || null;
  const isImpersonating = !!impersonatedId && isSuperAdmin;

  const { data: tenantConfig = null } = useQuery({
    queryKey: ["tenant-config", tenantId],
    queryFn: () => {
      if (!tenantId) return Promise.resolve(null);
      return maxikay.entities.TenantConfig.filter({ tenant_id: tenantId }).then((r) => r[0] ?? null);
    },
    staleTime: 5 * 60 * 1000,
  });

  return { tenantId, isSuperAdmin, tenantConfig, user, isImpersonating };
}