import React from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-surface-container/30 text-on-surface py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-surface rounded-3xl shadow-xl border border-outline-variant/30 p-8 sm:p-12">
        <Link to="/" className="inline-flex items-center text-primary hover:text-primary/80 mb-8 font-medium">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Link>

        <h1 className="text-4xl font-extrabold text-primary mb-8 tracking-tight">Privacy Policy</h1>

        <div className="prose prose-on-surface max-w-none">
          <p className="text-lg text-text-secondary mb-6">Last updated: July 1, 2026</p>

          <h2 className="text-2xl font-bold mt-8 mb-4">1. Overview</h2>
          <p>
            SentinL ("SentinL", "we", "our", or "us") provides a Discord moderation bot and web dashboard for server owners and authorized moderators. This Privacy Policy explains what information SentinL collects, how it is used, when it is shared, and how server owners or users can request deletion.
          </p>
          <p className="mt-2">
            By inviting SentinL to a Discord server, connecting a Discord account, or using the dashboard, you acknowledge that SentinL will process data needed to provide moderation, appeals, reports, analytics, community tools, billing, and support.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">2. Who Controls Server Data</h2>
          <p>
            Discord server owners and authorized moderators decide whether to add SentinL, configure moderation rules, enable optional features, and take moderation actions. SentinL processes most server data on behalf of those server administrators. Server administrators are responsible for telling their community that SentinL is active and may process message content for moderation.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">3. Data We Collect</h2>
          <p>SentinL collects only the data needed to operate the bot and dashboard:</p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li><strong>Dashboard account data:</strong> Firebase/Auth user ID, email address, login state, and basic account metadata.</li>
            <li><strong>Discord account data:</strong> Discord user ID, username, avatar, and server list information returned during Discord OAuth. OAuth access tokens are used to complete the connection flow and fetch authorized server data; SentinL does not intentionally expose those tokens to dashboard users.</li>
            <li><strong>Discord server identifiers:</strong> Server IDs, server names, channel IDs, role IDs, message IDs, user IDs, and permission state needed to operate moderation and community tools.</li>
            <li><strong>Server configuration:</strong> Moderation thresholds, enabled features, custom rules, keywords, language/rule preferences, log channel settings, reaction roles, leveling settings, giveaway settings, custom commands, health widget settings, and social integration settings.</li>
            <li><strong>Message moderation data:</strong> Message content may be read so SentinL can evaluate it against server rules. Messages that are not flagged are not intentionally stored as full message evidence. Flagged messages, relevant snippets, message IDs, author IDs, channels, AI results, rule matches, confidence scores, severity, and moderator actions may be stored for review, appeals, reports, and audit history.</li>
            <li><strong>Context data:</strong> If context reading is enabled or needed for a moderation decision, SentinL may process limited nearby conversation context. Context attached to moderation evidence is treated like moderation evidence and follows the retention rules below.</li>
            <li><strong>Appeals and reports:</strong> Appeal case IDs, appeal text, decision status, moderator notes/actions, report reasons, reporter/reported user IDs, and related evidence needed to review a moderation decision.</li>
            <li><strong>Community feature data:</strong> XP, levels, leaderboards, role rewards, giveaway entries/winners, command usage, summaries, and analytics used by enabled features.</li>
            <li><strong>Integration data:</strong> YouTube channel identifiers, Twitch usernames/IDs, announcement channel IDs, and related metadata when a server enables those integrations.</li>
            <li><strong>Payment and subscription data:</strong> Plan, status, payment/order IDs, renewal/expiry dates, linked server slots, and payment provider metadata. Full card details are handled by the payment provider, not stored by SentinL.</li>
            <li><strong>Operational data:</strong> API usage counts, AI check counts, rate-limit state, error logs, diagnostic logs, security logs, and system events needed to keep the service reliable and secure.</li>
          </ul>

          <h2 className="text-2xl font-bold mt-8 mb-4">4. How We Use Data</h2>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>To detect spam, harassment, sexual content, threats, abuse, and other server-defined rule violations.</li>
            <li>To apply server settings such as warnings, deletes, timeouts, reports, appeals, logs, and keyword fallback.</li>
            <li>To show moderation queues, reports, analytics, setup status, subscription status, and community tools in the dashboard.</li>
            <li>To enforce tier limits, server-slot limits, daily AI check limits, fair-use limits, and payment status.</li>
            <li>To provide support, troubleshoot errors, prevent abuse, secure the service, and improve reliability.</li>
            <li>To create aggregate or de-identified analytics that cannot reasonably identify an individual user.</li>
          </ul>

          <h2 className="text-2xl font-bold mt-8 mb-4">5. AI Processing</h2>
          <p>
            SentinL uses AI providers only to provide moderation, summaries, and related product functionality. Relevant moderation text, custom rules, limited metadata, and optional context may be sent to configured AI providers such as Cloudflare Workers AI, Groq, Google Gemini, or another provider used by SentinL.
          </p>
          <p className="mt-2">
            SentinL does not use Discord message content to train SentinL-owned AI models. SentinL also does not sell Discord API data or message content. Third-party AI providers process data under their own terms and infrastructure. Server admins can reduce optional context processing by disabling context-reading features where available, but core moderation may still require message processing.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">6. Third-Party Services</h2>
          <p>SentinL may use the following service providers to operate the product:</p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li><strong>Discord:</strong> Bot platform, server data source, OAuth, interactions, commands, and moderation actions.</li>
            <li><strong>Firebase / Google Cloud:</strong> Authentication, Firestore database, logs, hosting-related infrastructure, and backend services.</li>
            <li><strong>Hosting provider:</strong> Application hosting, networking, and runtime logs, depending on where SentinL is deployed.</li>
            <li><strong>Cloudflare Workers AI, Groq, Google Gemini, or other AI providers:</strong> AI moderation and inference.</li>
            <li><strong>Payment provider:</strong> Payment processing, invoices, payment status, fraud checks, and billing metadata.</li>
            <li><strong>YouTube and Twitch APIs:</strong> Social integration lookups and announcements when enabled by a server admin.</li>
          </ul>

          <h2 className="text-2xl font-bold mt-8 mb-4">7. Data Retention</h2>
          <p>We keep data only as long as needed for SentinL features, safety, support, legal obligations, and service reliability:</p>
          <div className="overflow-x-auto my-4">
            <table className="min-w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30">
                  <th className="py-2 px-4">Data Type</th>
                  <th className="py-2 px-4">Typical Retention</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                <tr>
                  <td className="py-2 px-4 align-top">Unflagged message content</td>
                  <td className="py-2 px-4 align-top">Processed for moderation and not intentionally stored as full message evidence unless needed for logs, debugging, reports, appeals, or an enabled feature.</td>
                </tr>
                <tr>
                  <td className="py-2 px-4 align-top">Flagged message content and moderation evidence</td>
                  <td className="py-2 px-4 align-top">Message content and context snippets are normally redacted after 30 days. Moderation records may be kept for up to 6 months unless needed longer for an active appeal, report, dispute, abuse investigation, or legal obligation.</td>
                </tr>
                <tr>
                  <td className="py-2 px-4 align-top">Appeals and reports</td>
                  <td className="py-2 px-4 align-top">Kept while the case is active and for a reasonable audit period afterward.</td>
                </tr>
                <tr>
                  <td className="py-2 px-4 align-top">Moderator training feedback</td>
                  <td className="py-2 px-4 align-top">Correction metadata may be kept to improve server-specific moderation behavior. Copied message content and AI reasoning are normally redacted after 30 days.</td>
                </tr>
                <tr>
                  <td className="py-2 px-4 align-top">Saved chat summaries</td>
                  <td className="py-2 px-4 align-top">Summary text is normally redacted after 90 days unless a different retention period is configured. Basic metadata such as channel, date, and creator may remain for audit/history display.</td>
                </tr>
                <tr>
                  <td className="py-2 px-4 align-top">Server settings, rules, roles, integrations, and dashboard configuration</td>
                  <td className="py-2 px-4 align-top">Kept while the server uses SentinL or until deleted by an authorized server owner/admin.</td>
                </tr>
                <tr>
                  <td className="py-2 px-4 align-top">Billing and subscription records</td>
                  <td className="py-2 px-4 align-top">Kept as needed for payment, accounting, fraud prevention, refunds, tax, and legal obligations.</td>
                </tr>
                <tr>
                  <td className="py-2 px-4 align-top">Operational logs and security logs</td>
                  <td className="py-2 px-4 align-top">Normally kept for a limited period needed for reliability, abuse prevention, and troubleshooting.</td>
                </tr>
                <tr>
                  <td className="py-2 px-4 align-top">Aggregate analytics and usage counters</td>
                  <td className="py-2 px-4 align-top">May be kept while useful for product reliability and dashboard features, preferably in aggregate or de-identified form.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-text-secondary mt-2">
            Deleted data may remain temporarily in encrypted backups, provider logs, or infrastructure snapshots until those systems rotate or expire.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">8. Access Controls</h2>
          <p>
            Dashboard access is limited to authenticated users who are authorized for a server. SentinL checks Firebase authentication, Discord-linked identity, server authorization, and relevant permissions before showing or allowing protected actions. Server owners and moderators should only grant dashboard access to trusted staff.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">9. Your Choices and Deletion Requests</h2>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Server owners can request deletion of server data using the <code>/wipedata</code> command or by contacting support.</li>
            <li>Server admins can disable optional features such as context reading, social integrations, leveling, giveaways, and other non-core tools.</li>
            <li>Discord users can submit appeals where available and may request access or deletion by contacting support. Some requests require server-owner verification because moderation records belong to a server moderation context.</li>
            <li>Removing SentinL from a Discord server stops future bot operation in that server, but it does not automatically delete dashboard/database records. Use <code>/wipedata</code> or contact support for deletion.</li>
            <li>Deleting SentinL records does not restore or delete messages inside Discord unless a separate Discord action is available and performed.</li>
          </ul>

          <h2 className="text-2xl font-bold mt-8 mb-4">10. Security</h2>
          <p>
            SentinL uses HTTPS/TLS, authentication, backend authorization checks, Firestore security rules, restricted environment variables, and role-based access controls. No online service can be guaranteed perfectly secure. If we learn of unauthorized access to sensitive data, we will take reasonable steps to investigate, contain the issue, and notify affected parties where required.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">11. Children and Age Requirements</h2>
          <p>
            SentinL is intended for Discord communities and is not directed to children under Discord's minimum age requirements. Server owners are responsible for ensuring that their communities follow Discord's age rules and applicable laws.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">12. International Processing</h2>
          <p>
            SentinL and its service providers may process data in countries other than where a user lives. By using SentinL, you understand that data may be transferred and processed wherever our infrastructure or providers operate, subject to appropriate safeguards where required.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">13. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy as SentinL changes. Material changes will be reflected in the dashboard, website, support server, or another reasonable notice method. Continued use of SentinL after an update means you accept the updated policy.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">14. Contact</h2>
          <p>
            For privacy questions, data requests, security concerns, or deletion requests, contact <a href="mailto:srinjoymahato9@gmail.com" className="text-primary hover:underline font-semibold">srinjoymahato9@gmail.com</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
