import { Badge, Card, PageHeader } from "@/components/ui";
import { CHANGELOG, entryDate, type ChangelogEntry, type ChangelogShot } from "@/lib/changelog";

const TAG_TONE = { new: "brand", improved: "info", fixed: "pos", removed: "neutral" } as const;
const TAG_LABEL = { new: "New", improved: "Improved", fixed: "Fixed", removed: "Removed" } as const;

function Shot({ shot }: { shot: ChangelogShot }) {
  return (
    <figure className={shot.phone ? "w-[min(100%,15rem)]" : "w-full"}>
      <a href={shot.src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-line bg-surface-2">
        {/* A plain <img>: the export has no image optimizer, and these files are already sized for the web. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shot.src} alt={shot.alt} width={shot.phone ? 390 : 1280} height={shot.phone ? 844 : 800} loading="lazy" decoding="async" className="h-auto w-full" />
      </a>
      <figcaption className="mt-1.5 text-xs leading-5 text-ink-3">{shot.caption}</figcaption>
    </figure>
  );
}

function Entry({ entry }: { entry: ChangelogEntry }) {
  const wide = entry.shots?.filter((shot) => !shot.phone) ?? [];
  const phone = entry.shots?.filter((shot) => shot.phone) ?? [];
  return (
    <Card as="article" aria-labelledby={entry.id} id={`update-${entry.id}`} className="scroll-mt-20">
      <p className="tnum text-sm text-ink-3"><time dateTime={entry.date}>{entryDate(entry)}</time></p>
      <h2 id={entry.id} className="mt-1 text-xl font-semibold leading-snug">{entry.title}</h2>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {entry.tags.map((tag) => <Badge key={tag} tone={TAG_TONE[tag]}>{TAG_LABEL[tag]}</Badge>)}
      </div>
      <p className="mt-3 text-[0.9375rem] leading-7 text-ink-2">{entry.summary}</p>
      {wide.length > 0 && <div className="mt-4 grid gap-4">{wide.map((shot) => <Shot key={shot.src} shot={shot} />)}</div>}
      {phone.length > 0 && <div className="mt-4 flex flex-wrap justify-center gap-4 sm:justify-start">{phone.map((shot) => <Shot key={shot.src} shot={shot} />)}</div>}
      {entry.groups.map((group) => (
        <section key={group.title} className="mt-5">
          <h3 className="text-sm font-semibold">{group.title}</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[0.9375rem] leading-7 text-ink-2 marker:text-ink-3">
            {group.items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      ))}
    </Card>
  );
}

export function ChangelogPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="What's new" sub="Every CountLab release since launch, newest first. Screenshots show the site as it is today." />
      <div className="grid gap-4 sm:gap-5">
        {CHANGELOG.map((entry) => <Entry key={entry.id} entry={entry} />)}
      </div>
    </div>
  );
}
