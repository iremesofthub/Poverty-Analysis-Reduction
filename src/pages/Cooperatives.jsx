import React, { useState } from "react";
import { AlertCircle, CheckCircle2, Clock, MapPin, Users } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import PanelGuide from "@/components/analyst/PanelGuide";
import { HealthChip } from "@/components/government/GovCooperatives";
import { ago } from "@/components/requests/bits";
import { useDemoAuth, useRole } from "@/lib/DemoAuthContext";
import { beneficiaryFor, requestJoin, useCooperatives, withdrawJoin } from "@/lib/cooperatives";
import { useTranslation } from "react-i18next";

const REQUEST_STYLE = { Endorsed: "border-[#D3CEFF] bg-[#EFEDFF] text-[#4B3FCC]", Pending: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]", Approved: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]", Declined: "border-[#FEE4E2] bg-[#FEF3F2] text-[#B42318]", Withdrawn: "border-hairline bg-[#FAFBFD] text-[#8A94A6]" };

// Where a beneficiary asks to join a cooperative. A sector or district leader decides; the beneficiary sees the answer here.
export default function Cooperatives() {
  const { t } = useTranslation();
  const role = useRole();
  const { demoUser } = useDemoAuth();
  const store = useCooperatives();
  const me = role === "beneficiary" ? beneficiaryFor(demoUser) : null;
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState(null);

  const mine = me ? store.coopOf(me.id) : null;
  const myRequests = me ? store.requests.filter((item) => item.beneficiaryId === me.id) : [];
  const waiting = myRequests.find((item) => ["Pending", "Endorsed"].includes(item.status));
  const visible = (me ? store.coops.filter((coop) => coop.district === me.district) : store.coops).slice().sort((a, b) => Number(b.sector === me?.sector) - Number(a.sector === me?.sector));

  const ask = (coop) => { setError(""); try { requestJoin(me.id, coop.id); setSentTo(coop.name); } catch (failure) { setError(failure.message); } };
  const stateOf = (coop) => (mine?.id === coop.id ? "member" : waiting?.coopId === coop.id ? "waiting" : mine || waiting ? "blocked" : coop.joinStatus !== "Open" ? "closed" : "ask");

  return (
    <div className="pb-14">
      <PageHeader title={t("pageTitles.cooperatives")} badge={<span className="hidden items-center gap-1.5 rounded-full border border-hairline px-2 py-[3px] text-[11px] text-sub sm:inline-flex">{me ? `${me.sector}, ${me.district}` : `${store.coops.length} cooperatives`}</span>} />

      <PanelGuide id="cooperatives" title={t("cooperativesPage.helpTitle")}>
        {t("cooperativesPage.help")}
      </PanelGuide>

      <div className="mx-auto max-w-[1100px] px-4 py-5 sm:px-6 lg:px-8">
        {!me && <p className="mb-4 rounded-lg border border-hairline bg-white p-3 text-[12px] text-sub">{t("cooperativesPage.adminNotice", { name: demoUser?.name || "an administrator" })}</p>}

        {me && <section data-tour="coop-mine" className="mb-5 rounded-xl border border-hairline bg-white p-4 sm:p-5">
          <h2 className="text-[14px] font-semibold text-ink">{t("cooperativesPage.yourCooperative")}</h2>
          {mine ? <div className="mt-3 flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="flex items-center gap-2 text-[15px] font-semibold text-ink"><CheckCircle2 className="h-4 w-4 text-[#067647]" />{mine.name}</p><p className="mt-1 text-[12px] text-sub">{mine.activity} · {mine.sector}, {mine.district} · {t("cooperativesPage.ledBy", { name: mine.leader })}</p><p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-ink">{mine.purpose}</p></div><HealthChip health={mine.health} /></div>
            : waiting ? <p className="mt-2 flex items-center gap-2 text-[12.5px] text-ink"><Clock className="h-4 w-4 text-[#B54708]" />{t("cooperativesPage.yourRequest", { name: store.coops.find((coop) => coop.id === waiting.coopId)?.name, when: ago(waiting.createdAt) })}<button type="button" onClick={() => withdrawJoin(waiting.id)} className="ml-2 text-[11.5px] font-medium text-brand hover:underline">{t("cooperativesPage.withdraw")}</button></p>
              : <p className="mt-2 text-[12.5px] text-sub">{t("cooperativesPage.notYet")}</p>}
          {sentTo && !mine && <p role="status" className="mt-3 rounded-md border border-[#ABEFC6] bg-[#ECFDF3] p-2.5 text-[12px] text-[#067647]">{t("cooperativesPage.requestSent", { name: sentTo })}</p>}
        </section>}

        {error && <p role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-[12px] text-red-700"><AlertCircle className="mt-px h-4 w-4 shrink-0" />{error}</p>}

        <h2 className="mb-2 text-[16px] font-semibold tracking-tight text-ink">{me ? t("cooperativesPage.inDistrict", { district: me.district }) : t("cooperativesPage.all")}</h2>
        {visible.length === 0 ? <p className="rounded-xl border border-dashed border-hairline bg-white p-8 text-center text-[12.5px] text-sub">{t("cooperativesPage.noDistrict")}</p>
          : <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{visible.map((coop) => { const state = me ? stateOf(coop) : "view"; return <article key={coop.id} className="rounded-xl border border-hairline bg-white p-4">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="text-[13.5px] font-semibold text-ink">{coop.name}</h3><p className="mt-0.5 flex items-center gap-1 text-[11px] text-sub"><MapPin className="h-3 w-3" />{coop.sector}, {coop.district}{me && coop.sector === me.sector && <span className="ml-1 rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand">{t("cooperativesPage.yourSector")}</span>}</p></div><HealthChip health={coop.health} /></div>
            <p className="mt-2 text-[11.5px] font-medium text-ink">{coop.activity}</p>
            <p className="mt-1 line-clamp-3 text-[11.5px] leading-relaxed text-sub">{coop.purpose}</p>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-hairline pt-3"><span className="flex items-center gap-1 text-[11px] text-sub"><Users className="h-3.5 w-3.5" />{coop.members} {t("cooperativesPage.members")}</span>
              {state === "ask" && <button type="button" onClick={() => ask(coop)} className="rounded-md bg-brand px-3 py-1.5 text-[11.5px] font-medium text-white hover:bg-[#524BE0]">{t("cooperativesPage.askJoin")}</button>}
              {state === "member" && <span className="text-[11.5px] font-medium text-[#067647]">{t("cooperativesPage.member")}</span>}
              {state === "waiting" && <span className="text-[11.5px] font-medium text-[#B54708]">{t("cooperativesPage.sent")}</span>}
              {state === "closed" && <span className="text-[11.5px] text-[#8A94A6]">{coop.joinStatus === "Full" ? t("cooperativesPage.full") : t("cooperativesPage.notAccepting")}</span>}
              {state === "blocked" && <span className="text-[11.5px] text-[#8A94A6]">{mine ? t("cooperativesPage.inCooperative") : t("cooperativesPage.pendingElsewhere")}</span>}
              {state === "view" && <span className={`text-[11.5px] font-medium ${coop.joinStatus === "Open" ? "text-[#067647]" : "text-[#8A94A6]"}`}>{coop.joinStatus === "Open" ? t("cooperativesPage.accepting") : coop.joinStatus}</span>}</div>
          </article>; })}</div>}

        {me && myRequests.length > 0 && <section data-tour="coop-requests" className="mt-6"><h2 className="mb-2 text-[14px] font-semibold text-ink">{t("cooperativesPage.requests")}</h2><ul className="space-y-2">{myRequests.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-white px-3 py-2.5"><div className="min-w-0"><p className="text-[12.5px] font-medium text-ink">{store.coops.find((coop) => coop.id === item.coopId)?.name}</p><p className="text-[10.5px] text-sub">{t("cooperativesPage.askedBy", { when: ago(item.createdAt) })}{item.decidedBy ? ` · ${t("cooperativesPage.decidedBy", { name: item.decidedBy })}` : ""}{item.note ? ` · "${item.note}"` : ""}</p></div><span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${REQUEST_STYLE[item.status]}`}>{item.status === "Pending" ? t("cooperativesPage.withSector") : item.status === "Endorsed" ? t("cooperativesPage.withCoop") : item.status}</span></li>)}</ul></section>}
      </div>
    </div>
  );
}
