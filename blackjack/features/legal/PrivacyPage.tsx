import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/contact";
import { LegalLayout, LegalSection } from "./LegalLayout";

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="October 24, 2026"
      intro={<p>CountLab has no ad network and no third-party trackers, and it does not sell or share your data. It does have optional accounts, so your training can follow you across devices, and it records how the app is used. This page explains exactly what is collected, where it is stored and who can see it.</p>}>
      <LegalSection title="Accounts and guest use">
        <ul>
          <li><b>Email and password:</b> handled by Supabase Auth. CountLab stores your email address and a password hash; the password itself is never stored or visible to CountLab.</li>
          <li><b>Google sign-in:</b> Google shares your name, email and profile photo with CountLab (through Supabase) to create your account. CountLab never receives your Google password; Google&rsquo;s own policy governs what Google collects.</li>
          <li><b>Guest:</b> no account is created. Training and settings stay on your device unless you later sign in and choose to import them.</li>
        </ul>
      </LegalSection>
      <LegalSection title="Your training data">
        <p>Signed in, this is stored in CountLab&rsquo;s database (hosted on Supabase), protected by row-level security so only your account can read or write it, and cached in your browser:</p>
        <ul>
          <li>Table rules and drill settings.</li>
          <li>Drill history, unfinished-drill progress and mistake logs.</li>
          <li>Journal sessions, bankrolls and cash movements you log.</li>
        </ul>
        <p>As a guest, the same data stays in your browser&rsquo;s storage and is never sent anywhere unless you export it. Saved calculator scenarios and saved full-shoe reviews are kept in your browser.</p>
      </LegalSection>
      <LegalSection title="Analytics">
        <p>With your permission (asked the first time you visit, and changeable in <Link href="/settings">Settings</Link>), CountLab records what you do in the app: pages visited, signing in or out, drill answers and their correctness, hands played at the full-shoe table, calculator use, journal and settings changes, and clicks on buttons and links. Each event carries your account&rsquo;s internal ID (signed in) or a random device ID (guest), the page and a few details about the action, such as whether an answer was right or a button&rsquo;s visible label. It never includes page content, keystrokes or anything typed into a form.</p>
        <p>Events also include coarse device and browser information, the app release, performance timings, the referring domain and allow-listed campaign tags. Country and region may be added coarsely while a request is processed; IP addresses are one-way hashed only for short-lived abuse prevention and are never stored in analytics. Exact bankroll amounts, email addresses, authentication tokens and free-form answers are never recorded. Detailed events are kept for up to 400 days and error records for up to 180 days.</p>
        <p>This data is not sold, shared with advertisers or used for anything beyond understanding and improving CountLab. Only accounts the site owner has granted admin access can read it; database security blocks everyone else. Nothing here follows you to other websites.</p>
      </LegalSection>
      <LegalSection title="Infrastructure">
        <p>The site&rsquo;s files are hosted on GitHub Pages; accounts, the database and analytics on Supabase. Both act as data processors: they run the servers, CountLab controls what is stored and who can read it. Like any web host, GitHub Pages may log standard request data (such as IP address and time) under its own privacy practices.</p>
      </LegalSection>
      <LegalSection title="Deleting your data">
        <p>Use <b>Delete analytics history</b> in Settings to remove this device&rsquo;s analytics and, when signed in, analytics linked to your account. Clearing your browser&rsquo;s site data removes the local copy but cannot retract events already sent. To delete your account, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> (Settings has a shortcut); that removes your settings, drill history, journal and the link between your account and its analytics, and you may ask for the analytics events themselves to be deleted too. Export anything you want to keep first.</p>
      </LegalSection>
      <LegalSection title="Children">
        <p>CountLab is not directed at children and does not knowingly collect their personal information.</p>
      </LegalSection>
      <LegalSection title="Changes and contact">
        <p>If this policy changes, the date at the top changes too. Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
      </LegalSection>
    </LegalLayout>
  );
}
