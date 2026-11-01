import React, { useState } from "react";
import { Plus, Briefcase, Calendar, Users, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { jobStatusStyle } from "@/data/programme";
import { useProgrammeScope } from "@/lib/programmeScope";
import { useProgrammeJobs, useCreateJob, useUpdateJobStatus, useJobApplications, useAdvanceApplication, useCreateAssessment, useScheduleInterview, useRecordInterviewOutcome, useRecordHiringDecision } from "@/lib/jobsApi";
import { useMe } from "@/lib/memberApi";
import { supabase } from "@/lib/supabaseClient";

// ── helpers ──────────────────────────────────────────────────────────────
const fmt = (n) => (n ? Number(n).toLocaleString() : "—");
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-RW") : "—");

// Status badge mapping from DB values → display values + style
const DB_STATUS_STYLE = {
  draft: "border-hairline bg-[#FAFBFD] text-[#8A94A6]",
  published: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]",
  paused: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]",
  closed: "border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]",
  filled: "border-[#D3CEFF] bg-[#EFEDFF] text-[#4B3FCC]",
};
const DB_STATUS_LABEL = { draft: "Draft", published: "Open", paused: "Paused", closed: "Closed", filled: "Filled" };

// Live JobCard – wired to Supabase
function LiveJobCard({ job, onViewApplicants, onPublish }) {
  const applicantCount = job.job_applications?.length ?? 0;
  const statusKey = job.status || "draft";
  return (
    <div className="rounded-xl border border-hairline bg-white p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-soft text-brand">
            <Briefcase className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[13px] font-semibold text-ink">{job.title}</p>
            <p className="text-[10.5px] text-sub">
              {job.programme_catalog?.name ?? "—"} · {job.employment_type ?? "—"}
            </p>
          </div>
        </div>
        <span className={`inline-flex rounded-full border px-2 py-[2px] text-[10px] font-medium ${DB_STATUS_STYLE[statusKey] ?? "border-hairline text-sub"}`}>
          {DB_STATUS_LABEL[statusKey] ?? statusKey}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11.5px]">
        <div className="rounded-lg bg-canvas px-2.5 py-1.5">
          <p className="text-[10px] text-[#8A94A6]">Budget</p>
          <p className="font-medium text-ink">
            {job.salary_currency ?? "RWF"} {fmt(job.salary_max || job.salary_min)}
          </p>
        </div>
        <div className="rounded-lg bg-canvas px-2.5 py-1.5">
          <p className="text-[10px] text-[#8A94A6]">Applicants</p>
          <p className="font-medium text-ink">{applicantCount}</p>
        </div>
        <div className="rounded-lg bg-canvas px-2.5 py-1.5">
          <p className="text-[10px] text-[#8A94A6]">Deadline</p>
          <p className="font-medium text-ink">{fmtDate(job.application_deadline)}</p>
        </div>
      </div>

      {Array.isArray(job.required_skills) && job.required_skills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {job.required_skills.map((s) => (
            <span key={s} className="rounded-full border border-hairline px-2 py-[2px] text-[10px] text-sub">{s}</span>
          ))}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-hairline pt-2.5">
        <div className="rounded-lg border border-hairline px-3 py-2">
          <p className="flex items-center gap-1 text-[10px] font-medium text-[#8A94A6]"><Calendar className="h-3 w-3" /> Exam</p>
          <p className="mt-0.5 text-[11.5px] font-medium text-ink">{fmtDate(job.exam_date)}</p>
          <p className="text-[10.5px] text-sub">{job.exam_time ?? "—"} · {job.exam_venue ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-hairline px-3 py-2">
          <p className="flex items-center gap-1 text-[10px] font-medium text-[#8A94A6]"><Users className="h-3 w-3" /> Interview</p>
          <p className="mt-0.5 text-[11.5px] font-medium text-ink">{fmtDate(job.interview_date)}</p>
          <p className="text-[10.5px] text-sub">{job.interview_time ?? "—"} · {job.interview_venue ?? "—"}</p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onViewApplicants(job)}
          className="flex-1 rounded-md border border-hairline px-3 py-1.5 text-[11.5px] font-medium text-ink hover:bg-canvas"
        >
          View applicants {applicantCount > 0 && `(${applicantCount})`}
        </button>
        {job.status === "draft" && (
          <button
            onClick={() => onPublish(job.id)}
            className="flex-1 rounded-md bg-brand px-3 py-1.5 text-[11.5px] font-medium text-white hover:bg-brand/90"
          >
            Publish
          </button>
        )}
        {job.status === "published" && (
          <button
            onClick={() => onPublish(job.id, "closed")}
            className="flex-1 rounded-md border border-hairline px-3 py-1.5 text-[11.5px] font-medium text-sub hover:bg-canvas"
          >
            Close posting
          </button>
        )}
      </div>
    </div>
  );
}

