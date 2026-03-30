import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

export default function PrivacyPolicy() {
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
            <h1 className="text-4xl font-display font-bold mb-2">Privacy Policy</h1>
            <p className="text-muted-foreground">Effective Date: March 27, 2026</p>
          </div>

          <div className="prose prose-invert max-w-none space-y-6 text-sm leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-xl font-display font-bold">1. Introduction</h2>
              <p className="text-muted-foreground">
                ArenaSaaS ("we," "us," "our") operates the esports tournament platform. This Privacy Policy explains how we collect, use, disclose, and safeguard information when you use our platform.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-display font-bold">2. Information We Collect</h2>
              <p className="text-muted-foreground">
                <strong>Account Information:</strong> Email, password, organization name, logo, subdomain preference.
              </p>
              <p className="text-muted-foreground">
                <strong>Payment Information:</strong> Stripe processes payments. We do not store full credit card data.
              </p>
              <p className="text-muted-foreground">
                <strong>Usage Data:</strong> IP addresses, browser type, pages visited, time spent, and tournament participation.
              </p>
              <p className="text-muted-foreground">
                <strong>Tournament Data:</strong> Match results, player statistics, scores, and team rosters.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-display font-bold">3. How We Use Information</h2>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Provide and maintain the platform</li>
                <li>Process payments and handle payouts</li>
                <li>Send notifications and updates</li>
                <li>Prevent fraud and abuse</li>
                <li>Improve user experience via analytics</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-display font-bold">4. Data Security</h2>
              <p className="text-muted-foreground">
                We use industry-standard encryption (TLS) and multi-tenant isolation to protect your data. Access is restricted to authorized personnel only.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-display font-bold">5. Third-Party Services</h2>
              <p className="text-muted-foreground">
                We integrate with Stripe (payments), Discord (webhooks), and cloud infrastructure providers. These parties have their own privacy policies.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-display font-bold">6. Your Rights</h2>
              <p className="text-muted-foreground">
                You have the right to access, update, or delete your account data. Contact us at support@arenasaas.com.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-display font-bold">7. Contact Us</h2>
              <p className="text-muted-foreground">
                Questions about this policy? Email us at privacy@arenasaas.com.
              </p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}