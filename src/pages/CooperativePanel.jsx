import React, { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Inbox, ShieldCheck, Trash2, Users, XCircle } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import PanelGuide from "@/components/analyst/PanelGuide";
import { HealthChip } from "@/components/government/GovCooperatives";
import { ago } from "@/components/requests/bits";
import { BENEFICIARIES } from "@/data/programme";
import { useDemoAuth, useRole } from "@/lib/DemoAuthContext";
import { HEALTH, JOIN_STATUS, cooperativeIdOf, decideJoin, removeMember, updateCoop, useCooperatives } from "@/lib/cooperatives";
import { useTranslation } from "react-i18next";

const input = "mt-1 w-full rounded-md border border-hairline bg-white px-3 py-2 text-[12.5px] text-ink outline-none focus:border-brand";
const short = (name) => ({ "VUP Direct Support": "VUP", "Girinka Munyarwanda": "Girinka", "Expanded Public Works": "Public Works", "Nsymibondo y'Icyaro": "Nsymibondo" }[name] || name);

function Kpi({ icon: Icon, label, value, foot, warn }) {
  return <div className="rounded-xl border border-hairline bg-white px-4 py-3.5"><div className="flex items-center gap-2 text-sub"><Icon className="h-4 w-4" strokeWidth={1.9} /><span className="text-[11.5px] font-medium">{label}</span></div><p className={`mt-1.5 text-[22px] font-semibold leading-none tracking-tight tabular-nums ${warn ? "text-[#B54708]" : "text-ink"}`}>{value}</p><p className="mt-1.5 text-[11px] text-[#8A94A6]">{foot}</p></div>;
}

