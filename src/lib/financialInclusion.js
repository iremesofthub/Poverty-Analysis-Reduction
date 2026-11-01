import { supabase } from "@/lib/supabaseClient";

export async function loadFinancialInclusionData() {
  if (!supabase) throw new Error("The public data connection is not configured.");
  const [sourcesResult, observationsResult] = await Promise.all([
    supabase.from("financial_inclusion_sources").select("*").order("publisher").order("title"),
    supabase.from("financial_inclusion_observations").select("*").order("period_end", { ascending: false }).order("indicator"),
  ]);
  if (sourcesResult.error) throw sourcesResult.error;
  if (observationsResult.error) throw observationsResult.error;
  return { sources: sourcesResult.data || [], observations: observationsResult.data || [] };
}
