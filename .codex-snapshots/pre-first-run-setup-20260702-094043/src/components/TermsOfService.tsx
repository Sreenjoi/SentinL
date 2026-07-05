import React from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-surface-container/30 text-on-surface py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-surface rounded-3xl shadow-xl border border-outline-variant/30 p-8 sm:p-12">
        <Link to="/" className="inline-flex items-center text-primary hover:text-primary/80 mb-8 font-medium">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Link>

        <h1 className="text-4xl font-extrabold text-primary mb-8 tracking-tight">Terms of Service</h1>

        <div className="prose prose-on-surface max-w-none">
          <p className="text-lg text-text-secondary mb-6">Last updated: July 1, 2026</p>

          <h2 className="text-2xl font-bold mt-8 mb-4">1. Acceptance of Terms</h2>
          <p>
            These Terms of Service ("Terms") govern your use of the SentinL Discord bot, web dashboard, website, and related services ("SentinL", "the Service"). By inviting SentinL to a Discord server, connecting an account, using the dashboard, or purchasing paid access, you agree to these Terms and our <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
          </p>
          <p className="mt-2">
            If you do not agree, do not use SentinL and remove the bot from your server.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">2. What SentinL Provides</h2>
          <p>
            SentinL is a Discord moderation and community management tool. Depending on configuration and plan, it may provide AI-assisted moderation, keyword fallback, moderation queues, reports, appeals, logs, server setup checks, analytics, summaries, leveling, reaction roles, giveaways, social integrations, custom commands, and related dashboard tools.
          </p>
          <p className="mt-2">
            SentinL operates according to Discord permissions, server settings, selected features, tier limits, AI provider availability, and the configuration chosen by server administrators.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">3. Eligibility and Authority</h2>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>You must be old enough to use Discord and the Service in your jurisdiction.</li>
            <li>If you add SentinL to a server or manage it through the dashboard, you represent that you have the necessary authority and Discord permissions to do so.</li>
            <li>If you use SentinL on behalf of a server, business, community, or organization, you represent that you are authorized to bind that entity or community to these Terms.</li>
          </ul>

          <h2 className="text-2xl font-bold mt-8 mb-4">4. Server Administrator Responsibilities</h2>
          <p>Server owners and moderators are responsible for how SentinL is configured and used in their communities. You agree to:</p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Use SentinL in compliance with Discord's Terms, Developer Terms, Developer Policy, Community Guidelines, and applicable laws.</li>
            <li>Tell your server members that SentinL is active and may process message content for moderation, reporting, appeals, and community tools.</li>
            <li>Configure rules, thresholds, channels, permissions, auto-actions, and integrations responsibly.</li>
            <li>Review high-impact moderation decisions where appropriate, especially deletes, timeouts, bans, and appeal outcomes.</li>
            <li>Keep your own Discord roles, channels, staff permissions, and server rules accurate.</li>
            <li>Not grant dashboard access to people who should not view moderation evidence or server configuration.</li>
          </ul>

          <h2 className="text-2xl font-bold mt-8 mb-4">5. Prohibited Use</h2>
          <p>You may not use SentinL to:</p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Harass, threaten, stalk, surveil, discriminate against, or unlawfully profile users.</li>
            <li>Collect or use Discord data for advertising, data brokerage, employment, housing, insurance, credit, or eligibility decisions.</li>
            <li>Sell, license, or commercialize Discord API data or message content.</li>
            <li>Use Discord message content to train machine learning or AI models unless you have all required permissions from Discord and affected parties.</li>
            <li>Bypass Discord privacy, safety, security, rate-limit, monetization, or permission systems.</li>
            <li>Exploit, overload, reverse engineer, scrape, attack, or abuse SentinL, its APIs, payment systems, or infrastructure.</li>
            <li>Use SentinL for illegal activity, scams, extremist content, child-harm content, non-consensual sexual content, or any activity that violates Discord rules.</li>
          </ul>

          <h2 className="text-2xl font-bold mt-8 mb-4">6. AI Moderation and Human Review</h2>
          <p>
            SentinL is an assistive moderation tool. AI and automated systems can make mistakes. False positives, false negatives, wrong rule labels, provider outages, rate limits, latency, and fallback behavior may occur.
          </p>
          <p className="mt-2">
            You are responsible for reviewing moderation settings and decisions. SentinL is not a substitute for human judgment, server staff, or legal/safety advice.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">7. Moderation Actions and Appeals</h2>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>SentinL may assist with warnings, deletes, timeouts, logs, appeals, reports, and related actions depending on server configuration and Discord permissions.</li>
            <li>Appeals are provided to help server staff review decisions, but SentinL does not guarantee that every user will receive or submit an appeal. For example, Discord DMs may be closed or a command may be unavailable.</li>
            <li>If a Discord message is deleted, SentinL may preserve limited evidence for review according to the Privacy Policy, but it cannot restore the deleted Discord message back into the channel unless Discord provides such a capability and the server chooses to repost it manually.</li>
            <li>Server staff remain responsible for final moderation decisions.</li>
          </ul>

          <h2 className="text-2xl font-bold mt-8 mb-4">8. Plans, Payments, Limits, and Fair Use</h2>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li><strong>Plans:</strong> SentinL may offer Free, Pro, and Premium/Pro 3 plans. Pro and Premium generally include the same core features; Premium/Pro 3 primarily increases the number of linked server slots.</li>
            <li><strong>Limits:</strong> Plans may include server-slot limits, daily AI check limits, feature limits, rate limits, fair-use limits, or provider-imposed limits.</li>
            <li><strong>Fallback behavior:</strong> When a server reaches its daily AI limit or an AI provider is unavailable, SentinL may fall back to keyword-based moderation, queue items for review, or temporarily pause AI-powered features.</li>
            <li><strong>Payments:</strong> Paid access may be sold as a subscription, pass, renewal, or other billing model shown at checkout. Payment processing is handled by a third-party payment provider.</li>
            <li><strong>Refunds:</strong> Refund requests are handled case by case unless a specific refund policy, payment provider rule, or applicable law requires otherwise.</li>
            <li><strong>Platform rules:</strong> Paid features may also be subject to Discord platform and monetization requirements. If Discord or another platform requires changes to payment flow, availability, or pricing, SentinL may change how paid access is offered.</li>
          </ul>

          <h2 className="text-2xl font-bold mt-8 mb-4">9. Third-Party Services</h2>
          <p>
            SentinL depends on Discord, Firebase/Google Cloud, hosting providers, AI providers, payment providers, YouTube, Twitch, and other services. We are not responsible for downtime, policy changes, data practices, rate limits, pricing changes, model changes, or failures caused by third-party services.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">10. Privacy and Data</h2>
          <p>
            SentinL processes data as described in the <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>. Removing the bot from a Discord server stops future bot operation in that server, but it does not automatically delete dashboard or database records. To request deletion, use <code>/wipedata</code> where available or contact support.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">11. Beta Features and Changes</h2>
          <p>
            Beta, trial, preview, or experimental features may change, fail, be rate-limited, or be removed. Beta access does not guarantee permanent free access unless explicitly granted in writing.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">12. Suspension and Termination</h2>
          <p>
            We may suspend or terminate access to SentinL if we believe a user or server violates these Terms, abuses the Service, creates security risk, violates Discord rules, fails to pay, exceeds fair-use limits, or creates legal or operational risk. You may stop using SentinL at any time by removing the bot and discontinuing dashboard use.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">13. Intellectual Property</h2>
          <p>
            SentinL, its branding, dashboard, bot behavior, code, design, and documentation are owned by SentinL or its developer unless otherwise stated. You retain ownership of your server content, but you grant SentinL the limited permission needed to process that content to provide the Service.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">14. Disclaimers</h2>
          <p>
            SentinL is provided on an "AS IS" and "AS AVAILABLE" basis. We do not guarantee uninterrupted operation, perfect accuracy, complete security, compatibility with every Discord server setup, or that SentinL will catch every harmful message.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">15. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, SentinL, its developer, and its service providers will not be liable for indirect, incidental, special, consequential, punitive, or lost-profit damages, or for moderation outcomes, server disputes, user discipline, Discord enforcement, third-party outages, data loss, or AI mistakes arising from use of the Service.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">16. Indemnity</h2>
          <p>
            You agree to defend and hold SentinL harmless from claims, losses, liabilities, damages, costs, and expenses arising from your server's use of SentinL, your configuration choices, your moderation actions, your violation of these Terms, or your violation of Discord rules or applicable law.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">17. Changes to These Terms</h2>
          <p>
            We may update these Terms as SentinL changes. Material changes will be communicated through the dashboard, website, support server, or another reasonable method. Continued use after changes means you accept the updated Terms.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">18. Contact</h2>
          <p>
            For questions about these Terms, billing, data deletion, or support, contact <a href="mailto:srinjoymahato9@gmail.com" className="text-primary hover:underline font-semibold">srinjoymahato9@gmail.com</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
