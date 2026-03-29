import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

export default function TermsOfService() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
        <motion.button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-primary hover:underline"
          whileHover={{ x: -4 }}
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </motion.button>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div>
            <h1 className="text-4xl font-display font-bold mb-2">Terms of Service</h1>
            <p className="text-muted-foreground">Effective Date: March 27, 2026</p>
          </div>

          <div className="prose prose-invert max-w-none space-y-6 text-sm leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-xl font-display font-bold">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground">
                By using ArenaSaaS, you agree to these Terms. If you do not agree, do not use the platform.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-display font-bold">2. User Responsibilities</h2>
              <p className="text-muted-foreground">
                <strong>Organizers:</strong> You are responsible for tournament rules, score verification, and fair play enforcement.
              </p>
              <p className="text-muted-foreground">
                <strong>Players:</strong> You must provide accurate information, follow tournament rules, and report scores honestly.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-display font-bold">3. Prohibited Conduct</h2>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Cheating, match-fixing, or collusion</li>
                <li>Harassment, hate speech, or discrimination</li>
                <li>Payment fraud or chargeback disputes</li>
                <li>Attempting to breach platform security</li>
                <li>Impersonation or false identity</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-display font-bold">4. Payment & Payouts</h2>
              <p className="text-muted-foreground">
                Prize payouts are processed via Stripe Connect within 5-7 business days. Organizers are responsible for tax compliance and reporting.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-display font-bold">5. Dispute Resolution</h2>
              <p className="text-muted-foreground">
                All disputes are resolved through our in-app dispute system. We reserve the right to make final rulings on controversial matches.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-display font-bold">6. Limitation of Liability</h2>
              <p className="text-muted-foreground">
                ArenaSaaS is provided "as is." We are not liable for indirect damages, lost winnings, or business interruption.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-display font-bold">7. Termination</h2>
              <p className="text-muted-foreground">
                We reserve the right to suspend or terminate accounts for violations. Terminated accounts lose access to all data after 30 days.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-display font-bold">8. Changes to Terms</h2>
              <p className="text-muted-foreground">
                We may update these terms at any time. Continued use constitutes acceptance.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-display font-bold">9. Contact</h2>
              <p className="text-muted-foreground">
                Questions? Email legal@arenasaas.com.
              </p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}