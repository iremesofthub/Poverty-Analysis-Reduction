import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "react-router-dom";
import { X, ShieldQuestion } from "lucide-react";
import { useTranslation } from "react-i18next";
import { governedApiConfigured, isKnownHref, routeAllows } from "@/lib/judgeFeatureRegistry";

// Plain-language proof panel for one discoverability feature (UPG-12, Surface D).
// It answers four things only: what this is for, where the numbers come from, what kind of result it is, and what
// it cannot tell you. Nothing here is allowed to call a result verified, live, production-ready or real-world
// impact: the wording comes from the translation files, and the unit test fails if those words ever appear.

const FIELDS = ["purpose", "source", "period", "population", "geography", "denominator", "method", "resultKind", "systemState", "limitation"];

// i18next returns the key itself when nothing is translated, which would print "discover.feature.x.y" on screen.
const copy = (t, key) => {
  const value = t(key);
  return value === key ? "" : value;
};

const featureCopy = (t, id) => {
  const base = `discover.feature.${id}`;
  const read = t(`discover.feature.${id}.proof`, { returnObjects: true });
  return {
    title: copy(t, `${base}.title`),
    subtitle: copy(t, `${base}.subtitle`),
    cta: copy(t, `${base}.cta`),
    fields: FIELDS.map((field) => ({ field, label: copy(t, `discover.field.${field}`), value: copy(t, `${base}.${field}`) })).filter((item) => item.value),
    proof: (Array.isArray(read) ? read : []),
  };
};

export const useFeatureCopy = (id) => {
  const { t } = useTranslation();
  return featureCopy(t, id);
};

export const stateLabel = (t, state) => copy(t, `discover.state.${state}`) || state;

// `resultKind` is stored as a machine token (surveyEstimate, demoRecord, ...) so the registry tests can check it.
// People must see the plain-language label for that token, in the language they are reading.
export const kindLabel = (t, kind) => copy(t, `discover.kind.${kind}`) || kind;

// The readable body, shared by the dialog on the dashboard cards and the inline panel in the mini entries.
export function EvidenceFields({ feature, role }) {
  const { t } = useTranslation();
  const text = featureCopy(t, feature.id);
  const known = feature.proof.filter((item) => isKnownHref(item.href) && routeAllows(role, item.href));
  const labelFor = (href) => text.proof.find((item) => item.href === href)?.label || href;
  return (
    <div className="space-y-2.5 text-[12px] leading-relaxed">
      {text.title && <p className="text-[13px] font-semibold text-ink">{text.title}</p>}
      <dl className="space-y-2">
        {text.fields.map(({ field, label, value }) => (
          <div key={field}>
            <dt className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-sub">{label || field}</dt>
            <dd className="mt-0.5 text-ink">
              {field === "resultKind" ? <span className="text-[#B54708]">{kindLabel(t, value)}</span> : value}
            </dd>
          </div>
        ))}
      </dl>
      {feature.dependsOnApi && (
        <p className="flex items-start gap-1.5 rounded-lg bg-canvas px-2.5 py-2 text-[11.5px] text-sub">
          <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {copy(t, governedApiConfigured() ? "discover.apiState.present" : "discover.apiState.missing")}
        </p>
      )}
      {known.length > 0 && (
        <div>
          <p className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-sub">{copy(t, "discover.field.proof")}</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {known.map((item) => (
              <li key={item.href}>
                <Link to={item.href} className="rounded-md border border-hairline bg-white px-2 py-1 text-[11.5px] font-medium text-brand hover:bg-canvas">
                  {labelFor(item.href)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function FeatureEvidenceSummary({ feature, role, open, onOpenChange }) {
  const { t } = useTranslation();
  if (!feature) return null;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[55] bg-[#0A2540]/30" />
        <Dialog.Content
          data-judge="feature-evidence"
          className="fixed left-1/2 top-1/2 z-[56] max-h-[calc(100dvh-32px)] w-[min(560px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-hairline bg-white p-5 shadow-[0_16px_48px_rgba(10,37,64,0.22)] outline-none"
        >
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-[15px] font-semibold text-ink">{copy(t, "discover.verified")}</Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-sub hover:text-ink" aria-label={copy(t, "discover.close") || "Close"}>
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{copy(t, `discover.feature.${feature.id}.title`)}</Dialog.Description>
          <div className="mt-3">
            <EvidenceFields feature={feature} role={role} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
