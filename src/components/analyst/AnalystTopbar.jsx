import React from "react";
import { Download } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROVINCES } from "@/data/nisr";
import InfoTip from "@/components/analyst/support/InfoTip";
import { useTranslation } from "react-i18next";
import { introKey } from "@/components/tour/tours";

export default function AnalystTopbar({ province, onProvinceChange, onExport, title = "Poverty Analysis", introPath = "/" }) {
  const { t } = useTranslation();
  return (
    <div className="sticky top-0 z-30 border-b border-hairline bg-white/85 backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
        <h1 data-tour="page-title" className="min-w-0 truncate text-[15px] font-semibold tracking-tight text-ink">{title}</h1>
        <InfoTip label={title} large>{t(introKey(introPath))}</InfoTip>
        <span className="hidden items-center gap-1.5 rounded-full border border-hairline px-2 py-[3px] text-[11px] text-sub sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-pos" />
          Latest data: 2023/24
        </span>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Select value={province} onValueChange={onProvinceChange}>
            <SelectTrigger data-tour="analysis-filter" className="h-8 w-[132px] rounded-md border-hairline text-[12px] text-ink sm:w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[12.5px]">All Rwanda</SelectItem>
              {PROVINCES.map((p) => (
                <SelectItem key={p} value={p} className="text-[12.5px]">{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {onExport && (<button
            data-tour="analysis-export"
            onClick={onExport}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#524BE0]"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2.2} />
            Export
          </button>)}

          <div className="hidden h-7 w-7 place-items-center rounded-full bg-ink text-[10px] font-semibold text-white sm:grid">
            AK
          </div>
        </div>
      </div>
    </div>
  );
}
