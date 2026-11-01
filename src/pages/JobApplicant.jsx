import React, { useState } from "react";
import { Briefcase, MapPin, Clock, Loader2, AlertCircle, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import Card from "@/components/analyst/Card";
import PanelGuide from "@/components/analyst/PanelGuide";
import FeatureMiniEntry from "@/components/discovery/FeatureMiniEntry";
import { usePublishedJobs, useMyApplications, useApplyForJob } from "@/lib/jobsApi";
import { supabase } from "@/lib/supabaseClient";
import { useMe } from "@/lib/memberApi";
import { useTranslation } from "react-i18next";

// ── helpers ──────────────────────────────────────────────────────────────
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-RW") : "—");
const APPLICATION_STATUS_STYLE = {
  submitted: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]",
  screening: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]",
  assessment: "border-[#D3CEFF] bg-[#EFEDFF] text-[#4B3FCC]",
  interview: "border-[#D3CEFF] bg-[#EFEDFF] text-[#4B3FCC]",
  offered: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]",
  contracted: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]",
  under_review: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]",
  shortlisted: "border-[#D3CEFF] bg-[#EFEDFF] text-[#4B3FCC]",
  exam_scheduled: "border-[#D3CEFF] bg-[#EFEDFF] text-[#4B3FCC]",
  interview_scheduled: "border-[#D3CEFF] bg-[#EFEDFF] text-[#4B3FCC]",
  hired: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]",
  rejected: "border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]",
  withdrawn: "border-hairline bg-[#FAFBFD] text-[#8A94A6]",
};
const APPLICATION_STATUS_LABEL = {
  submitted: "Submitted",
  screening: "Under review",
  assessment: "Assessment",
  interview: "Interview scheduled",
  offered: "Offer issued",
  contracted: "Contracted",
  under_review: "Under review",
  shortlisted: "Shortlisted",
  exam_scheduled: "Exam scheduled",
  interview_scheduled: "Interview scheduled",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

// ── Apply modal ──────────────────────────────────────────────────────────
const EMPTY = { cover_note: "", education_level: "", education_institution: "", education_field: "", education_grad_year: "", work_experience_years: "", skills_self_reported_raw: "" };

function ApplyModal({ job, userId, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(false);
  const applyMut = useApplyForJob();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async () => {
    setErr(null);
    if (!form.cover_note.trim()) return setErr("Please write a short cover note.");
    try {
      await applyMut.mutateAsync({
        job_id: job.id,
        applicant_user_id: userId,
        cover_note: form.cover_note.trim(),
        education_level: form.education_level || null,
        education_institution: form.education_institution.trim() || null,
        education_field: form.education_field.trim() || null,
        education_grad_year: form.education_grad_year ? Number(form.education_grad_year) : null,
        work_experience_years: form.work_experience_years ? Number(form.work_experience_years) : 0,
        skills_self_reported: form.skills_self_reported_raw ? form.skills_self_reported_raw.split(",").map((s) => s.trim()).filter(Boolean) : [],
      });
      setDone(true);
      setTimeout(onClose, 1400);
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[15px] font-semibold text-ink">Apply — {job.title}</h3>
        <p className="mt-0.5 text-[11.5px] text-sub">{job.programme_catalog?.name} · {job.location_district}</p>

        {done && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-[#ABEFC6] bg-[#ECFDF3] px-3 py-2 text-[12px] text-[#067647]">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> Application submitted successfully.
          </div>
        )}
        {err && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2 text-[12px] text-[#B42318]">
            <AlertCircle className="h-4 w-4 flex-shrink-0" /> {err}
          </div>
        )}

        <div className="mt-4 space-y-3">
          <textarea
            placeholder="Cover note — tell us why you're the right candidate *"
            value={form.cover_note} onChange={set("cover_note")}
            rows={4}
            className="w-full resize-none rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand"
          />
          <div className="grid grid-cols-2 gap-3">
            <select value={form.education_level} onChange={set("education_level")} className="rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand">
              <option value="">Education level</option>
              <option value="primary">Primary</option>
              <option value="lower_secondary">Lower secondary (S3)</option>
              <option value="upper_secondary">Upper secondary (S6)</option>
              <option value="tvet">TVET / Vocational</option>
              <option value="bachelors">Bachelor's degree</option>
              <option value="masters">Master's or above</option>
            </select>
            <input placeholder="Graduation year" type="number" value={form.education_grad_year} onChange={set("education_grad_year")} className="rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand" />
          </div>
          <input placeholder="Institution / school" value={form.education_institution} onChange={set("education_institution")} className="w-full rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand" />
          <input placeholder="Field of study" value={form.education_field} onChange={set("education_field")} className="w-full rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand" />
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Years of experience" type="number" value={form.work_experience_years} onChange={set("work_experience_years")} className="rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand" />
            <input placeholder="Skills (comma separated)" value={form.skills_self_reported_raw} onChange={set("skills_self_reported_raw")} className="rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand" />
          </div>
        </div>

        <p className="mt-3 text-[10.5px] text-[#8A94A6]">
          Hiring decisions are made by human reviewers using competency criteria. Education level alone is not a disqualifying factor.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-hairline px-3 py-1.5 text-[12px] text-sub hover:bg-canvas">Cancel</button>
          <button
            disabled={applyMut.isPending || done}
            onClick={handleSubmit}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-1.5 text-[12px] font-medium text-white hover:bg-brand/90 disabled:opacity-60"
          >
            {applyMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Submit application
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Job detail row ────────────────────────────────────────────────────────
function JobRow({ job, onApply, myApplicationIds }) {
  const [open, setOpen] = useState(false);
  const alreadyApplied = myApplicationIds.has(job.id);
  const deadline = job.application_deadline ? new Date(job.application_deadline) : null;
  const isExpired = deadline && deadline < new Date();

  return (
    <li className="border-b border-hairline/70 last:border-0">
      <div
        className="flex cursor-pointer flex-wrap items-start justify-between gap-3 px-5 py-3.5 hover:bg-[#FAFBFD]"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-ink">{job.title}</p>
          <p className="mt-0.5 text-[11.5px] text-sub">{job.programme_catalog?.name}</p>
          <div className="mt-1.5 flex flex-wrap gap-3 text-[10.5px] text-[#8A94A6]">
            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {job.location_district || "Rwanda"}</span>
            <span className="inline-flex items-center gap-1"><Briefcase className="h-3 w-3" /> {job.employment_type?.replace(/_/g, " ") || "—"}</span>
            <span className={`inline-flex items-center gap-1 ${isExpired ? "text-[#B42318]" : ""}`}>
              <Clock className="h-3 w-3" /> {isExpired ? "Closed" : fmtDate(job.application_deadline)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {alreadyApplied ? (
            <span className="inline-flex rounded-full border border-[#ABEFC6] bg-[#ECFDF3] px-2 py-[2px] text-[10.5px] font-medium text-[#067647]">Applied</span>
          ) : !isExpired ? (
            <button
              onClick={(e) => { e.stopPropagation(); onApply(job); }}
              className="rounded-md border border-hairline px-3 py-1.5 text-[11.5px] font-medium text-ink hover:bg-canvas"
            >
              Apply
            </button>
          ) : (
            <span className="text-[10.5px] text-[#8A94A6]">Closed</span>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-sub" /> : <ChevronDown className="h-4 w-4 text-sub" />}
        </div>
      </div>

      {open && (
        <div className="border-t border-hairline/50 bg-[#FAFBFD] px-5 py-3 text-[11.5px]">
          {job.description && <p className="text-sub leading-relaxed">{job.description}</p>}
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {job.exam_date && (
              <div>
                <p className="text-[10px] text-[#8A94A6] font-medium">Exam date</p>
                <p className="text-ink">{fmtDate(job.exam_date)} {job.exam_time ? `· ${job.exam_time}` : ""}</p>
                {job.exam_venue && <p className="text-[10px] text-sub">{job.exam_venue}</p>}
              </div>
            )}
            {job.interview_date && (
              <div>
                <p className="text-[10px] text-[#8A94A6] font-medium">Interview date</p>
                <p className="text-ink">{fmtDate(job.interview_date)} {job.interview_time ? `· ${job.interview_time}` : ""}</p>
                {job.interview_venue && <p className="text-[10px] text-sub">{job.interview_venue}</p>}
              </div>
            )}
            {job.salary_max && (
              <div>
                <p className="text-[10px] text-[#8A94A6] font-medium">Salary</p>
                <p className="text-ink">{job.salary_currency ?? "RWF"} {Number(job.salary_max).toLocaleString()}</p>
              </div>
            )}
          </div>
          {Array.isArray(job.required_skills) && job.required_skills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {job.required_skills.map((s) => (
                <span key={s} className="rounded-full border border-hairline px-2 py-[1px] text-[10px] text-sub">{s}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// ── Main export ────────────────────────────────────────────────────────────
const DEMO_POSITIONS = [
  { id: "demo-1", title: "Field Agent", programme_catalog: { name: "VUP Direct Support" }, location_district: "Nyaruguru", employment_type: "full_time", application_deadline: "2024-11-10" },
  { id: "demo-2", title: "Data Entry Officer", programme_catalog: { name: "Girinka Munyarwanda" }, location_district: "Nyanza", employment_type: "contract", application_deadline: "2024-11-08" },
  { id: "demo-3", title: "Programme Officer", programme_catalog: { name: "Expanded Public Works" }, location_district: "Nyamagabe", employment_type: "full_time", application_deadline: "2024-11-15" },
];

export default function JobApplicant() {
  const { t } = useTranslation();
  const [applyingFor, setApplyingFor] = useState(null);
  const meQuery = useMe();
  const userId = meQuery.data?.profile?.id ?? null;

  const liveJobsQuery = usePublishedJobs();
  const myAppsQuery = useMyApplications();

  const isSupabaseConfigured = Boolean(supabase);
  const positions = isSupabaseConfigured ? (liveJobsQuery.data ?? []) : DEMO_POSITIONS;
  const myApplications = myAppsQuery.data ?? [];
  const myApplicationIds = new Set(myApplications.map((a) => a.agent_job_postings?.id));

  return (
    <div className="pb-14">
      <PageHeader
        title={t("pageTitles.jobs")}
        badge={
          <span className="hidden items-center gap-1.5 rounded-full border border-hairline px-2 py-[3px] text-[11px] text-sub sm:inline-flex">
            {liveJobsQuery.isLoading ? "Loading…" : `${positions.length} open position${positions.length !== 1 ? "s" : ""}`}
          </span>
        }
      />

      <PanelGuide id="job-applicant" title="Find a Job">
        This page shows open positions across social-support programmes. Apply to roles that match
        your skills. Check your application status at the top.
      </PanelGuide>

      <div className="mx-auto max-w-[1100px] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-4">
          <h2 className="text-[20px] font-semibold tracking-tight text-ink">Open Positions</h2>
          <p className="mt-0.5 text-[12px] text-sub">Apply to social-support programmes across Rwanda</p>
        </div>

        <FeatureMiniEntry className="mb-4" anchor="job-referrals" titleKey="discover.mini.whatCanWeDo" ids={["referral-followup"]} />

        {/* My applications status */}
        {myApplications.length > 0 && (
          <Card tour="job-application" title="Your applications" subtitle={`${myApplications.length} submitted`} className="mb-4">
            <ul className="space-y-2">
              {myApplications.map((app) => (
                <li key={app.id} className="flex items-center justify-between rounded-lg border border-hairline px-4 py-3">
                  <div>
                    <p className="text-[12.5px] font-medium text-ink">
                      {app.agent_job_postings?.title ?? "—"} · {app.agent_job_postings?.programme_catalog?.name ?? "—"}
                    </p>
                    <p className="text-[11px] text-sub">Submitted {fmtDate(app.submitted_at)}</p>
                    {app.interview_slots?.map((slot) => (
                      <p key={`${slot.scheduled_at}-${slot.venue}`} className="mt-1 text-[11px] text-sub">
                        Interview {fmtDate(slot.scheduled_at)} · {new Date(slot.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {slot.venue || "Venue to be confirmed"}
                      </p>
                    ))}
                  </div>
                  <span className={`inline-flex rounded-full border px-2 py-[2px] text-[10.5px] font-medium ${APPLICATION_STATUS_STYLE[app.status] ?? "border-hairline text-sub"}`}>
                    {APPLICATION_STATUS_LABEL[app.status] ?? app.status}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Demo fallback status card when no real session */}
        {!isSupabaseConfigured && (
          <Card tour="job-application" title="Your application" subtitle="Current status" className="mb-4">
            <div className="flex items-center justify-between rounded-lg border border-hairline px-4 py-3">
              <div>
                <p className="text-[12.5px] font-medium text-ink">Field Agent · VUP Direct Support</p>
                <p className="text-[11px] text-sub">Submitted 21 Oct 2024</p>
              </div>
              <span className="inline-flex rounded-full border border-[#FEDF89] bg-[#FFFAEB] px-2 py-[2px] text-[10.5px] font-medium text-[#B54708]">
                Under review
              </span>
            </div>
          </Card>
        )}

        {/* Live / demo error notice */}
        {isSupabaseConfigured && liveJobsQuery.isError && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-[#FEDF89] bg-[#FFFAEB] px-3 py-2 text-[11.5px] text-[#B54708]">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            Could not load live positions: {liveJobsQuery.error?.message}. No demo vacancies are shown while Supabase is configured.
          </div>
        )}

        {isSupabaseConfigured && myAppsQuery.isError && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2 text-[11.5px] text-[#B42318]">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            Could not load your application status: {myAppsQuery.error?.message}
          </div>
        )}

        {!isSupabaseConfigured && (
          <div className="mb-4 rounded-md border border-[#FEDF89] bg-[#FFFAEB] px-3 py-2 text-[11.5px] text-[#B54708]">
            Demo data is shown because Supabase is not configured in this local environment.
          </div>
        )}

        <Card tour="job-open" title="Open positions" subtitle={`${positions.length} roles`} bodyClassName="px-0 pb-0">
          {liveJobsQuery.isLoading ? (
            <div className="flex items-center gap-2 py-8 px-5 text-[12.5px] text-sub">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading open positions…
            </div>
          ) : positions.length === 0 ? (
            <div className="py-8 px-5 text-center text-[12.5px] text-sub">
              No open positions right now. Check back soon.
            </div>
          ) : (
            <ul className="border-t border-hairline">
              {positions.map((p) => (
                <JobRow
                  key={p.id}
                  job={p}
                  onApply={setApplyingFor}
                  myApplicationIds={myApplicationIds}
                />
              ))}
            </ul>
          )}
        </Card>

        <p className="mt-5 text-[10.5px] text-[#8A94A6]">
          Job applicants get a limited account: applications and status only. Hiring decisions are made by human reviewers using competency-based criteria.
        </p>
      </div>

      {applyingFor && userId && (
        <ApplyModal job={applyingFor} userId={userId} onClose={() => setApplyingFor(null)} />
      )}
      {applyingFor && !userId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setApplyingFor(null)}>
          <div className="rounded-xl bg-white p-5 shadow-xl max-w-sm text-center">
            <AlertCircle className="mx-auto mb-2 h-8 w-8 text-[#B54708]" />
            <p className="text-[13px] font-semibold text-ink">Sign in to apply</p>
            <p className="mt-1 text-[12px] text-sub">You need a signed-in account to submit an application.</p>
            <button onClick={() => setApplyingFor(null)} className="mt-3 rounded-md border border-hairline px-4 py-1.5 text-[12px] text-sub hover:bg-canvas">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
