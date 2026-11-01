/**
 * Supabase hooks for vacancies and recruitment.
 * Database names and state values follow the phase 1 migration; display-only
 * aliases keep the current UI readable without asking PostgREST for columns
 * that are not in that schema.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";

const db = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};
const unwrap = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};
const normalizePosting = (row) => ({
  ...row,
  location_district: row.district_code,
  application_deadline: row.application_deadline ?? row.closes_at,
  required_skills: row.required_skills ?? row.required_competencies,
  job_applications: row.agent_job_applications ?? [],
});
const normalizePostings = (rows) => rows?.map(normalizePosting) ?? [];
const postingPayload = (fields) => {
  const { location_district, application_deadline, ...rest } = fields;
  return {
    ...rest,
    district_code: location_district ?? null,
    closes_at: application_deadline ?? null,
    application_deadline: application_deadline ?? null,
  };
};

export const usePublishedJobs = () => useQuery({
  queryKey: ["jobs", "published"],
  staleTime: 60_000,
  queryFn: async () => normalizePostings(unwrap(await db()
    .from("agent_job_postings")
    .select("id, title, description, employment_type, salary_min, salary_max, salary_currency, district_code, location_description, required_skills, required_competencies, application_deadline, closes_at, exam_date, exam_time, exam_venue, interview_date, interview_time, interview_venue, positions_count, status, programme_catalog(id, name)")
    .eq("status", "published")
    .order("application_deadline", { ascending: true }))),
});

export const useProgrammeJobs = (programmeId) => useQuery({
  queryKey: ["jobs", "programme", programmeId],
  enabled: Boolean(programmeId),
  staleTime: 30_000,
  queryFn: async () => normalizePostings(unwrap(await db()
    .from("agent_job_postings")
    .select("*, programme_catalog(id, name), agent_job_applications(id, status)")
    .eq("programme_id", programmeId)
    .order("created_at", { ascending: false }))),
});

export const useJobApplicantCounts = (jobId) => useQuery({
  queryKey: ["jobs", "applicants-count", jobId],
  enabled: Boolean(jobId),
  staleTime: 30_000,
  queryFn: async () => {
    const rows = unwrap(await db().from("agent_job_applications").select("status").eq("posting_id", jobId));
    return rows.reduce((counts, row) => {
      counts.total += 1;
      counts[row.status] = (counts[row.status] ?? 0) + 1;
      return counts;
    }, { total: 0 });
  },
});

export const useJobApplications = (jobId) => useQuery({
  queryKey: ["job-applications", jobId],
  enabled: Boolean(jobId),
  staleTime: 30_000,
  queryFn: async () => unwrap(await db()
    .from("agent_job_applications")
    .select("id, applicant_user_id, status, applied_at, cover_note, education_level, education_institution, education_field, education_grad_year, work_experience_years, previous_roles, skills_self_reported, languages_spoken, decision_reason, candidate_assessments(score, notes, passed, assessed_at, assessor_id), interview_slots(id, scheduled_at, slot_start, status, venue, outcome)")
    .eq("posting_id", jobId)
    .order("applied_at", { ascending: false })),
});

export const useMyApplications = () => useQuery({
  queryKey: ["my-applications"],
  staleTime: 30_000,
  queryFn: async () => (unwrap(await db()
    .from("agent_job_applications")
    .select("id, status, applied_at, agent_job_postings(id, title, status, application_deadline, closes_at, programme_catalog(name)), interview_slots(scheduled_at, venue, outcome)")
    .order("applied_at", { ascending: false })) ?? []).map((application) => ({
      ...application,
      submitted_at: application.applied_at,
      agent_job_postings: application.agent_job_postings
        ? normalizePosting(application.agent_job_postings)
        : null,
    })),
});

export function useCreateJob(programmeId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fields) => unwrap(await db().from("agent_job_postings")
      .insert({ ...postingPayload(fields), programme_id: programmeId, status: "draft" }).select().single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs", "programme", programmeId] }),
  });
}

export function useUpdateJobStatus(programmeId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId, status }) => unwrap(await db().from("agent_job_postings")
      .update({ status }).eq("id", jobId).select().single()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs", "programme", programmeId] });
      qc.invalidateQueries({ queryKey: ["jobs", "published"] });
    },
  });
}

export function useUpdateJob(programmeId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId, ...fields }) => unwrap(await db().from("agent_job_postings")
      .update(postingPayload(fields)).eq("id", jobId).select().single()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs", "programme", programmeId] });
      qc.invalidateQueries({ queryKey: ["jobs", "published"] });
    },
  });
}

export function useApplyForJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fields) => {
      const coverNote = fields.cover_note?.trim() ?? "";
      if (coverNote.length < 10 || coverNote.length > 3000) {
        throw new Error("Please provide a competency statement between 10 and 3000 characters.");
      }
      return unwrap(await db().from("agent_job_applications").insert({
        posting_id: fields.job_id,
        applicant_user_id: fields.applicant_user_id,
        competency_statement: coverNote,
        cover_note: coverNote,
        education_level: fields.education_level || null,
        education_institution: fields.education_institution || null,
        education_field: fields.education_field || null,
        education_grad_year: fields.education_grad_year || null,
        years_experience: Math.floor(Number(fields.work_experience_years) || 0),
        work_experience_years: Number(fields.work_experience_years) || 0,
        skills_list: fields.skills_self_reported ?? [],
        skills_self_reported: fields.skills_self_reported ?? [],
        status: "submitted",
      }).select().single());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-applications"] });
      qc.invalidateQueries({ queryKey: ["jobs", "published"] });
    },
  });
}

export function useAdvanceApplication(jobId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId, status, decision_rationale }) => {
      const client = db();
      const payload = {
        status,
        ...(decision_rationale ? { decision_reason: decision_rationale, decision_rationale } : {}),
      };
      if (["offered", "rejected"].includes(status)) {
        const { data: { user }, error } = await client.auth.getUser();
        if (error || !user) throw new Error(error?.message ?? "Sign in is required to record this decision.");
        payload.decided_by = user.id;
      }
      return unwrap(await client.from("agent_job_applications")
        .update(payload).eq("id", applicationId).select().single());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job-applications", jobId] }),
  });
}

export function useCreateAssessment(jobId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fields) => {
      const { data: { user }, error } = await db().auth.getUser();
      if (error) throw new Error(error.message);
      const { assessor_id: _assessorId, ...assessment } = fields;
      return unwrap(await db().from("candidate_assessments").insert({
        ...assessment,
        assessed_by: user.id,
        assessor_id: user.id,
      }).select().single());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job-applications", jobId] }),
  });
}

export function useRecordHiringDecision(programmeId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId, jobId, decision, decision_rationale, contractFields }) => {
      const client = db();
      const { data: { user }, error } = await client.auth.getUser();
      if (error || !user) throw new Error(error?.message ?? "Sign in is required to record a hiring decision.");
      unwrap(await client.from("agent_job_applications").update({
        status: decision === "hire" ? "offered" : "rejected",
        decision_reason: decision_rationale,
        decision_rationale,
        decided_by: user.id,
      }).eq("id", applicationId));
      if (decision === "hire" && contractFields) {
        unwrap(await client.from("agent_contracts").insert({
          job_id: jobId,
          programme_id: programmeId,
          application_id: applicationId,
          ...contractFields,
          status: "offered",
          approved_by: user.id,
        }));
      }
    },
    onSuccess: (_data, { jobId }) => {
      qc.invalidateQueries({ queryKey: ["job-applications", jobId] });
      qc.invalidateQueries({ queryKey: ["jobs", "programme", programmeId] });
    },
  });
}

export const useInterviewSlots = (jobId) => useQuery({
  queryKey: ["interview-slots", jobId],
  enabled: Boolean(jobId),
  staleTime: 30_000,
  queryFn: async () => unwrap(await db().from("interview_slots")
    .select("*, agent_job_applications(profiles!applicant_user_id(full_name))")
    .eq("job_id", jobId)
    .order("slot_start")),
});

export function useScheduleInterview(jobId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId, scheduledAt, venue }) => {
      const client = db();
      const { data: { user }, error } = await client.auth.getUser();
      if (error || !user) throw new Error(error?.message ?? "Sign in is required to schedule an interview.");
      return unwrap(await client.from("interview_slots").insert({
        job_id: jobId,
        application_id: applicationId,
        scheduled_at: scheduledAt,
        slot_start: scheduledAt,
        venue: venue.trim() || null,
        interviewer_user_id: user.id,
        status: "booked",
        outcome: "pending",
      }).select().single());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job-applications", jobId] });
      qc.invalidateQueries({ queryKey: ["interview-slots", jobId] });
      qc.invalidateQueries({ queryKey: ["my-applications"] });
    },
  });
}

export function useRecordInterviewOutcome(jobId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ slotId, outcome, notes }) => unwrap(await db().from("interview_slots")
      .update({ outcome, notes: notes.trim() || null })
      .eq("id", slotId).eq("job_id", jobId).select().single()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job-applications", jobId] });
      qc.invalidateQueries({ queryKey: ["interview-slots", jobId] });
      qc.invalidateQueries({ queryKey: ["my-applications"] });
    },
  });
}

export function useBookInterviewSlot(jobId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ slotId, applicationId }) => unwrap(await db().from("interview_slots")
      .update({ application_id: applicationId, status: "booked" })
      .eq("id", slotId).eq("job_id", jobId).eq("status", "open").select().single()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["interview-slots", jobId] });
      qc.invalidateQueries({ queryKey: ["job-applications", jobId] });
    },
  });
}
