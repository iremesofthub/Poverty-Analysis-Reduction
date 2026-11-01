import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import Card from "@/components/analyst/Card";
import { supabase } from "@/lib/supabaseClient";

const unwrap = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const TYPE = { programme_owner: "Programme Account", cooperative: "Cooperative", beneficiary: "Program Member" };

export default function AccountRequests() {
  const client = useQueryClient();
  const [note, setNote] = useState({});
  const [link, setLink] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const requests = useQuery({ queryKey: ["account-access-requests"], queryFn: async () => unwrap(await supabase.from("account_access_requests").select("*").eq("status", "pending").order("created_at", { ascending: true })) });
  const members = useQuery({ queryKey: ["account-request-members"], queryFn: async () => unwrap(await supabase.from("members").select("id, full_name, phone").order("full_name")).catch(() => []) });
  const cooperatives = useQuery({ queryKey: ["account-request-cooperatives"], queryFn: async () => unwrap(await supabase.from("cooperatives").select("id, name").order("name")).catch(() => []) });
  const organisations = useQuery({ queryKey: ["account-request-organisations"], queryFn: async () => unwrap(await supabase.from("programme_organizations").select("id, name").eq("status", "approved").order("name")).catch(() => []) });
  const lookup = useMemo(() => ({ beneficiary: members.data || [], cooperative: cooperatives.data || [], programme_owner: organisations.data || [] }), [members.data, cooperatives.data, organisations.data]);

  const review = async (request, decision) => {
    setError("");
    const linkedId = link[request.id] || null;
    if (decision === "approved" && !linkedId) { setError(`Choose the matching record before approving ${request.full_name}.`); return; }
    setBusy(request.id + decision);
    try {
      const { error: rpcError } = await supabase.rpc("review_signup_access_request", { p_request_id: request.id, p_decision: decision, p_linked_id: linkedId, p_review_note: note[request.id] || null });
      if (rpcError) throw rpcError;
      await client.invalidateQueries({ queryKey: ["account-access-requests"] });
    } catch (cause) { setError(cause.message || "The request could not be reviewed."); }
    finally { setBusy(""); }
  };

  return <div className="pb-14"><PageHeader title="Account requests" />
    <div className="mx-auto max-w-[1100px] px-4 py-5 sm:px-6 lg:px-8">
      <p className="mb-4 text-[12.5px] text-sub">Approve only after matching the request with the authoritative programme, cooperative, or member record. Member approval links the same member record used by USSD.</p>
      {error && <p role="alert" className="mb-4 rounded-md border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2 text-[12px] text-[#B42318]">{error}</p>}
      <Card tour="account-request-list" title="Waiting for review" subtitle={`${requests.data?.length ?? 0} request(s)`} bodyClassName="px-0 pb-0">
        {requests.isLoading ? <p className="flex items-center gap-2 px-5 py-8 text-[12.5px] text-sub"><Loader2 className="h-4 w-4 animate-spin" />Loading requests…</p> : (requests.data || []).length === 0 ? <p className="px-5 py-8 text-center text-[12.5px] text-sub">No account requests are waiting for review.</p> : <ul className="divide-y divide-hairline">{requests.data.map((request) => {
          const records = lookup[request.requested_role] || [];
          return <li key={request.id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-[13px] font-medium text-ink">{request.full_name} <span className="font-normal text-sub">· {TYPE[request.requested_role]}</span></p><p className="mt-0.5 text-[11px] text-sub">{request.phone}{request.organisation_name ? ` · ${request.organisation_name}` : ""}{request.reference ? ` · Ref: ${request.reference}` : ""}</p></div><span className="rounded-full bg-[#FFFAEB] px-2 py-1 text-[10.5px] font-medium text-[#B54708]">Pending</span></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]"><select aria-label={`Match ${request.full_name}`} value={link[request.id] || ""} onChange={(event) => setLink((old) => ({ ...old, [request.id]: event.target.value }))} className="rounded-md border border-hairline bg-white px-2.5 py-2 text-[12px] text-ink"><option value="">Select matching record</option>{records.map((item) => <option key={item.id} value={item.id}>{item.name || item.full_name}{item.phone ? ` · ${item.phone}` : ""}</option>)}</select><input aria-label={`Review note for ${request.full_name}`} value={note[request.id] || ""} onChange={(event) => setNote((old) => ({ ...old, [request.id]: event.target.value }))} maxLength={500} placeholder="Review note (optional)" className="rounded-md border border-hairline px-2.5 py-2 text-[12px] outline-none focus:border-brand" /><button type="button" disabled={Boolean(busy)} onClick={() => review(request, "approved")} className="inline-flex items-center justify-center gap-1 rounded-md bg-brand px-3 py-2 text-[11.5px] font-medium text-white disabled:opacity-50"><Check className="h-3.5 w-3.5" />Approve</button><button type="button" disabled={Boolean(busy)} onClick={() => review(request, "rejected")} className="inline-flex items-center justify-center gap-1 rounded-md border border-[#FECDCA] px-3 py-2 text-[11.5px] font-medium text-[#B42318] disabled:opacity-50"><X className="h-3.5 w-3.5" />Reject</button></div></li>;
        })}</ul>}
      </Card>
    </div>
  </div>;
}
