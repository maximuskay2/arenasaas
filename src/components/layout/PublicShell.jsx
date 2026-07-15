import PublicSiteHeader from "./PublicSiteHeader";

/** Marketing / discovery layout: sticky top nav + main landmark (matches TournamentDiscovery). */
export default function PublicShell({ children }) {
  return (
    <div className="flex min-h-screen flex-col arena-stage">
      <div className="arena-content flex flex-col min-h-screen w-full">
        <PublicSiteHeader />
        <main id="main-content" className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
