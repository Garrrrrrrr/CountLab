import Link from "next/link";
import { Panel } from "./ui";

export default function TermsPage() {
  return (
    <>
      <h1 className="text-3xl font-semibold">Terms of Service</h1>
      <p className="mt-2 text-zinc-400">Last updated August 14, 2026.</p>
      <div className="mt-7 space-y-5">
        <Panel>
          <p className="text-sm leading-6 text-zinc-300">
            CountLab is a personal, non-commercial project built by Garrick
            Tse for practicing Hi-Lo card counting and blackjack basic
            strategy. These terms are written in plain language rather than
            formal legal drafting, and they are not a substitute for legal
            advice. By using CountLab, you agree to the points below.
          </p>
        </Panel>
        <Panel>
          <h2 className="font-semibold">What CountLab is</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            CountLab is an educational and entertainment tool: drills,
            reference material, and Monte Carlo simulations for blackjack
            strategy and card counting. No real money changes hands anywhere
            on this site. CountLab does not offer real-money gambling, does
            not process payments, and is not affiliated with, endorsed by, or
            connected to any casino, card room, or gambling operator.
          </p>
        </Panel>
        <Panel>
          <h2 className="font-semibold">No warranty, no guarantee of accuracy</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            CountLab is provided &ldquo;as is,&rdquo; with no warranty of any
            kind. The strategy tables, count indices, and simulation results
            are built from published blackjack theory and are covered by
            automated tests, but no software is guaranteed to be free of
            errors. Nothing on this site is professional, financial, legal,
            or gambling advice, and nothing here guarantees any outcome at a
            real table. Card counting is legal at a private level in most
            jurisdictions but casinos are generally free to refuse service or
            remove players who count cards; you are solely responsible for
            knowing and following the laws and house rules that apply to you
            and for gambling responsibly, including only ever risking money
            you can afford to lose.
          </p>
        </Panel>
        <Panel>
          <h2 className="font-semibold">Access and the password</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            This section of the site is password-protected. Access is
            intended for the site owner and people the owner has personally
            shared the password with. Don&rsquo;t share the password
            publicly or attempt to bypass, brute-force, or circumvent the
            access control. Access may be restricted, and the password
            changed, at any time without notice.
          </p>
        </Panel>
        <Panel>
          <h2 className="font-semibold">Your data</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Any training history, saved simulations, or journal entries you
            create are stored only in your own browser. See the{" "}
            <Link href="/privacy" className="text-emerald-300 hover:underline">
              Privacy Policy
            </Link>{" "}
            for details. You&rsquo;re responsible for backing up anything you
            want to keep, using the export tools provided, before clearing
            your browser data or switching devices.
          </p>
        </Panel>
        <Panel>
          <h2 className="font-semibold">Content and third-party references</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Basic strategy, Hi-Lo counting, and the Illustrious 18 / Fab 4
            deviation concepts referenced on this site are established,
            publicly documented blackjack theory, not proprietary to
            CountLab. Simulation methodology and audit data are described in
            this project&rsquo;s own documentation. CountLab does not
            reproduce another product&rsquo;s source code, branding, or
            copyrighted text.
          </p>
        </Panel>
        <Panel>
          <h2 className="font-semibold">Limitation of liability</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            To the fullest extent permitted by law, Garrick Tse is not liable
            for any loss or damage &mdash; including gambling losses,
            data loss, or consequences of a casino&rsquo;s response to card
            counting &mdash; arising from your use of this site.
          </p>
        </Panel>
        <Panel>
          <h2 className="font-semibold">Changes</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            These terms may change as the project changes. Continued use
            after an update means you accept the current version. Material
            changes will update the date at the top of this page.
          </p>
        </Panel>
        <Panel>
          <h2 className="font-semibold">Contact</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Questions about these terms can be sent to{" "}
            <a href="mailto:g.tse8888@gmail.com" className="text-emerald-300 hover:underline">
              g.tse8888@gmail.com
            </a>
            .
          </p>
        </Panel>
      </div>
    </>
  );
}
