import { Panel } from "./ui";

export default function PrivacyPage() {
  return (
    <>
      <h1 className="text-3xl font-semibold">Privacy Policy</h1>
      <p className="mt-2 text-zinc-400">Last updated August 14, 2026.</p>
      <div className="mt-7 space-y-5">
        <Panel>
          <p className="text-sm leading-6 text-zinc-300">
            CountLab has no server, no database, and no user accounts. It is
            a static site: your browser downloads the app once and everything
            it does afterward &mdash; drills, simulations, your journal
            &mdash; runs locally on your device. This page explains exactly
            what that means.
          </p>
        </Panel>
        <Panel>
          <h2 className="font-semibold">What is stored, and where</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            CountLab uses your browser&rsquo;s local storage (not cookies) to
            remember, on this device only:
          </p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-400">
            <li>&bull; Table-rule and drill settings.</li>
            <li>&bull; Training session history and mistake logs from drills.</li>
            <li>&bull; Saved simulation runs and reusable setups.</li>
            <li>&bull; Journal entries: session results and bankroll transactions you choose to log.</li>
            <li>&bull; A session marker created after you enter the correct password, so you aren&rsquo;t asked for it on every visit.</li>
          </ul>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            None of this is ever sent to a server, because there isn&rsquo;t
            one. It never leaves your browser unless you explicitly export it
            yourself using the Export buttons provided on the relevant pages.
          </p>
        </Panel>
        <Panel>
          <h2 className="font-semibold">The password</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            The password that gates this section is never transmitted
            anywhere. When you enter it, your browser computes a cryptographic
            hash locally and compares it to a hash baked into the site at
            build time; the plaintext password itself is not stored in the
            site&rsquo;s code, is not sent over the network, and is not
            recoverable from anything published on this site.
          </p>
        </Panel>
        <Panel>
          <h2 className="font-semibold">No accounts, no tracking</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            There is no sign-up, no email collection, and no analytics,
            advertising, or third-party tracking scripts on this site as of
            this writing. If that ever changes, this page will be updated
            first.
          </p>
        </Panel>
        <Panel>
          <h2 className="font-semibold">Hosting-level logs</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            This site is hosted on GitHub Pages. Like any web host, GitHub
            Pages&rsquo; infrastructure may automatically log standard
            technical request data (such as IP address and request
            timestamps) as part of normal web server operation. That logging
            happens at the hosting layer, is outside CountLab&rsquo;s control,
            and is governed by GitHub&rsquo;s own privacy practices, not this
            page.
          </p>
        </Panel>
        <Panel>
          <h2 className="font-semibold">Clearing your data</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Clearing your browser&rsquo;s site data for this domain, or using
            your browser&rsquo;s private/incognito mode, removes everything
            listed above, including your login session. Export anything you
            want to keep first.
          </p>
        </Panel>
        <Panel>
          <h2 className="font-semibold">Children&rsquo;s privacy</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            CountLab does not knowingly collect personal information from
            anyone, including children, because it does not collect personal
            information from anyone.
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