// A cooperative's own panel. Only the cooperative (and the platform admin) accepts or declines members.
export default function CooperativePanel() {
  const { t } = useTranslation();
  const role = useRole();
  const { demoUser } = useDemoAuth();
  const store = useCooperatives();
  const [adminChoice, setAdminChoice] = useState("");
  const isAdmin = role === "platform_admin";
  const coopId = isAdmin ? (adminChoice || store.coops[0]?.id) : cooperativeIdOf(demoUser);
  const coop = store.coops.find((item) => item.id === coopId);
  const by = { name: demoUser?.name || "Cooperative", role, cooperativeId: coop?.id };
  const [declining, setDeclining] = useState(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const requests = useMemo(() => store.requests.filter((item) => item.coopId === coop?.id), [store.requests, coop?.id]);
  const toDecide = requests.filter((item) => ["Pending", "Endorsed"].includes(item.status));
  const decided = requests.filter((item) => ["Approved", "Declined"].includes(item.status)).sort((a, b) => Date.parse(b.decidedAt) - Date.parse(a.decidedAt)).slice(0, 5);
  const members = coop ? store.membersOf(coop.id) : [];

  if (!coop) return <div className="grid min-h-[60vh] place-items-center px-6 text-center"><div><h2 className="text-[16px] font-semibold text-ink">This account is not linked to a cooperative</h2><p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-sub">Sign out and sign in with a cooperative account, or ask the platform administrator to link this one.</p></div></div>;

  const run = (job, message) => { setError(""); setSaved(""); try { job(); if (message) setSaved(message); } catch (failure) { setError(failure.message); } };
  const decide = (request, accept) => run(() => { decideJoin(request.id, { accept, by, note: reason }); setDeclining(null); setReason(""); }, accept ? `${request.beneficiaryName} is now a member.` : `${request.beneficiaryName}'s request was declined.`);
  const noteValue = note ?? coop.healthNote ?? "";

  return (
    <div className="pb-14">
      <PageHeader title={t("pageTitles.cooperative")} badge={<span className="hidden items-center gap-1.5 rounded-full border border-hairline px-2 py-[3px] text-[11px] text-sub sm:inline-flex">{coop.name} · {coop.sector}, {coop.district}</span>}
        actions={isAdmin ? <label className="flex items-center gap-2 text-[11.5px] text-sub">Viewing<select value={coop.id} onChange={(event) => { setAdminChoice(event.target.value); setNote(null); }} className="rounded-md border border-hairline bg-white px-2 py-1.5 text-[12px] font-medium text-ink outline-none focus:border-brand">{store.coops.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.district})</option>)}</select></label> : null} />

      <PanelGuide id="cooperative-panel" title="Cooperative">
        This is your cooperative's own page. Program Members in your district ask to join here, and you decide whether to accept or decline. Nobody joins without your say. Government leaders can see your cooperative but do not manage it.
      </PanelGuide>

      <div className="mx-auto max-w-[1100px] space-y-4 px-4 py-5 sm:px-6 lg:px-8">
        {!isAdmin && <p className="inline-flex items-center gap-2 rounded-md border border-hairline bg-white px-3 py-1.5 text-[11.5px] text-sub"><ShieldCheck className="h-3.5 w-3.5 text-brand" />You are signed in as <strong className="text-ink">{coop.name}</strong>. You can manage this cooperative only.</p>}

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Kpi icon={Inbox} label="Waiting for your decision" value={toDecide.length} foot="people asking to join" warn={toDecide.length > 0} />
          <Kpi icon={Clock} label="Decided recently" value={decided.length} foot="accepted or declined" />
          <Kpi icon={Users} label="Program Members in the cooperative" value={members.length} foot={`${coop.members} members in total`} />
          <Kpi icon={CheckCircle2} label="How it is doing" value={coop.health} foot={`${coop.joinStatus === "Open" ? "Accepting" : coop.joinStatus} new members`} warn={coop.health !== "Going well"} />
        </div>

        {error && <p role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-[12px] text-red-700"><AlertCircle className="mt-px h-4 w-4 shrink-0" />{error}</p>}
        {saved && <p role="status" className="flex items-start gap-2 rounded-md border border-[#ABEFC6] bg-[#ECFDF3] p-2.5 text-[12px] text-[#067647]"><CheckCircle2 className="mt-px h-4 w-4 shrink-0" />{saved}</p>}

        <section data-tour="coopp-requests" className="rounded-xl border border-hairline bg-white p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold text-ink"><Inbox className="h-4 w-4 text-brand" />Requests for you to decide<span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-normal tabular-nums text-sub">{toDecide.length}</span></h2>
          {toDecide.length === 0 ? <p className="mt-3 rounded-lg border border-dashed border-hairline bg-canvas/50 px-4 py-6 text-center text-[12px] text-sub">Nothing is waiting. When a program member asks to join, the request appears here.</p>
            : <ul className="mt-3 space-y-2.5">{toDecide.map((request) => { const who = BENEFICIARIES.find((item) => item.id === request.beneficiaryId); return <li key={request.id} className="rounded-lg border border-hairline p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-[13px] font-semibold text-ink">{request.beneficiaryName}</p><p className="mt-0.5 text-[11.5px] text-sub">{who?.sector} sector, {who?.district} · {short(who?.programme)} programme · {who?.age} years · family of {who?.familySize}</p>
                <p className="mt-1 text-[11px] text-sub">asked {ago(request.createdAt)}</p></div>
                <div className="flex gap-2"><button type="button" onClick={() => decide(request, true)} className="rounded-md bg-brand px-3.5 py-2 text-[12px] font-medium text-white hover:bg-[#524BE0]">Accept member</button><button type="button" onClick={() => { setDeclining(declining === request.id ? null : request.id); setReason(""); }} className="rounded-md border border-hairline px-3.5 py-2 text-[12px] font-medium text-ink hover:bg-canvas">Decline</button></div></div>
              {declining === request.id && <div className="mt-3 flex flex-wrap gap-2"><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason, for example: we are at capacity this season" className="min-w-[220px] flex-1 rounded-md border border-hairline px-3 py-2 text-[12px] outline-none focus:border-brand" /><button type="button" onClick={() => decide(request, false)} className="rounded-md bg-red-600 px-3 py-2 text-[12px] font-medium text-white hover:bg-red-700">Decline request</button></div>}
            </li>; })}</ul>}
          {coop.joinStatus !== "Open" && toDecide.length > 0 && <p className="mt-3 rounded-md bg-[#FFFAEB] p-2.5 text-[11.5px] text-[#B54708]">Joining is currently {coop.joinStatus.toLowerCase()}. Open it to new members below before you accept anyone.</p>}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section data-tour="coopp-members" className="rounded-xl border border-hairline bg-white p-4 sm:p-5">
            <h2 className="text-[14px] font-semibold text-ink">Members on the platform ({members.length})</h2>
            {members.length === 0 ? <p className="mt-3 text-[12px] text-sub">No registered program members are members yet.</p> : <ul className="mt-3 max-h-[360px] divide-y divide-hairline overflow-y-auto rounded-lg border border-hairline">{members.map((link) => <li key={link.beneficiaryId} className="flex items-center gap-3 px-3 py-2"><div className="min-w-0 flex-1"><p className="truncate text-[12.5px] font-medium text-ink">{link.person.name}</p><p className="text-[10.5px] text-sub">{link.person.sector} · {short(link.person.programme)} programme · since {new Date(link.since).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</p></div><button type="button" aria-label={`Remove ${link.person.name}`} onClick={() => run(() => removeMember(coop.id, link.beneficiaryId, by), `${link.person.name} was removed.`)} className="grid h-7 w-7 place-items-center rounded-md text-sub hover:bg-red-50 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></button></li>)}</ul>}
          </section>

          <section data-tour="coopp-about" className="rounded-xl border border-hairline bg-white p-4 sm:p-5">
            <h2 className="text-[14px] font-semibold text-ink">Your cooperative</h2>
            <div className="mt-2 flex items-center gap-2"><HealthChip health={coop.health} /><span className="text-[11.5px] text-sub">{coop.activity} · led by {coop.leader || "not set"}</span></div>
            <p className="mt-2 text-[12px] leading-relaxed text-ink">{coop.purpose}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="block text-[11.5px] font-medium text-ink">How is it doing?<select value={coop.health} onChange={(event) => run(() => updateCoop(coop.id, { health: event.target.value }, by))} className={input}>{HEALTH.map((item) => <option key={item}>{item}</option>)}</select></label><label className="block text-[11.5px] font-medium text-ink">New members<select value={coop.joinStatus} onChange={(event) => run(() => updateCoop(coop.id, { joinStatus: event.target.value }, by))} className={input}>{JOIN_STATUS.map((item) => <option key={item}>{item}</option>)}</select></label></div>
            <label className="mt-3 block text-[11.5px] font-medium text-ink">Note for government leaders and programmes<textarea value={noteValue} onChange={(event) => setNote(event.target.value)} rows={3} className={`${input} resize-y`} placeholder="Sales, meetings, problems or good news." /></label>
            <button type="button" onClick={() => run(() => { updateCoop(coop.id, { healthNote: noteValue }, by); setNote(null); }, "Note saved.")} className="mt-2 rounded-md border border-hairline px-3 py-1.5 text-[11.5px] font-medium text-ink hover:bg-canvas">Save note</button>
          </section>
        </div>

        {decided.length > 0 && <section className="rounded-xl border border-hairline bg-white p-4 sm:p-5"><h2 className="text-[13px] font-semibold text-ink">Recent decisions</h2><ul className="mt-2.5 space-y-1.5">{decided.map((request) => <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-canvas/70 px-3 py-2 text-[12px]"><span className="flex items-center gap-2 font-medium text-ink">{request.status === "Approved" ? <CheckCircle2 className="h-3.5 w-3.5 text-[#067647]" /> : <XCircle className="h-3.5 w-3.5 text-[#B42318]" />}{request.beneficiaryName}</span><span className="text-sub">{request.status === "Approved" ? "accepted" : `declined${request.declinedBy === "government" ? " by government" : ""}${request.note ? `: ${request.note}` : ""}`} · {ago(request.decidedAt)}</span></li>)}</ul></section>}

        <section data-tour="coopp-activity" className="rounded-xl border border-hairline bg-white p-4 sm:p-5"><h2 className="text-[13px] font-semibold text-ink">Recent activity</h2><ul className="mt-2.5 space-y-2">{(coop.log || []).slice(0, 8).map((entry, index) => <li key={`${entry.at}-${index}`} className="text-[11.5px] leading-relaxed text-ink"><span className="text-sub">{ago(entry.at)} · {entry.by}:</span> {entry.text}</li>)}</ul></section>
      </div>
    </div>
  );
}
