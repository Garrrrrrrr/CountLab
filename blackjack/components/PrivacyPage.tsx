import { CONTACT_EMAIL } from "@/lib/contact";
import { Panel } from "./ui";

export default function PrivacyPage() {
  return (
    <>
      <h1 className="text-3xl font-semibold">Privacy Policy</h1>
      <p className="mt-2 text-zinc-400">Last updated August 15, 2026.</p>
      <div className="mt-7 space-y-5">
        <Panel>
          <p className="text-sm leading-6 text-zinc-300">
            CountLab has no ad network, no third-party trackers, and doesn&rsquo;t
            sell or share your data. It does have accounts (so your training
            history can follow you across devices) and it does track what you
            do in the app, so the sections below explain exactly what is
            collected, where it&rsquo;s stored, and who can see it.
          </p>
        </Panel>
        <Panel>
          <h2 className="font-semibold">Accounts and guest mode</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            You can sign in with an email and password, sign in with Google,
            or skip accounts entirely and continue as a guest.
          </p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-400">
            <li>&bull; <b className="text-zinc-300">Email/password:</b> handled by Supabase Auth. CountLab stores your email address and an encrypted password hash; the plaintext password is never stored or visible to CountLab.</li>
            <li>&bull; <b className="text-zinc-300">Google sign-in:</b> Google shares your name, email, and profile photo with CountLab (via Supabase) to create your account. CountLab does not receive your Google password. Google&rsquo;s own privacy policy governs what Google itself collects when you use this option.</li>
            <li>&bull; <b className="text-zinc-300">Guest mode:</b> no account is created. Training records and settings stay on your device unless you later sign in. First-party usage analytics are sent under a random device identifier as described below.</li>
          </ul>
        </Panel>
        <Panel>
          <h2 className="font-semibold">Your training data</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            If you&rsquo;re signed in, the following is stored in
            CountLab&rsquo;s database (hosted on Supabase), scoped to your
            account with row-level security so only you can read or write
            it, and cached in your browser for instant reads:
          </p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-400">
            <li>&bull; Table-rule and drill settings.</li>
            <li>&bull; Training session history, drill progress, and mistake logs.</li>
            <li>&bull; Bankroll/session journal entries and transactions you choose to log.</li>
          </ul>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            In guest mode, this same data is kept only in your browser&rsquo;s
            local storage and is never sent anywhere unless you export it
            yourself, or later sign in. Saved simulation runs and reusable
            setups are always kept locally in your browser, signed in or not.
          </p>
        </Panel>
        <Panel>
          <h2 className="font-semibold">Analytics: what&rsquo;s tracked</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            CountLab records the actions you take in the app &mdash; things
            like which pages you visit, signing in or out, hands played and
            decisions made at the casino-game tables, drill questions
            answered, simulations run, journal/settings changes, and general
            clicks and taps on buttons and links across the site (including
            scroll depth on longer pages and outbound link clicks) &mdash; to
            a first-party analytics table so the site&rsquo;s owner can see
            how the app is actually used. Each event is tagged with either
            your account&rsquo;s internal ID (if signed in) or your
            device&rsquo;s random local ID (if a guest), plus the page path
            and a few relevant details about the action (for example, a
            drill answer&rsquo;s correctness or a clicked button&rsquo;s
            visible label, not full page content, keystrokes, or anything
            you type into a form field).
          </p>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Events also include coarse device/browser information, app release,
            performance measurements, referring domain and allow-listed campaign
            tags. When the hosting edge provides it, country and region are
            added coarsely while the request is processed; raw IP addresses
            are one-way hashed only for short-lived abuse prevention and are
            never stored in analytics. CountLab does not store precise location, authentication
            tokens, exact bankroll values, email addresses, or free-form answers
            in analytics. Detailed events are retained for up to 400 days and
            normalized error records for up to 180 days under the current,
            administrator-configurable retention policy.
          </p>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            This data is not sold, shared with advertisers, or used for
            anything beyond understanding and improving CountLab. It&rsquo;s
            readable only by accounts the site owner has explicitly granted
            admin access to &mdash; row-level security in the database blocks
            everyone else, including other signed-in users, from reading it
            back. There is no cross-site tracking: nothing here follows you
            to other websites, and no advertising or marketing pixels are
            embedded in this site.
          </p>
        </Panel>
        <Panel>
          <h2 className="font-semibold">Infrastructure</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            CountLab&rsquo;s static files are hosted on GitHub Pages; accounts,
            the database, and analytics are hosted on Supabase. Both are
            third-party infrastructure providers acting as data processors
            for CountLab &mdash; they run the servers, but CountLab controls
            what&rsquo;s stored and who can read it. Like any web host,
            GitHub Pages may automatically log standard technical request
            data (such as IP address and timestamps) as part of normal
            server operation; that logging happens at the hosting layer, is
            outside CountLab&rsquo;s control, and is governed by
            GitHub&rsquo;s own privacy practices.
          </p>
        </Panel>
        <Panel>
          <h2 className="font-semibold">Deleting your data</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Use <b>Delete analytics history</b> in Settings to remove this
            device&rsquo;s analytics and, when signed in, analytics linked to your
            account. Clearing browser site data also removes the local copy,
            but cannot retract events already delivered to the server. For a
            full account deletion request, email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-emerald-300 hover:underline">
              {CONTACT_EMAIL}
            </a>{" "}
            to request deletion; deleting the account removes your settings,
            drill history, journal, and the link between your account and its
            analytics history. You may also request full deletion of associated
            analytics events and sessions. Export anything you want to keep
            first, using the export tools provided.
          </p>
        </Panel>
        <Panel>
          <h2 className="font-semibold">Children&rsquo;s privacy</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            CountLab does not knowingly collect personal information from
            children and is not directed at them.
          </p>
        </Panel>
        <Panel>
          <h2 className="font-semibold">Changes</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            If this policy changes, the date at the top of this page will be
            updated.
          </p>
        </Panel>
        <Panel>
          <h2 className="font-semibold">Contact</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Questions can be sent to{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-emerald-300 hover:underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Panel>
      </div>
    </>
  );
}
