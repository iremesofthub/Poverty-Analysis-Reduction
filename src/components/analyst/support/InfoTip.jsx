import React, { useState } from "react";
import { Eye } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Small eye icon that explains an indicator. Opens on hover, keyboard focus or
// click/tap, and closes with Escape.
export default function InfoTip({ label, children, large = false, tourName = undefined, icon: Icon = Eye, ariaLabel = undefined, note = false }) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  return (
    <Popover open={hovered || pinned} onOpenChange={(open) => { if (!open) { setPinned(false); setHovered(false); } }}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={ariaLabel ?? `What does ${label} mean?`} data-tour={tourName}
          onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)} onBlur={() => setHovered(false)}
          onClick={(event) => { event.preventDefault(); setPinned((value) => !value); }}
          className={`inline-grid ${large ? "h-6 w-6" : "h-5 w-5"} place-items-center rounded ${note ? "text-amber-600 hover:bg-amber-50 hover:text-amber-700" : "text-sub/70 hover:bg-canvas hover:text-ink"} focus-visible:outline-2 focus-visible:outline-brand`}>
          <Icon className={large ? "h-3.5 w-3.5" : "h-3 w-3"} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" onOpenAutoFocus={(event) => event.preventDefault()}
        className={`${note ? "w-72" : "w-64"} border-hairline bg-white p-3 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-ink shadow-[0_8px_24px_rgba(10,37,64,0.12)]`}>
        <p className="mb-0.5 text-[11.5px] font-semibold">{label}</p>
        {children}
      </PopoverContent>
    </Popover>
  );
}

export const HELP = {
  poverty: "The percentage of people living below the poverty line (EICV7 2023/24). It counts people, not households.",
  vup: "Among households classified as poor, the weighted percentage that report taking part in a VUP programme (any of the five VUP survey sections). It measures reported participation, not payments received or who is eligible.",
  sample: "How many households were actually interviewed to build this estimate. It is a survey count, not the number of people or households in the district.",
  interval: "A range showing how uncertain an estimate is. These 95% intervals are design-based: they use the EICV7 sample weights, strata and primary sampling units, and they widen when a district has fewer surveyed households. They are calculated by this repository's survey engine and are pending independent scientific review. Where an interval is missing, the estimate could not be reconciled and no range is shown.",
  national: "The Rwanda-wide estimate for the same indicator, survey and period. Districts are compared with this line.",
};
