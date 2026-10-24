"use client";
import { CalendarRange, MapPin, Wallet, X } from "lucide-react";
import { Button, cx } from "@/components/ui";
import type { Bankroll } from "@/lib/blackjack/journal";
import { isNarrowed, isPeriodKey, PERIOD_OPTIONS, type DateFilter, type VenueChoice } from "./model";
import { InputField, PillSelect } from "./parts";
import type { JournalFilters } from "./useJournalScope";

/**
 * The three filters in one row of pills: dates, casino and bankroll, with
 * bankroll management beside them. A custom date range opens two date fields.
 */
export function Filters({ filters, onChange, venues, bankrolls, onManageBankrolls, className }: {
  filters: JournalFilters;
  onChange: (next: JournalFilters) => void;
  venues: VenueChoice[];
  bankrolls: Bankroll[];
  onManageBankrolls: () => void;
  className?: string;
}) {
  const multiple = bankrolls.length > 1;
  const setDates = (dates: DateFilter) => onChange({ ...filters, dates });
  const narrowed = isNarrowed(filters.dates) || filters.venue !== null;
  const swapped = filters.dates.period === "custom" && filters.dates.from && filters.dates.to && filters.dates.from > filters.dates.to;
  return (
    <div className={cx("grid grid-cols-1 gap-3", className)}>
      <div role="group" aria-label="Filters" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <PillSelect label="Dates" icon={<CalendarRange size={16} />} className="sm:w-48" value={filters.dates.period}
          onChange={(event) => { const period = event.target.value; if (isPeriodKey(period)) setDates({ ...filters.dates, period }); }}>
          {PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </PillSelect>
        <PillSelect label="Casino" icon={<MapPin size={16} />} className="sm:w-52" value={filters.venue ?? "*"} disabled={venues.length === 0}
          onChange={(event) => onChange({ ...filters, venue: event.target.value === "*" ? null : event.target.value })}>
          <option value="*">All casinos</option>
          {venues.map((venue) => <option key={venue.key || "none"} value={venue.key}>{venue.name} ({venue.count})</option>)}
        </PillSelect>
        {multiple && (
          <PillSelect label="Bankroll" icon={<Wallet size={16} />} className="sm:w-56" value={filters.bankroll} onChange={(event) => onChange({ ...filters, bankroll: event.target.value })}>
            <option value="all">All bankrolls</option>
            {bankrolls.map((bankroll) => <option key={bankroll.id} value={bankroll.id}>{bankroll.name}</option>)}
          </PillSelect>
        )}
        <Button variant="outline" size="sm" className={cx("!h-11 !rounded-full", !multiple && "col-span-2 justify-self-start")} icon={<Wallet size={16} aria-hidden />} onClick={onManageBankrolls}>
          {multiple ? "Bankrolls" : `Bankroll: ${bankrolls[0]?.name ?? "Main"}`}
        </Button>
        {narrowed && (
          <Button variant="ghost" size="sm" className="col-span-2 h-11 justify-self-start" icon={<X size={16} aria-hidden />} onClick={() => onChange({ ...filters, dates: { period: "all", from: "", to: "" }, venue: null })}>Clear filters</Button>
        )}
      </div>
      {filters.dates.period === "custom" && (
        <div className="grid grid-cols-2 gap-2 sm:max-w-md">
          <InputField label="From" type="date" value={filters.dates.from} onChange={(event) => setDates({ ...filters.dates, from: event.target.value })} />
          <InputField label="To" type="date" value={filters.dates.to} onChange={(event) => setDates({ ...filters.dates, to: event.target.value })} />
          {swapped && <p className="col-span-2 text-xs text-ink-3">The start is after the end, so the range runs between them.</p>}
        </div>
      )}
    </div>
  );
}
