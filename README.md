# Ireme Insight

**Turning data into action for a stronger Rwanda.**

Ireme Insight is a digital platform built by **Ireme Soft Hub** for the **NISR Big Data Hackathon 2026, Track 2: Financial Inclusion and Poverty Reduction**.

It helps people understand poverty in Rwanda and take practical steps to reduce it. The platform connects data analysis, social support programmes, jobs for young people, skills training, financial services, and government reporting in one place.

Our goal is simple: **Find where help is needed, support people in the right way, and check what changes.**

## Why We Built Ireme Insight

Rwanda has made progress in reducing poverty, but many families still need support. At the same time, some young people have finished school or university and are looking for work.

Social support programmes can help families, but it is not always easy to see which areas need help first, whether support reached the right people, or what happened after that support was provided.

Ireme Insight brings these parts together. It uses data to help people make decisions and gives programme teams tools to act on those decisions.

## What the Platform Does

### 1. Understand Poverty and Financial Inclusion

The Statistics Dashboard helps analysts and decision-makers:

- See poverty levels and changes across Rwanda.
- Compare districts using charts and maps.
- Explore access to banks and mobile money.
- Look at social support coverage and national development goals.
- Read clear explanations of charts and indicators.
- Use the District Investigation workspace to study local problems in more detail.

### 2. Turn Data Into Action

The Ireme Insight AI Engine provides a governed workspace for authorized runs, source lineage, immutable hypotheses, bounded AI research proposals, and report review. In **HACKATHON_DEMO** mode, the governed API accepts unauthenticated requests and creates a demo principal automatically, so panel buttons appear without signing in to Supabase first. When a real Supabase session exists, its bearer token is forwarded and the API verifies role, district, and dataset permission as usual.

An analyst can use a finding to request action from a programme or government team. The request can then be followed through to a response and an outcome.

**Important:** AI results must be checked. A link between two facts does not always mean that one caused the other. Outputs produced in demo mode are labelled **DEMONSTRATION / NOT INDEPENDENTLY CERTIFIED**.

### 3. Manage Social Support Programmes

Programme teams, such as those working on VUP or Girinka Munyarwanda, can use the platform to manage:

- Programme members and their support needs.
- Agent jobs, applications, and assignments.
- Planned budgets, payments, and delivery records.
- Training, field visits, requests, and follow-up work.
- Programme results and reports.

The **Financial Usage Map** is part of programme work. It helps teams compare areas and spot gaps in support and access to financial services.

### 4. Create Jobs for Young People

Programmes can offer paid field-agent jobs to qualified applicants, including people who have completed secondary school or university.

Applicants can share their skills and experience. Programme managers can review applications, check practical knowledge, arrange interviews, and assign selected agents to communities.

This creates a way for young people to use what they have learned while helping other families.

### 5. Help Families Use New Skills

An agent does more than teach a lesson. The goal is to help a family put that lesson into practice.

For example, an agent may help a programme member plan a small business, learn how to manage money, join a cooperative, or start an income-generating activity.

The work follows a clear process:

**Learn a skill > Make a plan > Try it in real life > Record progress > Check results**

Agents can record visits, completed tasks, and optional photos with the member's consent. A supervisor should check important results before they are reported as verified.

### 6. Help More People Use Financial Services

Some families do not have a smartphone, a bank account, or enough knowledge about financial services.

Ireme Insight aims to help them:

- Learn how bank accounts and mobile money work.
- Get help with voluntary account-opening referrals.
- Understand saving and responsible borrowing.
- Find information about suitable financial services.
- Receive assistance from an authorized agent when they cannot use the app themselves.

Opening an account does not guarantee a loan. A bank or financial service provider makes its own decisions.

### 7. Support Cooperatives

The cooperative tools help members join groups, follow activities, share useful information, and work together. The project also includes plans for clearer savings records, small business records, and member opportunities.

### 8. Help Government Follow Progress

Government users can see information that matches their responsibilities at district, sector, or cell level.

The platform is designed to help them understand:

- Where poverty and support gaps are found.
- What programmes are doing in their areas.
- How approved funds are planned and recorded.
- Whether support payments and agent wages have been recorded and confirmed.
- How many people have received training or started practical activities.
- Which problems still need attention.

