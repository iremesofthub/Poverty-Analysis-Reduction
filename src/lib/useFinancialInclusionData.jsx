import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabaseConfigured } from "@/lib/supabaseClient";
import { loadFinancialInclusionData } from "@/lib/financialInclusion";
import { filterObservationsByActiveSources } from "@/data/financialInclusion";

export function useFinancialInclusionData() {
  return useQuery({
    queryKey: ["financial-inclusion-data"],
    enabled: supabaseConfigured,
    queryFn: () => loadFinancialInclusionData(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

// Shared evidence state for every financial-inclusion chart: active (non-superseded)
// observations plus the query status, fetched once and cached across cards.
export function useActiveEvidence() {
  const query = useFinancialInclusionData();
  const sources = query.data?.sources || [];
  const observations = query.data ? filterObservationsByActiveSources(query.data.observations, sources) : [];
  return { sources, observations, isLoading: query.isLoading || query.isFetching && !query.data, isError: query.isError, error: query.error };
}

export function EvidenceLoading({ label = "figures" }) {
  return <p className="rounded-lg border border-hairline bg-canvas px-3 py-3 text-[12px] text-sub" role="status">Loading verified {label} from the data store…</p>;
}

export function EvidenceError() {
  return <p className="rounded-lg border border-[#FEDF89] bg-[#FFFAEB] px-3 py-3 text-[12px] text-[#93570A]" role="status">These figures are unavailable because the data store could not be reached. The chart will appear when the connection is restored.</p>;
}

export function EvidenceMissing({ label = "This source" }) {
  return <p className="rounded-lg border border-[#FEDF89] bg-[#FFFAEB] px-3 py-3 text-[12px] text-[#93570A]" role="status">{label} does not contain the records needed for this chart yet. Approved uploads appear here automatically.</p>;
}
