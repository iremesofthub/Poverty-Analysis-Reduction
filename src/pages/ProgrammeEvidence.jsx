import React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import PageHeader from "@/components/layout/PageHeader";
import Card from "@/components/analyst/Card";
import PanelGuide from "@/components/analyst/PanelGuide";
import ReconciliationSection from "@/components/analyst/ReconciliationSection";
import { NATIONAL_EICV7 } from "@/data/dashboardEvidence";

// The four shares below are the page's own demonstration breakdown, and they overlap: one household can
// report more than one VUP support component in the same year. `MIX` therefore feeds the reconciliation panel
// as memberships, not as a set that adds up to a coverage figure.
const MIX = [
  { name: "Direct support", key: "direct_support", value: 2.7 },
  { name: "Classic public works", key: "public_works_classic", value: 2.4 },
  { name: "Expanded public works", key: "public_works_expanded", value: 2.1 },
  { name: "Financial services", key: "financial_services", value: 2.0 },
];

const MEMBERSHIP_SHARES = Object.fromEntries(MIX.map((item) => [item.key, item.value]));

// Everything in FUNNEL, MONTHS, PROGRAMMES and the demo KPIs is a record held by this platform for the
// demonstration. None of it is a beneficiary register, a provider settlement, or an observation about
// Rwanda's programme, and none of it is converted into a coverage or finance metric.
const FUNNEL = [
  { stage: "Enrolled", value: 24800 },
  { stage: "Payment sent", value: 23410 },
  { stage: "Payment received", value: 22705 },
  { stage: "Verified by agent", value: 19840 },
];

const MONTHS = [
  { m: "Nov", v: 1.42 },
  { m: "Dec", v: 1.51 },
  { m: "Jan", v: 1.38 },
  { m: "Feb", v: 1.61 },
  { m: "Mar", v: 1.58 },
  { m: "Apr", v: 1.72 },
  { m: "May", v: 1.66 },
  { m: "Jun", v: 1.79 },
  { m: "Jul", v: 1.74 },
  { m: "Aug", v: 1.83 },
  { m: "Sep", v: 1.79 },
  { m: "Oct", v: 1.86 },
];

// The record counts below are demonstration enrolment rows held by this platform. They are deliberately
// not allowed to collide with a published survey figure: the EICV7 cross-tabulation sample contains
// 1,430 VUP households (src/data/datasets.js, "Who receives VUP support"), and that row used to read
// "1,430" too, which let a reader pair a survey sub-sample with a programme's enrolment. A demo count
// that looks like a survey count is the exact confusion UPG-05 exists to prevent, so VUP Direct Support
// now carries a synthetic value that matches nothing in the survey artifacts.
const PROGRAMMES = [
  { name: "VUP Direct Support", hh: "1,386", budget: "RWF 2.4B", delivered: 92, status: "Watch" },
  { name: "Classic public works", hh: "1,260", budget: "RWF 3.1B", delivered: 88, status: "On track" },
  { name: "Expanded public works", hh: "1,104", budget: "RWF 2.7B", delivered: 81, status: "Watch" },
  { name: "Financial services", hh: "1,051", budget: "RWF 0.9B", delivered: 95, status: "On track" },
];

const BADGE = {
  Watch: "bg-[#FFFAEB] text-[#B54708] border-[#FEDF89]",
  "On track": "bg-[#ECFDF3] text-[#067647] border-[#ABEFC6]",
};

// UPG-05: a figure on this page is either a published survey estimate or a demonstration record, and the
// reader has to be able to tell which without leaving the page. The two scopes are coloured differently and
// named in words, because a colour alone is not an accessible distinction.
const SCOPE = {
  survey: { label: "Survey estimate", className: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]" },
  demo: { label: "Demo record", className: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]" },
};

function Kpi({ label, value, foot, scope, testId = undefined }) {
  const badge = SCOPE[scope];
  return (
    <div className="rounded-xl border border-hairline bg-white px-4 py-3.5">
      <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] font-medium text-sub">
        {label}
        {badge && (
          <span data-testid="kpi-scope" className={`inline-flex rounded-full border px-1.5 py-[1px] text-[9.5px] font-medium ${badge.className}`}>
            {badge.label}
          </span>
        )}
      </p>
      <p data-testid={testId} className="mt-1 text-[24px] font-semibold leading-none tracking-tight text-ink tabular-nums">{value}</p>
      <p className="mt-1.5 text-[11px] leading-snug text-[#8A94A6]">{foot}</p>
    </div>
  );
}

