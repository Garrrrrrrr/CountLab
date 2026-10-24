import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/contact";
import { LegalLayout, LegalSection } from "./LegalLayout";

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" updated="October 24, 2026"
      intro={<p>CountLab is a personal, non-commercial project for practising Hi-Lo card counting and blackjack strategy. These terms are written in plain language rather than formal legal drafting, and they are not a substitute for legal advice. By using CountLab, you agree to the points below.</p>}>
      <LegalSection title="What CountLab is">
        <p>An educational tool: counting and strategy drills, a full-shoe practice table, strategy and index charts, a bankroll calculator and a session journal. No real money changes hands anywhere on this site. CountLab does not offer real-money gambling, does not process payments, and is not affiliated with, endorsed by, or connected to any casino, card room or gambling operator.</p>
      </LegalSection>
      <LegalSection title="No warranty, no guarantee of accuracy">
        <p>CountLab is provided &ldquo;as is&rdquo;, with no warranty of any kind. The strategy tables, count indices and calculator results are built from published blackjack theory and checked by automated tests, but no software is guaranteed to be free of errors. Nothing on this site is professional, financial, legal or gambling advice, and nothing here guarantees any outcome at a real table.</p>
        <p>Card counting is legal in most places, but casinos are generally free to refuse service to players who count. You are responsible for knowing and following the laws and house rules that apply to you, and for gambling responsibly: only ever risk money you can afford to lose.</p>
      </LegalSection>
      <LegalSection title="Accounts and guest use">
        <p>You can use CountLab as a guest or with an account (email and password, or Google). An account lets your training history, settings and journal sync across devices; as a guest everything stays on the device you are using. See the <Link href="/privacy">Privacy Policy</Link> for what each stores.</p>
        <p>Keep your password confidential; you are responsible for activity under your account. Don&rsquo;t try to brute-force sign-in, create accounts to abuse the service, or get around the rate limits on sign-in attempts and data writes. Accounts that abuse the service may be suspended.</p>
      </LegalSection>
      <LegalSection title="Your data">
        <p>Signed in, your settings, drill history and journal are stored in this project&rsquo;s database, scoped to your account, and cached on your device. As a guest the same data lives only in your browser. Either way, back up anything you want to keep with the export tools in Settings before clearing browser data, switching devices or deleting your account.</p>
      </LegalSection>
      <LegalSection title="Content and third-party references">
        <p>Basic strategy, the Hi-Lo count and the published index plays used here (including the Blackjack Apprenticeship H17 chart, the Illustrious 18 and Fab 4, and Wong&rsquo;s early-surrender table) are established blackjack theory; their sources are named where they are used. CountLab does not reproduce another product&rsquo;s source code, branding or copyrighted text.</p>
      </LegalSection>
      <LegalSection title="Limitation of liability">
        <p>To the fullest extent permitted by law, the maintainer of CountLab is not liable for any loss or damage, including gambling losses, data loss, account loss, or a casino&rsquo;s response to card counting, arising from your use of this site.</p>
      </LegalSection>
      <LegalSection title="Changes">
        <p>These terms may change as the project changes. Continued use after an update means you accept the current version; material changes update the date at the top of this page.</p>
      </LegalSection>
      <LegalSection title="Contact">
        <p>Questions, or requests to delete your account and its data: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
      </LegalSection>
    </LegalLayout>
  );
}
