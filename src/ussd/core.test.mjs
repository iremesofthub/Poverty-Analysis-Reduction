import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createUssd, makeTranslate, MAX_TEXT, SESSION_TIMEOUT_MS } from "./core.js";
import { AfricasTalkingGateway, SimulatorGateway, normalizePhone } from "./gateway.js";
import { formatDate, formatDateTime, formatMoney } from "../lib/format.js";

const load = (name) => JSON.parse(readFileSync(new URL(`../i18n/${name}.json`, import.meta.url), "utf8"));
const resources = { en: load("en"), rw: load("rw") };
const translate = makeTranslate(resources);
const fmt = { money: formatMoney, date: formatDate, dateTime: formatDateTime };
const PHONE = "+250788000001";

function setup({ blocked = [], members = { [PHONE]: { id: "m1", name: "Beatrice", language: "en" } }, clock = { t: new Date("2026-10-29T08:00:00Z") } } = {}) {
  const sessions = new Map();
  const events = [];
  const languages = [];
  const store = {
    isBlocked: async (phone) => blocked.includes(phone),
    recentRequests: async (phone) => events.filter((event) => event.phone === phone).length,
    findMember: async (phone) => members[phone] || null,
    getSession: async (ref) => sessions.get(ref) || null,
    saveSession: async (session) => { const saved = { id: session.id || `s${sessions.size + 1}`, ...session }; sessions.set(session.ref, saved); return saved; },
    logEvent: async (event) => { events.push(event); },
    insurance: async () => ({ due: 12000, paid: 4000, periodEnd: "2027-06-30" }),
    nextVisit: async () => ({ scheduledAt: "2026-11-01T07:00:00Z", purpose: "Welcome and household check" }),
    agent: async () => ({ name: "Nshuti Patrick", phone: "+250788310445" }),
    voting: async () => ({ title: "Leadership election 2026", venue: "Kibingo sector office hall", startsAt: "2026-10-28T00:00:00Z", endsAt: "2026-11-04T00:00:00Z", voted: false }),
    setLanguage: async (id, language) => { languages.push([id, language]); },
  };
  return { ussd: createUssd({ store, translate, fmt, now: () => clock.t }), sessions, events, languages, clock };
}
const dial = (ussd, input = "", ref = "r1", phone = PHONE) => ussd.handle({ sessionRef: ref, phone, input, source: "simulator" });

test("dialling shows the main menu in the member's language", async () => {
  const { ussd } = setup();
  const reply = await dial(ussd);
  assert.equal(reply.end, false);
  assert.match(reply.text, /Ireme: Beatrice/);
  assert.match(reply.text, /1 Insurance/);
});

test("insurance, visit, agent and voting screens show this member's data, then go back", async () => {
  const { ussd } = setup();
  await dial(ussd);
  let reply = await dial(ussd, "1");
  assert.match(reply.text, /Partly paid/);
  assert.match(reply.text, /RWF 8,000/);
  assert.match(reply.text, /0 Back/);
  assert.match((await dial(ussd, "0")).text, /1 Insurance/);
  assert.match((await dial(ussd, "2")).text, /Welcome and household check/);
  await dial(ussd, "0");
  assert.match((await dial(ussd, "3")).text, /Nshuti Patrick/);
  await dial(ussd, "0");
  reply = await dial(ussd, "4");
  assert.match(reply.text, /Status: Open/);
  assert.match(reply.text, /not voted/);
});

test("every screen fits the USSD length limit", async () => {
  const { ussd } = setup();
  await dial(ussd);
  for (const key of ["1", "0", "2", "0", "3", "0", "4", "0", "5"]) assert.ok((await dial(ussd, key)).text.length <= MAX_TEXT);
});

test("a wrong choice keeps the menu; 0 exits and ends the session", async () => {
  const { ussd, sessions } = setup();
  await dial(ussd);
  assert.match((await dial(ussd, "9")).text, /Wrong choice/);
  const bye = await dial(ussd, "0");
  assert.equal(bye.end, true);
  assert.equal(sessions.get("r1").status, "ended");
  assert.equal((await dial(ussd, "1")).end, true);
});

test("changing language is saved and applies at once", async () => {
  const { ussd, languages } = setup();
  await dial(ussd);
  await dial(ussd, "5");
  const reply = await dial(ussd, "2");
  assert.deepEqual(languages, [["m1", "rw"]]);
  assert.match(reply.text, /Ururimi rwabitswe|Language saved/);
});

test("a session that sits idle for too long times out", async () => {
  const { ussd, sessions, clock } = setup();
  await dial(ussd);
  clock.t = new Date(clock.t.getTime() + SESSION_TIMEOUT_MS + 1000);
  const reply = await dial(ussd, "1");
  assert.equal(reply.end, true);
  assert.match(reply.text, /dial again/i);
  assert.equal(sessions.get("r1").status, "timed_out");
});

test("unregistered and blocked numbers get nothing", async () => {
  const { ussd } = setup({ blocked: ["+250788999999"], members: { [PHONE]: { id: "m1", name: "B", language: "en" }, "+250788999999": { id: "m2", name: "C", language: "en" } } });
  assert.match((await dial(ussd, "", "x", "+250788111111")).text, /not registered/);
  assert.match((await dial(ussd, "", "y", "+250788999999")).text, /not available/);
});

test("a failing database never throws: it is logged and the caller sees a polite END", async () => {
  const events = [];
  const broken = createUssd({ store: { isBlocked: async () => false, recentRequests: async () => 0, findMember: async () => { throw new Error("db down"); }, logEvent: async (event) => events.push(event) }, translate, fmt });
  const reply = await broken.handle({ sessionRef: "z", phone: PHONE, input: "1" });
  assert.equal(reply.end, true);
  assert.match(reply.text, /something went wrong/);
  assert.ok(events.some((event) => event.isError));
});

test("too many requests in a minute are refused", async () => {
  const { ussd, events } = setup();
  for (let i = 0; i < 30; i += 1) events.push({ phone: PHONE });
  assert.match((await dial(ussd)).text, /Too many/);
});

test("gateway adapters speak their own formats and share the same core", () => {
  assert.deepEqual(AfricasTalkingGateway.parse({ sessionId: "S1", phoneNumber: "+250788000001", text: "1*0*2" }), { sessionRef: "S1", phone: PHONE, input: "2", source: "gateway" });
  assert.equal(AfricasTalkingGateway.parse({ sessionId: "S1", phoneNumber: "0788000001", text: "" }).input, "");
  assert.equal(AfricasTalkingGateway.format({ text: "Hi", end: false }).text, "CON Hi");
  assert.equal(AfricasTalkingGateway.format({ text: "Bye", end: true }).text, "END Bye");
  assert.deepEqual(SimulatorGateway.format({ text: "Hi", end: true }), { json: { text: "Hi", end: true } });
  assert.equal(normalizePhone("250788000001"), PHONE);
});
