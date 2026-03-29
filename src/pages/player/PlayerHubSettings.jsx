import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Settings, Link2, Receipt, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { maxikay } from "@/api/maxikayClient";
import { useAuth } from "@/lib/AuthContext";

export default function PlayerHubSettings() {
  const { isAuthenticated } = useAuth();
  const [tournamentId, setTournamentId] = useState("");
  const [provider, setProvider] = useState("stripe");
  const [paymentRef, setPaymentRef] = useState("");
  const [captainEmail, setCaptainEmail] = useState("");
  const [fcmToken, setFcmToken] = useState("");
  const [fcmTournamentId, setFcmTournamentId] = useState("");

  const verifyPayment = useMutation({
    mutationFn: () =>
      maxikay.payments.verifyEntryReference({
        tournament_id: tournamentId.trim(),
        provider,
        reference: paymentRef.trim(),
        captain_email: captainEmail.trim() || undefined,
      }),
    onSuccess: (data) => {
      if (data?.duplicate) toast.info("This reference is already recorded.");
      else toast.success("Payment verified and recorded for that tournament.");
    },
    onError: (err) => {
      toast.error(err.data?.error || err.message || "Verification failed");
    },
  });

  const registerFcm = useMutation({
    mutationFn: () =>
      maxikay.notifications.registerFcm({
        token: fcmToken.trim(),
        tournament_id: fcmTournamentId.trim() || undefined,
        platform: "web",
      }),
    onSuccess: (data) => {
      const ok = data?.subscribe?.configured !== false;
      toast.success(ok ? "Device token saved and subscribed to topics." : "Token saved (configure FIREBASE_SERVICE_ACCOUNT_JSON on API for FCM).");
    },
    onError: (err) => {
      toast.error(err.data?.error || err.message || "Could not register token");
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 md:p-6">
      <div>
        <h1 className="text-3xl font-black uppercase italic tracking-tighter">Player settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Account, game ID linking, verified entry-fee references, and optional FCM device registration.
        </p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/40 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          <h2 className="font-black uppercase italic">Account &amp; game IDs</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Update profile, security, and <strong className="text-foreground">game_handles</strong> (Riot, Steam, PSN,
          etc.) in the main Settings area.
        </p>
        <Button className="font-black uppercase italic" asChild>
          <Link to="/settings">Open settings</Link>
        </Button>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/40 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          <h2 className="font-black uppercase italic">Payment reference (API)</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          After checkout, verify your <strong className="text-foreground">Stripe</strong> session (<code className="text-xs">cs_</code> /{" "}
          <code className="text-xs">pi_</code>), <strong className="text-foreground">Paystack</strong> reference, or{" "}
          <strong className="text-foreground">Flutterwave</strong> <code className="text-xs">tx_ref</code> with the API so{" "}
          <code className="text-xs">payment_ledger</code> matches your join. Captain email must match the payer on the
          receipt.
        </p>
        {!isAuthenticated && (
          <p className="text-xs text-amber-200/90">Sign in to verify a reference.</p>
        )}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="pay-tid">Tournament ID</Label>
            <Input
              id="pay-tid"
              value={tournamentId}
              onChange={(e) => setTournamentId(e.target.value)}
              placeholder="UUID from tournament URL"
              className="bg-background/50"
            />
          </div>
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stripe">Stripe</SelectItem>
                <SelectItem value="paystack">Paystack</SelectItem>
                <SelectItem value="flutterwave">Flutterwave</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-ref">Reference</Label>
            <Input
              id="pay-ref"
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              placeholder="cs_…, pi_…, Paystack ref, or tx_ref"
              className="bg-background/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-cap">Captain / payer email (optional)</Label>
            <Input
              id="pay-cap"
              value={captainEmail}
              onChange={(e) => setCaptainEmail(e.target.value)}
              placeholder="Defaults to your logged-in email"
              className="bg-background/50"
            />
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="font-black uppercase italic"
          disabled={!isAuthenticated || !tournamentId.trim() || !paymentRef.trim() || verifyPayment.isPending}
          onClick={() => verifyPayment.mutate()}
        >
          {verifyPayment.isPending ? "Verifying…" : "Verify & record"}
        </Button>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/40 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <h2 className="font-black uppercase italic">Push notifications (FCM)</h2>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Register a device token to receive tournament pushes. The API subscribes tokens to{" "}
          <code className="text-[10px]">arena_user_&lt;your-id&gt;</code> and optionally{" "}
          <code className="text-[10px]">arena_tournament_&lt;id&gt;</code>. After you join a tournament, existing tokens are
          also subscribed to that tournament topic. Requires <code className="text-[10px]">FIREBASE_SERVICE_ACCOUNT_JSON</code>{" "}
          on the server for Firebase Admin.
        </p>
        <div className="space-y-2">
          <Label htmlFor="fcm-token">FCM registration token</Label>
          <Input
            id="fcm-token"
            value={fcmToken}
            onChange={(e) => setFcmToken(e.target.value)}
            placeholder="Paste token from your client / Firebase console"
            className="bg-background/50 font-mono text-xs"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fcm-tid">Also subscribe to tournament (optional)</Label>
          <Input
            id="fcm-tid"
            value={fcmTournamentId}
            onChange={(e) => setFcmTournamentId(e.target.value)}
            placeholder="Tournament UUID"
            className="bg-background/50"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          className="font-black uppercase italic"
          disabled={!isAuthenticated || !fcmToken.trim() || registerFcm.isPending}
          onClick={() => registerFcm.mutate()}
        >
          {registerFcm.isPending ? "Saving…" : "Register token"}
        </Button>
      </div>

      <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 p-6 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          In-app &amp; lobby
        </div>
        <p className="text-xs text-muted-foreground">
          Match lobby and in-app notifications continue to work as before; FCM adds optional mobile/web push when configured.
        </p>
      </div>
    </div>
  );
}