Private personal and financial information must only be shown to authorized users. The system cannot confirm where money went unless it has reliable transaction records.

### 9. Include People Without Smartphones

Ireme Insight supports different ways to access help:

- **Web app:** For people with internet access.
- **USSD simulator:** Shows how a basic-phone service can work without mobile internet.
- **Field-agent assistance:** Helps people who do not have a phone or need support using technology.

The app includes English and Kinyarwanda support.

## How It Works: A Simple Example

1. An analyst finds a district where many families need support.
2. A programme reviews the finding and decides what action to take.
3. The programme recruits and pays qualified field agents.
4. An agent is assigned to a programme member.
5. The agent helps the member learn a useful skill and start a practical activity.
6. The agent records progress, and a supervisor checks the evidence.
7. The member can ask for help using a bank, mobile money, or a cooperative.
8. Programme managers and government officers review the recorded work and follow up where needed.

This is how Ireme Insight connects **data, jobs, skills, financial access, and support for families**.

## Who Can Use It?

| User | Main purpose |
| --- | --- |
| NISR analyst | Study data, investigate problems, and prepare findings. |
| Programme manager | Manage support, jobs, agents, members, and programme funds. |
| Government officer | Follow programmes and needs in an authorized area. |
| Field agent | Visit assigned families and help them put skills into practice. |
| Programme member | Check support, report problems, and find opportunities. |
| Job applicant | Find jobs and apply to become a field agent. |
| Cooperative manager or member | Manage group activities and membership. |
| Platform administrator | Manage access, settings, and the platform. |

## Technology We Use

| Part of the project | Technology |
| --- | --- |
| Website | React, Vite, and Tailwind CSS |
| Database and sign-in | Supabase and PostgreSQL |
| Access control | Supabase Row Level Security |
| Charts and maps | Recharts and Rwanda map data |
| Data analysis | Python and statistical tools |
| AI-assisted investigation | Ireme Insight AI Engine (governed API, Fly.io) |
| Basic-phone experience | USSD simulator and related services |
| Testing | JavaScript tests, Python tests, and integration checks |
| Demo mode | HACKATHON_DEMO — buttons and API work without Supabase login |

## Run the Project on Your Computer

You need **Node.js and npm**. Python is needed to run the governed AI Engine API locally.

### Step 1: Download the code

```bash
git clone https://github.com/intoregaby/Poverty-Analysis-Reduction.git
cd Poverty-Analysis-Reduction
```

This repository may require access permission if it is private.

### Step 2: Install the packages

```bash
npm install
```

### Step 3: Set up your environment

Copy `.env.example` to `.env.local` and fill in only the settings you need.

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

The project uses `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_IREME_API_URL` for the web client. AI provider keys such as `GROQ_API_KEY` belong in the server environment (or the ignored `.env.local` for local API development), never in `VITE_` variables.

**Demo mode:** The governed API runs in `HACKATHON_DEMO` mode by default. Role buttons appear without signing in to Supabase, and API calls work without a bearer token. You do **not** need to set `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY` to use demo mode.

**Never share API keys or commit `.env.local` to GitHub.**

### Step 4: Start the website

```bash
npm run dev -- --host 127.0.0.1
```

Open the local address shown in your terminal.

### Step 5: Run the project checks

```bash
npm test
npm run lint
npm run build
```

These commands check different parts of the website. They do not, by themselves, prove that every external service works.

### Optional: Run the governed AI Engine API locally

Install the Python dependencies and configure the Supabase issuer, audience, JWKS, and local catalog/audit storage settings in `.env.local`, then start the FastAPI service:

On Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r engine/requirements.txt
.\.venv\Scripts\python.exe -m uvicorn ireme.api:configured_app --factory --app-dir engine --host 127.0.0.1 --port 8020
```

Set `VITE_IREME_API_URL=http://127.0.0.1:8020` in `.env.local` for the Vite client. The service checks signed server-managed tenant, role, geography, and dataset permission claims. Provider calls also require the configured gateway and applicable disclosure clearance. The local reference API supports creating, checking, and resuming EICV7 research jobs with an in-process background worker. Its SQLite adapters and worker are for local development; production still needs durable storage, a managed worker system, hosted identity/MFA, and release operations. Register the dataset only after the signed NISR approval and exact permitted purpose are recorded.