// ── Create job form ────────────────────────────────────────────────────────
const EMPTY_FORM = {
  title: "", employment_type: "full_time", salary_max: "", salary_currency: "RWF",
  location_district: "", required_skills_raw: "",
  application_deadline: "", exam_date: "", exam_time: "", exam_venue: "",
  interview_date: "", interview_time: "", interview_venue: "", description: "",
};

function CreateJobModal({ programmeId, onClose }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [err, setErr] = useState(null);
  const [success, setSuccess] = useState(false);
  const create = useCreateJob(programmeId);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async () => {
    setErr(null);
    if (!form.title.trim()) return setErr("Title is required.");
    if (!form.description.trim()) return setErr("Job description is required.");
    if (!form.application_deadline) return setErr("Application deadline is required.");
    try {
      await create.mutateAsync({
        title: form.title.trim(),
        employment_type: form.employment_type,
        salary_max: form.salary_max ? Number(form.salary_max) : null,
        salary_currency: form.salary_currency,
        location_district: form.location_district.trim() || null,
        required_skills: form.required_skills_raw ? form.required_skills_raw.split(",").map((s) => s.trim()).filter(Boolean) : [],
        application_deadline: form.application_deadline || null,
        exam_date: form.exam_date || null,
        exam_time: form.exam_time || null,
        exam_venue: form.exam_venue.trim() || null,
        interview_date: form.interview_date || null,
        interview_time: form.interview_time || null,
        interview_venue: form.interview_venue.trim() || null,
        description: form.description.trim() || null,
      });
      setSuccess(true);
      setTimeout(onClose, 1200);
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose} data-tour="jobs-create-job">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[15px] font-semibold text-ink">Post a new job</h3>
        <p className="mt-0.5 text-[11.5px] text-sub">Create a position, schedule the exam and interview. The posting saves as draft first.</p>

        {success && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-[#ABEFC6] bg-[#ECFDF3] px-3 py-2 text-[12px] text-[#067647]">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> Job saved as draft
          </div>
        )}

        {err && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2 text-[12px] text-[#B42318]">
            <AlertCircle className="h-4 w-4 flex-shrink-0" /> {err}
          </div>
        )}

        <div className="mt-4 space-y-3">
          <input placeholder="Job title *" value={form.title} onChange={set("title")} className="w-full rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand" />
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Budget (RWF)" type="number" value={form.salary_max} onChange={set("salary_max")} className="rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand" />
            <select value={form.employment_type} onChange={set("employment_type")} className="rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand">
              <option value="full_time">Full-time</option>
              <option value="contract">Contract</option>
              <option value="part_time">Part-time</option>
            </select>
          </div>
          <input placeholder="District (e.g. Nyaruguru)" value={form.location_district} onChange={set("location_district")} className="w-full rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand" />
          <input placeholder="Required skills (comma separated)" value={form.required_skills_raw} onChange={set("required_skills_raw")} className="w-full rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand" />
          <textarea placeholder="Job description" value={form.description} onChange={set("description")} rows={2} className="w-full rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand resize-none" />

          <div className="grid grid-cols-2 gap-3">
            <div><p className="mb-1 text-[11px] font-medium text-sub">Application deadline *</p>
              <input type="date" value={form.application_deadline} onChange={set("application_deadline")} className="w-full rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand" /></div>
            <div><p className="mb-1 text-[11px] font-medium text-sub">Exam date</p>
              <input type="date" value={form.exam_date} onChange={set("exam_date")} className="w-full rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="time" value={form.exam_time} onChange={set("exam_time")} className="rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand" placeholder="Exam time" />
            <input placeholder="Exam venue" value={form.exam_venue} onChange={set("exam_venue")} className="rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="mb-1 text-[11px] font-medium text-sub">Interview date</p>
              <input type="date" value={form.interview_date} onChange={set("interview_date")} className="w-full rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand" /></div>
            <div><p className="mb-1 text-[11px] font-medium text-sub">Interview time</p>
              <input type="time" value={form.interview_time} onChange={set("interview_time")} className="w-full rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand" /></div>
          </div>
          <input placeholder="Interview venue" value={form.interview_venue} onChange={set("interview_venue")} className="w-full rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand" />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-hairline px-3 py-1.5 text-[12px] text-sub hover:bg-canvas">Cancel</button>
          <button
            disabled={create.isPending || success}
            onClick={handleSubmit}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[12px] font-medium text-white hover:bg-brand/90 disabled:opacity-60"
          >
            {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save as draft
          </button>
        </div>
      </div>
    </div>
  );
}

const APPLICATION_NEXT_STATES = {
  submitted: ["screening"],
  screening: ["assessment"],
  assessment: ["interview"],
  interview: [],
  offered: [],
  rejected: [],
  contracted: [],
  withdrawn: [],
};
const APPLICATION_LABEL = {
  submitted: "Submitted",
  screening: "Screening",
  assessment: "Assessment",
  interview: "Interview",
  offered: "Offer issued",
  rejected: "Rejected",
  contracted: "Contracted",
  withdrawn: "Withdrawn",
};

function ApplicantReviewRow({ application, jobId, programmeId }) {
  const [status, setStatus] = useState(application.status);
  const [reason, setReason] = useState(application.decision_reason ?? "");
  const [errorMessage, setErrorMessage] = useState("");
  const [scores, setScores] = useState({ business: "", communication: "", bookkeeping: "", digital: "", safeguarding: "", language: "" });
  const [assessmentNotes, setAssessmentNotes] = useState("");
  const [assessmentPassed, setAssessmentPassed] = useState("");
  const [interviewDate, setInterviewDate] = useState("");
  const [interviewVenue, setInterviewVenue] = useState("");
  const [interviewNotes, setInterviewNotes] = useState("");
  const [contractWage, setContractWage] = useState("");
  const [contractStartDate, setContractStartDate] = useState("");
  const [contractEndDate, setContractEndDate] = useState("");
  const [contractTerms, setContractTerms] = useState("");
  const advance = useAdvanceApplication(jobId);
  const createAssessment = useCreateAssessment(jobId);
  const scheduleInterview = useScheduleInterview(jobId);
  const recordInterviewOutcome = useRecordInterviewOutcome(jobId);
  const recordHiringDecision = useRecordHiringDecision(programmeId);
  const canReject = !["offered", "rejected", "contracted", "withdrawn"].includes(application.status);
  const needsReason = status === "offered" || status === "rejected";
  const passedAssessment = application.candidate_assessments?.some((assessment) => assessment.passed === true) ?? false;
  const bookedInterview = application.interview_slots?.find((slot) => slot.status === "booked") ?? null;
  const passedInterview = application.interview_slots?.some((slot) => slot.outcome === "passed") ?? false;
  const nextStates = [...(APPLICATION_NEXT_STATES[application.status] ?? [])];
  const eligibleNextStates = (application.status === "assessment" && !passedAssessment)
    || (application.status === "interview" && !passedInterview) ? [] : nextStates;
  if (application.status === "interview" && passedInterview) eligibleNextStates.push("offered");
  const choices = [
    ...eligibleNextStates,
    ...(canReject ? ["rejected"] : []),
  ];

  const saveStatus = async () => {
    setErrorMessage("");
    if (needsReason && reason.trim().length < 10) {
      setErrorMessage("Add a decision reason of at least 10 characters.");
      return;
    }
    try {
      if (status === "offered") {
        if (!Number(contractWage) || Number(contractWage) <= 0 || !contractStartDate || !contractEndDate || !contractTerms.trim()) {
          setErrorMessage("Complete the paid contract amount, dates and terms before issuing an offer.");
          return;
        }
        if (new Date(contractEndDate) <= new Date(contractStartDate)) {
          setErrorMessage("The contract end date must be after the start date.");
          return;
        }
        await recordHiringDecision.mutateAsync({
          applicationId: application.id,
          jobId,
          decision: "hire",
          decision_rationale: reason.trim(),
          contractFields: {
            monthly_wage: Number(contractWage),
            currency: "RWF",
            start_date: contractStartDate,
            end_date: contractEndDate,
            contract_terms: contractTerms.trim(),
          },
        });
      } else if (status === "rejected") {
        await advance.mutateAsync({ applicationId: application.id, status, decision_rationale: reason.trim() });
      } else {
        await advance.mutateAsync({ applicationId: application.id, status });
      }
    } catch (error) {
      setErrorMessage(error.message);
    }
  };

  const saveAssessment = async () => {
    setErrorMessage("");
    if (Object.values(scores).some((score) => score === "")) {
      setErrorMessage("Enter a score for each assessment area.");
      return;
    }
    if (Object.values(scores).some((score) => Number(score) < 0 || Number(score) > 100)) {
      setErrorMessage("Each assessment score must be between 0 and 100.");
      return;
    }
    if (assessmentNotes.trim().length < 10 || assessmentPassed === "") {
      setErrorMessage("Add assessment notes and record whether the candidate passed.");
      return;
    }
    const numericScores = Object.fromEntries(Object.entries(scores).map(([key, value]) => [key, Number(value)]));
    const average = Object.values(numericScores).reduce((sum, score) => sum + score, 0) / Object.keys(numericScores).length;
    try {
      await createAssessment.mutateAsync({
        application_id: application.id,
        competency_scores: numericScores,
        overall_score: average,
        score: average,
        passed: assessmentPassed === "true",
        notes: assessmentNotes.trim(),
        reviewer_note: assessmentNotes.trim(),
      });
      setScores({ business: "", communication: "", bookkeeping: "", digital: "", safeguarding: "", language: "" });
      setAssessmentNotes("");
      setAssessmentPassed("");
    } catch (error) {
      setErrorMessage(error.message);
    }
  };

  const saveInterviewSchedule = async () => {
    setErrorMessage("");
    if (!interviewDate || new Date(interviewDate) <= new Date()) {
      setErrorMessage("Choose an interview time in the future.");
      return;
    }
    if (!interviewVenue.trim()) {
      setErrorMessage("Provide the interview venue or meeting location.");
      return;
    }
    try {
      await scheduleInterview.mutateAsync({
        applicationId: application.id,
        scheduledAt: new Date(interviewDate).toISOString(),
        venue: interviewVenue,
      });
      setInterviewDate("");
      setInterviewVenue("");
    } catch (error) {
      setErrorMessage(error.message);
    }
  };

  const saveInterviewOutcome = async (outcome) => {
    setErrorMessage("");
    if (interviewNotes.trim().length < 10) {
      setErrorMessage("Add interview notes of at least 10 characters.");
      return;
    }
    try {
      await recordInterviewOutcome.mutateAsync({ slotId: bookedInterview.id, outcome, notes: interviewNotes });
      setInterviewNotes("");
    } catch (error) {
      setErrorMessage(error.message);
    }
  };

  return (
    <li className="rounded-lg border border-hairline p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12.5px] font-semibold text-ink">Application {application.id.slice(0, 8)}</p>
          <p className="mt-0.5 text-[10.5px] text-sub">Received {fmtDate(application.applied_at)}</p>
        </div>
        <span className="rounded-full border border-hairline px-2 py-1 text-[10.5px] text-sub">
          {APPLICATION_LABEL[application.status] ?? application.status}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-sub">Education</p>
          <p className="mt-1 text-[12px] text-ink">
            {[application.education_level, application.education_field, application.education_grad_year].filter(Boolean).join(" · ") || "Not provided"}
          </p>
          {application.education_institution && <p className="text-[11px] text-sub">{application.education_institution}</p>}
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-sub">Experience and skills</p>
          <p className="mt-1 text-[12px] text-ink">{Number(application.work_experience_years ?? 0)} years</p>
          <p className="text-[11px] text-sub">{Array.isArray(application.skills_self_reported) && application.skills_self_reported.length ? application.skills_self_reported.join(", ") : "No skills listed"}</p>
        </div>
      </div>

      <div className="mt-3 rounded-md bg-canvas p-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-sub">Competency statement</p>
        <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-ink">{application.cover_note || "No statement provided."}</p>
      </div>

      {application.candidate_assessments?.length > 0 && (
        <div className="mt-3 rounded-md border border-hairline p-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-sub">Recorded assessments</p>
          <ul className="mt-2 space-y-1.5">
            {application.candidate_assessments.map((assessment) => (
              <li key={assessment.assessed_at} className="text-[11px] text-ink">
                Score {assessment.score ?? "—"}/100 · {assessment.passed ? "Passed" : "Did not pass"} · {assessment.notes}
              </li>
            ))}
          </ul>
        </div>
      )}

      {application.status === "assessment" && (
        <div className="mt-3 rounded-md border border-hairline p-3">
          <p className="text-[11px] font-semibold text-ink">Practical assessment rubric</p>
          <p className="mt-0.5 text-[10.5px] text-sub">A qualified human assessor records a 0–100 score for each area and explains the result.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries({ business: "Business skills", communication: "Teaching and communication", bookkeeping: "Bookkeeping", digital: "Digital literacy", safeguarding: "Safety and safeguarding", language: "Local language" }).map(([key, label]) => (
              <label key={key} className="text-[10.5px] text-sub">
                {label}
                <input type="number" min="0" max="100" value={scores[key]} onChange={(event) => setScores((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 w-full rounded-md border border-hairline px-2 py-1.5 text-[11.5px] text-ink" />
              </label>
            ))}
          </div>
          <textarea value={assessmentNotes} onChange={(event) => setAssessmentNotes(event.target.value)} rows={2} placeholder="Assessment evidence and notes" className="mt-2 w-full resize-y rounded-md border border-hairline px-3 py-2 text-[11.5px] outline-none focus:border-brand" />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label htmlFor={`pass-${application.id}`} className="text-[11px] text-sub">Assessor result</label>
            <select id={`pass-${application.id}`} value={assessmentPassed} onChange={(event) => setAssessmentPassed(event.target.value)} className="rounded-md border border-hairline px-2.5 py-1.5 text-[11.5px] text-ink">
              <option value="">Choose result</option><option value="true">Passed</option><option value="false">Did not pass</option>
            </select>
            <button type="button" disabled={createAssessment.isPending} onClick={saveAssessment} className="rounded-md bg-brand px-3 py-1.5 text-[11.5px] font-medium text-white disabled:opacity-50">
              {createAssessment.isPending ? "Saving…" : "Save assessment"}
            </button>
          </div>
        </div>
      )}

      {application.status === "interview" && (
        <div className="mt-3 rounded-md border border-hairline p-3">
          <p className="text-[11px] font-semibold text-ink">Interview schedule and outcome</p>
          {bookedInterview ? (
            <>
              <p className="mt-1 text-[11.5px] text-ink">{fmtDate(bookedInterview.scheduled_at)} · {new Date(bookedInterview.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {bookedInterview.venue || "Venue to be confirmed"}</p>
              {bookedInterview.outcome && bookedInterview.outcome !== "pending" ? (
                <p className="mt-1 text-[11px] text-sub">Recorded outcome: {bookedInterview.outcome}. {bookedInterview.notes}</p>
              ) : (
                <div className="mt-2">
                  <textarea value={interviewNotes} onChange={(event) => setInterviewNotes(event.target.value)} rows={2} placeholder="Interview evidence and notes" className="w-full resize-y rounded-md border border-hairline px-3 py-2 text-[11.5px] outline-none focus:border-brand" />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[["passed", "Record passed"], ["failed", "Record did not pass"], ["no_show", "Record no-show"]].map(([outcome, label]) => (
                      <button key={outcome} type="button" disabled={recordInterviewOutcome.isPending} onClick={() => saveInterviewOutcome(outcome)} className="rounded-md border border-hairline px-3 py-1.5 text-[11px] text-ink disabled:opacity-50">{label}</button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input type="datetime-local" value={interviewDate} onChange={(event) => setInterviewDate(event.target.value)} className="rounded-md border border-hairline px-2.5 py-1.5 text-[11.5px] text-ink" />
              <input value={interviewVenue} onChange={(event) => setInterviewVenue(event.target.value)} placeholder="Interview venue" className="rounded-md border border-hairline px-2.5 py-1.5 text-[11.5px] text-ink" />
              <button type="button" disabled={scheduleInterview.isPending} onClick={saveInterviewSchedule} className="rounded-md bg-brand px-3 py-1.5 text-[11.5px] font-medium text-white disabled:opacity-50">{scheduleInterview.isPending ? "Saving…" : "Schedule"}</button>
            </div>
          )}
        </div>
      )}

      {choices.length > 0 && (
        <div className="mt-3 border-t border-hairline pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] font-medium text-sub" htmlFor={`status-${application.id}`}>Advance to</label>
            <select
              id={`status-${application.id}`}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="rounded-md border border-hairline px-2.5 py-1.5 text-[11.5px] text-ink"
            >
              <option value={application.status}>{APPLICATION_LABEL[application.status] ?? application.status}</option>
              {choices.map((next) => <option key={next} value={next}>{APPLICATION_LABEL[next]}</option>)}
            </select>
            <button
              type="button"
              disabled={status === application.status || advance.isPending || recordHiringDecision.isPending}
              onClick={saveStatus}
              className="rounded-md bg-brand px-3 py-1.5 text-[11.5px] font-medium text-white disabled:opacity-50"
            >
              {advance.isPending || recordHiringDecision.isPending ? "Saving…" : status === "offered" ? "Issue offer" : "Save status"}
            </button>
          </div>
          {needsReason && (
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Human decision reason (required)"
              className="mt-2 w-full resize-y rounded-md border border-hairline px-3 py-2 text-[11.5px] outline-none focus:border-brand"
            />
          )}
          {status === "offered" && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="text-[10.5px] text-sub">Monthly wage (RWF)
                <input type="number" min="1" value={contractWage} onChange={(event) => setContractWage(event.target.value)} className="mt-1 w-full rounded-md border border-hairline px-2.5 py-1.5 text-[11.5px] text-ink" />
              </label>
              <label className="text-[10.5px] text-sub">Contract start
                <input type="date" value={contractStartDate} onChange={(event) => setContractStartDate(event.target.value)} className="mt-1 w-full rounded-md border border-hairline px-2.5 py-1.5 text-[11.5px] text-ink" />
              </label>
              <label className="text-[10.5px] text-sub">Contract end
                <input type="date" value={contractEndDate} onChange={(event) => setContractEndDate(event.target.value)} className="mt-1 w-full rounded-md border border-hairline px-2.5 py-1.5 text-[11.5px] text-ink" />
              </label>
              <label className="text-[10.5px] text-sub sm:col-span-2">Contract terms
                <textarea value={contractTerms} onChange={(event) => setContractTerms(event.target.value)} rows={3} maxLength={3000} className="mt-1 w-full resize-y rounded-md border border-hairline px-3 py-2 text-[11.5px] text-ink" placeholder="Role duties, duration, safeguarding and payment terms" />
              </label>
              <p className="text-[10.5px] text-sub sm:col-span-2">This issues an unsigned offer only. It does not activate an agent or mark wages as paid.</p>
            </div>
          )}
          {errorMessage && <p role="alert" className="mt-2 text-[11px] text-[#B42318]">{errorMessage}</p>}
        </div>
      )}
    </li>
  );
}

function JobApplicantsPanel({ job, onClose }) {
  const applications = useJobApplications(job.id);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-ink">Applicants — {job.title}</h3>
            <p className="mt-0.5 text-[11.5px] text-sub">Review each submission and record human decisions.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-hairline px-3 py-1.5 text-[12px] text-sub hover:bg-canvas">Close</button>
        </div>
        {applications.isLoading && <p className="py-8 text-center text-[12px] text-sub">Loading applications…</p>}
        {applications.isError && <p role="alert" className="mt-4 rounded-md bg-[#FEF3F2] p-3 text-[12px] text-[#B42318]">Could not load applications: {applications.error.message}</p>}
        {!applications.isLoading && !applications.isError && (applications.data?.length ?? 0) === 0 && (
          <p className="py-8 text-center text-[12px] text-sub">No applications have been submitted for this vacancy.</p>
        )}
        {applications.data?.length > 0 && (
          <ul className="mt-4 space-y-3">
            {applications.data.map((application) => <ApplicantReviewRow key={application.id} application={application} jobId={job.id} programmeId={job.programme_id} />)}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────
export default function JobsTab() {
  const scope = useProgrammeScope();
  const meQuery = useMe();
  const [creating, setCreating] = useState(false);
  const [viewingJob, setViewingJob] = useState(null);

  // Try to use a real programme id from Supabase profile first
  // Fall back to the demo-scoped programme name for backwards compat
  const programmeId = meQuery.data?.profile?.programme_id ?? null;
  const isSupabaseConfigured = Boolean(supabase);
  const hasSupabase = isSupabaseConfigured && Boolean(programmeId);

  const liveJobsQuery = useProgrammeJobs(hasSupabase ? programmeId : null);
  const updateStatus = useUpdateJobStatus(programmeId);

  // If Supabase is configured and we have a programme id, use live data
  const useLiveData = hasSupabase && !liveJobsQuery.isError;
  const liveJobs = liveJobsQuery.data ?? [];

  // Demo/fallback data from programmeScope
  const demoJobs = scope.jobs ?? [];

  const handlePublish = async (jobId, newStatus = "published") => {
    if (!hasSupabase) return;
    try {
      await updateStatus.mutateAsync({ jobId, status: newStatus });
    } catch { /* errors surface via query state */ }
  };

  // ── Loading / Error states ──────────────────────────────────────────────
  if (useLiveData && liveJobsQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-[12.5px] text-sub">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading job postings…
      </div>
    );
  }

  const jobs = isSupabaseConfigured ? liveJobs : demoJobs;
  const open = isSupabaseConfigured
    ? liveJobs.filter((j) => j.status === "published").length
    : demoJobs.filter((j) => j.status === "Open").length;
  const inProcess = isSupabaseConfigured
    ? liveJobs.filter((j) => ["filled"].includes(j.status)).length
    : demoJobs.filter((j) => ["In exam", "In interview"].includes(j.status)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11.5px] text-sub">
          {jobs.length} positions · {open} open · {inProcess} in process
          {!hasSupabase && (
            <span className="ml-2 rounded-full border border-[#FEDF89] bg-[#FFFAEB] px-2 py-[1px] text-[10px] text-[#B54708]">Demo data</span>
          )}
        </p>
        <button
          onClick={() => setCreating(true)}
          data-tour="jobs-post-job"
          disabled={!hasSupabase}
          title={!hasSupabase ? "Sign in to create live jobs" : undefined}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-[12px] font-medium text-white hover:bg-brand/90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Post a job
        </button>
      </div>

      {liveJobsQuery.isError && (
        <div className="flex items-center gap-2 rounded-md border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2 text-[11.5px] text-[#B42318]">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          Live jobs could not be loaded: {liveJobsQuery.error?.message}. No demo vacancies are shown while Supabase is configured.
        </div>
      )}

      {isSupabaseConfigured && !programmeId && !meQuery.isLoading && (
        <div className="flex items-center gap-2 rounded-md border border-[#FEDF89] bg-[#FFFAEB] px-3 py-2 text-[11.5px] text-[#B54708]">
          No programme is linked to this account yet, so live job management is unavailable.
        </div>
      )}

      {!isSupabaseConfigured && (
        <div className="rounded-md border border-[#FEDF89] bg-[#FFFAEB] px-3 py-2 text-[11.5px] text-[#B54708]">
          Demo data is shown because Supabase is not configured in this local environment.
        </div>
      )}

      {isSupabaseConfigured && hasSupabase && liveJobs.length === 0 && !liveJobsQuery.isLoading && !liveJobsQuery.isError && (
        <div className="rounded-xl border border-hairline bg-white px-5 py-10 text-center">
          <Briefcase className="mx-auto mb-3 h-8 w-8 text-[#D0D5DD]" />
          <p className="text-[13px] font-medium text-ink">No job postings yet</p>
          <p className="mt-0.5 text-[11.5px] text-sub">Post your first vacancy to start recruiting agents.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2" data-tour="jobs-list">
        {isSupabaseConfigured
          ? liveJobs.map((j) => (
              <LiveJobCard
                key={j.id}
                job={j}
                onViewApplicants={setViewingJob}
                onPublish={handlePublish}
              />
            ))
          : demoJobs.map((j) => (
              // Legacy demo card — preserved for backwards compatibility
              <div key={j.id} className="rounded-xl border border-hairline bg-white p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-soft text-brand">
                      <Briefcase className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold text-ink">{j.title}</p>
                      <p className="text-[10.5px] text-sub">{j.programme} · {j.type}</p>
                    </div>
                  </div>
                  <span className={`inline-flex rounded-full border px-2 py-[2px] text-[10px] font-medium ${jobStatusStyle(j.status)}`}>{j.status}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[11.5px]">
                  <div className="rounded-lg bg-canvas px-2.5 py-1.5">
                    <p className="text-[10px] text-[#8A94A6]">Budget</p>
                    <p className="font-medium text-ink">RWF {j.budget.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg bg-canvas px-2.5 py-1.5">
                    <p className="text-[10px] text-[#8A94A6]">Applicants</p>
                    <p className="font-medium text-ink">{j.applicants}</p>
                  </div>
                  <div className="rounded-lg bg-canvas px-2.5 py-1.5">
                    <p className="text-[10px] text-[#8A94A6]">Deadline</p>
                    <p className="font-medium text-ink">{j.deadline}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {j.skills.map((s) => (
                    <span key={s} className="rounded-full border border-hairline px-2 py-[2px] text-[10px] text-sub">{s}</span>
                  ))}
                </div>
              </div>
            ))
        }
      </div>

      {creating && hasSupabase && (
        <CreateJobModal programmeId={programmeId} onClose={() => setCreating(false)} />
      )}

      {viewingJob && (
        <JobApplicantsPanel job={viewingJob} onClose={() => setViewingJob(null)} />
      )}
    </div>
  );
}
