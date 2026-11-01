import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, ShieldOff, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { judgeTour } from "@/lib/judgeFeatureRegistry";

// Surface C: the judge walkthrough (UPG-12). This is deliberately a second machine next to the educational page
// tour, because the page tour ends when the route changes and this one has to survive it. Steps point at
// `data-judge` markers - never at headings or positions - and the shell that mounts this component stays mounted
// across every route, so navigation cannot close the tour.
//
// Two rules keep it honest: Next always advances (a step whose marker cannot be found explains itself instead of
// stalling), and a step the signed-in role cannot reach is announced as unavailable with a read-only explanation.
// The tour is not a security feature: it navigates only to routes the guard already allows, and it never claims a
// review, a payment or an outcome the user did not perform.

const anchorFor = (step) => (step.available ? document.querySelector(`[data-judge="${step.anchor}"]`) : null);
const visible = (node) => {
  const box = node?.getBoundingClientRect();
  return Boolean(box && box.width > 0 && box.height > 0);
};
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function JudgeWalkthrough({ role, request = 0 }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();
  const steps = useMemo(() => judgeTour(role), [role]);
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [missing, setMissing] = useState(false);
  const [position, setPosition] = useState({ top: 16, left: 16 });
  const contentRef = useRef(null);
  const launcher = useRef(null);
  const handled = useRef(0);
  const direction = useRef(1);

  const step = steps[index];
  const last = index === steps.length - 1;

  const open = useCallback(() => {
    launcher.current = document.activeElement;
    direction.current = 1;
    setIndex(0);
    setRect(null);
    setMissing(false);
    setActive(true);
  }, []);

  const close = useCallback(() => {
    setActive(false);
    setRect(null);
    // Focus goes back to whatever launched the walkthrough, so a keyboard user is not dropped at the top of the
    // page. Radix keeps its focus trap alive while the dialog leaves the document, and the trap undoes a restore
    // that happens too early, so the launcher is refocused after the content is really gone.
    const node = launcher.current;
    setTimeout(() => {
      if (node && node !== document.body && document.contains(node)) node.focus();
    }, 0);
  }, []);

  useEffect(() => {
    if (request > 0 && request !== handled.current) {
      handled.current = request;
      open();
    }
  }, [request, open]);

  // Take the person to the screen the step belongs to, then let the measuring loop find the marker there.
  // Two steps can share a page and point at different parts of it, so the hash is part of the destination:
  // without it the tour would leave the reader on the previous step's anchor while claiming to have moved on.
  useEffect(() => {
    if (!active || !step?.available || !step.href) return;
    const [pathWithQuery, targetHash = ""] = step.href.split("#");
    const [targetPath, targetQuery = ""] = pathWithQuery.split("?");
    const wantedSearch = targetQuery ? `?${targetQuery}` : "";
    const wantedHash = targetHash ? `#${targetHash}` : "";
    if (pathname !== targetPath || (wantedSearch && search !== wantedSearch) || hash !== wantedHash) {
      setRect(null);
      setMissing(false);
      navigate(step.href);
    }
  }, [active, step, pathname, search, hash, navigate]);

  useEffect(() => {
    if (!active || !step) return undefined;
    let frame;
    let seenElement = null;
    let waitingSince = null;
    const measure = () => {
      const element = anchorFor(step);
      if (step.available && element && visible(element)) {
        if (element !== seenElement) {
          seenElement = element;
          setMissing(false);
          element.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
        }
        const box = element.getBoundingClientRect();
        const top = Math.max(0, box.top);
        const next = { top, left: box.left, width: box.width, height: Math.min(box.bottom, window.innerHeight - 4) - top };
        setRect((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
        waitingSince = null;
      } else {
        setRect(null);
        waitingSince ??= Date.now();
        if (Date.now() - waitingSince > 2500) setMissing(true);
      }
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.min(360, vw - 24);
      const height = contentRef.current?.offsetHeight || 260;
      const clampLeft = (value) => Math.max(12, Math.min(value, vw - width - 12));
      const clampTop = (value) => Math.max(12, Math.min(value, vh - height - 12));
      const current = anchorFor(step)?.getBoundingClientRect();
      let next;
      if (!current || !visible(current)) next = { left: clampLeft((vw - width) / 2), top: clampTop((vh - height) / 2) };
      else if (vw < 640) next = { left: 12, top: current.top + current.height / 2 > vh * 0.55 && current.height < vh * 0.5 ? 12 : vh - height - 12 };
      else if (vw - current.left - current.width >= width + 28) next = { left: current.left + current.width + 16, top: clampTop(current.top) };
      else if (vh - (current.top + current.height) >= height + 28) next = { left: clampLeft(current.left), top: current.top + current.height + 14 };
      else next = { left: clampLeft(vw - width - 16), top: vh - height - 16 };
      setPosition((old) => (old.top === next.top && old.left === next.left ? old : next));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    const sizeObserver = new ResizeObserver(schedule);
    if (contentRef.current) sizeObserver.observe(contentRef.current);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    schedule();
    const settle = setTimeout(schedule, 1800);
    return () => {
      clearTimeout(settle);
      cancelAnimationFrame(frame);
      observer.disconnect();
      sizeObserver.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [active, step]);

  if (!step) return null;
  const analystAction = step.id === "action" && role === "nisr_analyst";
  const titleKey = `discover.tour.${step.id}.title`;
  const textKey = analystAction ? "discover.tour.actionAnalyst.text" : `discover.tour.${step.id}.text`;
  const summary = t(`discover.feature.${step.featureId}.subtitle`);

  return (
    <Dialog.Root open={active} onOpenChange={(open) => { if (!open) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-[#0A2540]/25" />
        {rect && (
          <div
            aria-hidden="true"
            data-judge="walkthrough-highlight"
            className="pointer-events-none fixed z-[61] rounded-md ring-2 ring-brand transition-all duration-150"
            style={{ top: rect.top - 5, left: rect.left - 5, width: rect.width + 10, height: rect.height + 10, boxShadow: "0 0 0 9999px rgba(10,37,64,0.18)" }}
          />
        )}
        <Dialog.Content
          ref={contentRef}
          data-judge="walkthrough"
          aria-describedby="judge-walkthrough-text"
          className="fixed z-[62] max-h-[calc(100dvh-24px)] w-[360px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl border border-hairline bg-white shadow-[0_12px_40px_rgba(10,37,64,0.22)] outline-none"
          style={position}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-3">
            <div aria-live="polite" aria-atomic="true">
              <p className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-brand">{t("discover.tour.stepOf", { current: index + 1, total: steps.length })}</p>
              <Dialog.Title as="h2" className="mt-0.5 flex items-center gap-2 text-[14px] font-semibold text-ink">
                {!step.available && <ShieldOff aria-hidden="true" className="h-4 w-4 shrink-0 text-[#B54708]" />}
                {step.available ? t(titleKey) : t("discover.tour.unavailable.title")}
              </Dialog.Title>
            </div>
            <Dialog.Close className="rounded-md p-1 text-sub hover:text-ink" aria-label={t("tour.close")}>
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="px-4 py-3">
            <p id="judge-walkthrough-text" className="text-[13px] leading-relaxed text-ink">
              {step.available
                ? missing
                  ? `${t(textKey)} ${t("discover.tour.notFound")}`
                  : t(textKey)
                : t("discover.tour.unavailable.text", { reason: t("discover.blocked.roleNotPermitted"), summary })}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3">
            <button
              type="button"
              onClick={() => { direction.current = -1; setIndex((value) => Math.max(0, value - 1)); }}
              disabled={index === 0}
              className="flex items-center gap-1 text-[12.5px] font-medium text-sub hover:text-ink disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              {t("tour.back")}
            </button>
            {!last && <button type="button" onClick={close} className="text-[12.5px] text-sub hover:text-ink">{t("tour.skip")}</button>}
            <button
              type="button"
              data-judge="walkthrough-next"
              onClick={() => { direction.current = 1; if (last) close(); else setIndex((value) => Math.min(steps.length - 1, value + 1)); }}
              className="flex items-center gap-1 rounded-md bg-brand px-3 py-2 text-[12.5px] font-medium text-white hover:bg-brand/90"
            >
              {last ? t("discover.tour.finish") : t("tour.next")}
              {!last && <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
