import React from "react";
import { ChevronDown, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LANGUAGES, setLanguage } from "@/i18n";

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language || "en";

  return (
    <label className="group flex w-full items-center gap-2 rounded-md px-2 py-2 text-[12.5px] text-sub hover:bg-canvas hover:text-ink">
      <Languages className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span className="sr-only">Language</span>
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value)}
        className="min-w-0 flex-1 cursor-pointer appearance-none bg-transparent font-medium text-ink outline-none"
        aria-label="Language"
      >
        {LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
      </select>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-sub group-hover:text-ink" aria-hidden="true" />
    </label>
  );
}