export default function ProgrammeEvidence() {
  const max = FUNNEL[0].value;

  return (
    <div className="pb-14">
      <PageHeader
        title="Programme Results"
        badge={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FEDF89] bg-[#FFFAEB] px-2 py-[3px] text-[10.5px] font-medium text-[#B54708]">
            Sample data
          </span>
        }
      />

      <PanelGuide id="programme-results" title="Programme Results">
        This page tracks how social protection programmes are performing. See payments delivered, who
        received them, and which programmes are on track or need attention. Two kinds of number appear here:
        published survey estimates from NISR's EICV7 household survey, and demonstration records this platform
        holds to show the workflow. Each figure says which one it is, and the reconciliation panel at the
        bottom explains why the two are never subtracted from each other.
      </PanelGuide>

      <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-4">
          <h2 className="text-[20px] font-semibold tracking-tight text-ink">Programme Results</h2>
          <p className="mt-0.5 text-[12px] text-sub">How aid programmes are performing</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <Kpi
            scope="survey"
            testId="kpi-survey-coverage"
            label="VUP coverage of households"
            value={`${NATIONAL_EICV7.vupAmongAllHouseholds.toFixed(1)}%`}
            foot={`EICV7 2023/24 estimate · share of all households reporting VUP support. No design interval is published for this measure in this build.`}
          />
          <Kpi
            scope="survey"
            testId="kpi-survey-sample"
            label="VUP households in the survey sample"
            value="1,430"
            foot={`Out of ${NATIONAL_EICV7.sampleHouseholds.toLocaleString()} surveyed households. This is what the survey counted, not a programme's enrolment.`}
          />
          <Kpi scope="demo" label="Payments this month" value="RWF 1.86B" foot="Across the 4 demonstration programmes. Not a provider-confirmed settlement." />
          <Kpi scope="demo" label="Reached, verified" value="80%" foot={`${FUNNEL[3].value.toLocaleString()} of ${max.toLocaleString()} enrolled demo records.`} />
          <Kpi scope="demo" label="Active agents" value="312" foot="1 agent per 79 enrolled demo records." />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card
            tour="ev-payments" title="Payments Delivered"
            subtitle="Money sent to families each month"
            info="This chart shows how much money the demo records say was paid out each month across the four programmes. A line going up means more money was sent in the demonstration. These are sample payment values, not provider-confirmed settlements."
            aiInsight="This chart tracks monthly payment totals in the demonstration data. An upward line means more money was sent in the demo. A sudden drop would point to a payment step to review in the workflow, not to a real programme problem, because these values are sample records."
            className="xl:col-span-2"
          >
            {/* UPG-09: the same series in words for a reader who cannot see the shape, and the provenance of the
                figures under it, because payment values on this page are demonstration records. */}
            <div role="img" aria-label={`Monthly payments delivered in the demonstration data, in Rwandan francs. ${MONTHS.map((item) => `${item.m}: RWF ${item.v.toFixed(2)} billion`).join(". ")}. These are sample payment values, not provider-confirmed settlements.`}>
              <ResponsiveContainer width="100%" height={226}>
                <AreaChart data={MONTHS} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
                  <defs>
                    <linearGradient id="payFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#635BFF" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#635BFF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#EDF1F7" />
                  <XAxis dataKey="m" tick={{ fontSize: 10.5, fill: "#8A94A6" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10.5, fill: "#8A94A6" }} axisLine={false} tickLine={false} domain={[0, 2]} />
                  <Tooltip
                    formatter={(v) => [`RWF ${Number(v).toFixed(2)}B`, "Delivered"]}
                    contentStyle={{ borderRadius: 8, border: "1px solid #E3E8EE", fontSize: 11 }}
                  />
                  <Area type="monotone" dataKey="v" stroke="#635BFF" strokeWidth={2} fill="url(#payFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-[10.5px] leading-snug text-sub">Source: monthly delivery totals held by this demo panel. Payment values are sample data for the demonstration, not provider-confirmed settlement.</p>
          </Card>

          <Card
            tour="ev-journey" title="Payment Journey"
            subtitle="From enrolled to money received, in the demo records"
            info="This shows how many demo records reach each step, from enrolled to verified by an agent. It counts records in this platform, not families in Rwanda. A big drop between two steps is a place to look again in the workflow."
            aiInsight="This funnel tracks demonstration records through the payment workflow. The largest drop here sits between 'Payment received' and 'Verified by agent'. Because these are demo records, that gap shows where the workflow loses confirmation in the demonstration; it is not a measurement of payments in the real programme."
          >
            <ul className="space-y-3">
              {FUNNEL.map((f, i) => {
                const pct = (f.value / max) * 100;
                return (
                  <li key={f.stage}>
                    <div className="flex items-baseline justify-between text-[11.5px]">
                      <span className="text-sub">{f.stage}</span>
                      <span className="font-medium tabular-nums text-ink">{f.value.toLocaleString()}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#F1F4F9]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: "#635BFF", opacity: 0.9 - i * 0.18 }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card
            tour="ev-mix" title="Programme Mix"
            subtitle="Demo coverage shares by programme component"
            info="This shows the demo share for each of the four programme components. A longer bar means a bigger share in the demonstration data. One household can be in more than one component, so these shares are memberships and do not add up to the number of families reached."
            aiInsight="This chart shows the demonstration coverage share for each programme component, with 'Direct support' highest at 2.7 percent. The components overlap, so the four bars are counts of memberships and their sum is an upper bound, not a coverage figure. Nothing here is an official programme total."
          >
            <div role="img" aria-label={`Demo coverage share by programme component, as memberships rather than unique households. ${MIX.map((item) => `${item.name}: ${item.value.toFixed(1)} percent`).join(". ")}. The four shares overlap, so their sum of ${MIX.reduce((sum, item) => sum + item.value, 0).toFixed(1)} percent is an upper bound on memberships, not a coverage figure.`}>
              <ResponsiveContainer width="100%" height={188}>
                <BarChart data={MIX} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap="28%">
                <CartesianGrid horizontal={false} stroke="#EDF1F7" />
                <XAxis
                  type="number"
                  domain={[0, 4]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 10, fill: "#8A94A6" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fontSize: 10, fill: "#425466" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "#F7F9FC" }}
                  formatter={(v) => [`${Number(v).toFixed(1)}%`, ""]}
                  contentStyle={{ borderRadius: 8, border: "1px solid #E3E8EE", fontSize: 11 }}
                />
                <Bar dataKey="value" radius={[0, 3, 3, 0]} barSize={8}>
                  {MIX.map((m, i) => (
                    <Cell key={m.name} fill={i === 0 ? "#635BFF" : "#B3ADFF"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
            <p className="mt-2 text-[10.5px] leading-snug text-sub">Source: coverage shares held by this demo panel. No NISR component breakdown in this build carries these four values, and the household counts behind the shares are demonstration records, so they are not quoted as coverage.</p>
          </Card>

          <Card
            tour="ev-table" title="Programme Performance"
            subtitle="Demo budget, member records and status"
            info="This table shows each programme's budget, member records held by this platform, delivery share and status in the demonstration. The counts are demo records, not a beneficiary register and not the survey sample. 'Watch' means the demonstration marks it for a closer look."
            aiInsight="This table compares the four demonstration programmes. 'Delivered' is the share of the demo budget recorded as delivered, and 'Member records' counts enrolment records held by this platform, so neither column is an official programme figure. Programmes marked 'Watch' are the ones the demonstration flags for review."
            className="xl:col-span-2"
            bodyClassName="px-0 pb-0"
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-y border-hairline bg-[#FAFBFD] text-[10.5px] uppercase tracking-[0.06em] text-[#8A94A6]">
                    <th className="py-2 pl-5 pr-3 text-left font-medium">Programme</th>
                    <th className="px-3 py-2 text-right font-medium">Member records</th>
                    <th className="px-3 py-2 text-right font-medium">Demo budget</th>
                    <th className="px-3 py-2 text-right font-medium">Delivered</th>
                    <th className="py-2 pl-3 pr-5 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {PROGRAMMES.map((p) => (
                    <tr key={p.name} className="border-b border-hairline/70 last:border-0 hover:bg-[#FAFBFD]">
                      <td className="py-2.5 pl-5 pr-3 font-medium text-ink">{p.name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-sub">{p.hh}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-sub">{p.budget}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink">{p.delivered}%</td>
                      <td className="py-2.5 pl-3 pr-5 text-right">
                        <span className={`inline-flex rounded-full border px-2 py-[2px] text-[10.5px] font-medium ${BADGE[p.status]}`}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-5 pb-4 text-[10.5px] leading-snug text-sub">Source: demonstration member records and budget lines held by this platform. No authorised beneficiary register is present in this build, so these counts are not reconciled against one.</p>
          </Card>
        </div>

        <div className="mt-4">
          <ReconciliationSection membershipValues={MEMBERSHIP_SHARES} fileStem="programme-evidence-reconciliation" />
        </div>

        <p className="mt-5 text-[10.5px] leading-snug text-[#8A94A6]">
          Survey figures come from NISR EICV7 2023/24 and carry the uncertainty and review status recorded on the Statistics Dashboard.
          Payment, agent, budget and member-record values on this page are demonstration data held by this platform: they are not programme
          totals, not provider-confirmed settlements, and they are not converted into coverage or impact figures.
        </p>
      </div>
    </div>
  );
}