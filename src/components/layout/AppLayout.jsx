import { Outlet } from "react-router-dom";
import TenantThemeProvider from "./TenantThemeProvider";
import GlobalMatchReadyAlert from "../match/GlobalMatchReadyAlert";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import NotificationCenter from "./NotificationCenter";

export default function AppLayout() {
  return (
    <TenantThemeProvider>
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>
      
      {/* Main content */}
      <main className="flex-1 min-w-0">
        <div className="md:hidden">
          <MobileNav />
        </div>
        {/* Top bar with notification bell (desktop) */}
        <div className="hidden md:flex justify-end px-8 pt-4 pb-0">
          <NotificationCenter />
        </div>
        <div className="p-4 md:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
    <GlobalMatchReadyAlert />
    </TenantThemeProvider>
  );
}