import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useRole } from "@/lib/DemoAuthContext";
import { EvidenceFields } from "@/components/discovery/FeatureEvidenceSummary";
import { resolveFeature } from "@/lib/judgeFeatureRegistry";

// Surface B: one small, permission-aware entry embedded in the panel it belongs to. It never links to a page the
// route guard would refuse, and when the role cannot reach anything it says why in one line instead of redirecting.

function Entry({ id, role }) {
  const { t } = useTranslation();
  const resolved = resolveFeature(id, role);  const title = t(`discover.feature.${id}.title`);
  const cta = t(`discover.feature.${id}.cta`);
  if (!resolved.available) {
    return (
      <li data-feature={id} data-judge={`entry-${id}`} className="min-w-0 text-[11.5px] leading-relaxed text-sub">
        <span className="font-medium text-ink">{title}</span>
        <span aria-hidden="true"> · </span>
        {t(resolved.reason)}
      </li>
    );
  }
  return (
    <li data-feature={id} data-judge={`entry-${id}`} className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <Link to={resolved.href} className="text-[11.5px] font-medium text-brand hover:underline">
          {cta === id ? title : cta}
        </Link>
        <details className="min-w-0 flex-1">
          <summary className="cursor-pointer text-[11.5px] text-sub hover:text-ink">{t("discover.verified")}</summary>
          <div className="mt-2 rounded-lg border border-hairline bg-white p-3">
            <EvidenceFields feature={resolved.feature} role={role} />
          </div>
        </details>
      </div>
    </li>
  );
}

export default function FeatureMiniEntry({ ids, role, anchor = "mini-entry", titleKey = null, className = "" }) {
  const { t } = useTranslation();
  const signedInRole = useRole();
  const effectiveRole = role || signedInRole;
  if (!ids?.length) return null;
  return (
    <section data-judge={anchor} className={`rounded-xl border border-hairline bg-canvas/60 p-3 ${className}`}>
      {titleKey && <p className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.06em] text-brand">{t(titleKey)}</p>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {ids.map((id) => <Entry key={id} id={id} role={effectiveRole} />)}
      </ul>
    </section>
  );
}
