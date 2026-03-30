import PublicSiteHeader from "./PublicSiteHeader";

/** Marketing / discovery layout: sticky top nav + main landmark (matches TournamentDiscovery). */
export default function PublicShell({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicSiteHeader />
      <main id="main-content" className="flex-1">
        {children}
      </main>
    </div>
  );
}