## Data Sources and Trust

The project works with NISR survey information, including **EICV** household living conditions data and **FinScope** financial inclusion data.

Important rules:

- Keep the name and year of each data source.
- Explain how each number was calculated.
- Do not show made-up numbers as official facts.
- Do not treat a model result as proof of a real-world outcome.
- Protect private family records and personal photos.
- Show the difference between example payments and confirmed payments.

The source survey files are not shared in this GitHub repository. Some data and tools require permission to use.

Read more in the project documents:

- [Data Inventory](docs/DATA_INVENTORY.md)
- [Official Source Register](docs/OFFICIAL_SOURCE_REGISTER.md)
- [District Investigation](docs/DISTRICT_INVESTIGATION.md)
- [Evidence Verification](docs/EVIDENCE_VERIFICATION.md)
- [Investigation Testing](docs/INVESTIGATION_TESTING.md)
- [AI Usage Report](docs/AI_USAGE.md)
- [Development Status](docs/implementation/STATUS.md)

## Project Status

Ireme Insight is under active development. The repository includes working screens, data tools, tests, and some connected backend features. Other workflows are still being improved or tested.

**Demo mode is fully operational** — all 10 role buttons appear on the login page without Supabase login, clicking a button navigates to the appropriate dashboard, and AI Engine pages load without blank screens. The governed API at `https://ireme-governed-api.fly.dev/` accepts unauthenticated requests in `HACKATHON_DEMO` mode and returns `200 OK` for `/v1/indicators`, `/v1/investigations`, `/v1/permissions`, and `/v1/admin/bypass/status`.

The live demo site is at `https://poverty-analysis-reducti.vercel.app/login`.

The AI Engine UI calls the governed API, but production hosting and worker lifecycle are not complete. The USSD simulator is not the same as a live mobile network service. Real bank, mobile money, and loan integrations must not be assumed from the demo.

### Deployment

The live site is deployed to Vercel under the **iremesofthub** team at `https://poverty-analysis-reducti.vercel.app`. The governed Ireme API runs on Fly.io at `https://ireme-governed-api.fly.dev/`.

The public Statistics Dashboard is available at `https://poverty-analysis-reducti.vercel.app/`. It presents published aggregate statistics bundled with the frontend; it does not currently fetch those dashboard figures from Supabase at runtime. Some programme records and payment examples are demonstration data. The AI Engine UI calls the governed API, but production hosting and worker lifecycle are not complete. The USSD simulator is not the same as a live mobile network service. Real bank, mobile money, and loan integrations must not be assumed from the demo.

After a push to `main`, check the Vercel deployment status in the Actions tab and wait for it to finish successfully before sharing the deployed URL. The governed API is already deployed to Fly.io and accepts demo-mode requests without authentication.

## Financial Sustainability

We aim to keep the platform affordable by using open-source tools, NISR data that can legally be used, and suitable cloud services.

The main costs include development, hosting, data processing, security, maintenance, and user support. Possible long-term support could come from partnerships, custom data services, and organizations that use the platform.

A final budget, pricing model, and financial forecast will depend on real costs and confirmed partnerships. We do not claim profits or a break-even date without this information.

## Our Team

**Ireme Soft Hub**

- **UWIMANA Gabriel:** Team Leader
- **UWINEZA Alice:** Team Partner

**Project:** NISR Big Data Hackathon 2026, Track 2: Financial Inclusion and Poverty Reduction.

## Our Goal

We want data to lead to real help. That means knowing which families need support, creating work for people with useful skills, helping families start practical activities, and giving programme teams a clear way to follow results.

**Ireme Insight: Understand the problem. Take action. Check the progress.**

## Historical versions

- **October 31, 2026** — tag [`historical-2026-10-31`](https://github.com/iremesofthub/Poverty-Analysis-Reduction/tree/historical-2026-10-31): the project as committed at the end of October 31, 2026 (Africa/Kigali time, UTC+02:00). Last commit that day: `622e0641b1bdf8841014851a96ada76fe5ab3f24`, committed 2026-10-31 23:59:10 UTC+02:00. Commit timestamps record when commits were made locally, not when code was uploaded to a hosting service.
