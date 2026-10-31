import { useCallback, useEffect, useState } from "react";
import { BENEFICIARIES, COOPERATIVES } from "@/data/programme";
import { DEMO_PASSWORD } from "@/lib/roles";

// How someone joins a cooperative (two steps, so nobody is added without the cooperative's say):
//   1. The beneficiary asks the cooperative directly. Government leaders can see cooperatives but do not manage them.
//   2. The request appears in the cooperative's own panel, where the cooperative accepts or declines.
// Only the cooperative itself, or the platform admin, can let a member in or take one out.
// Stored in this browser (sample data). Replace readState and writeState with a server table later.
const KEY = "ireme_cooperatives_v2";
const EVENT = "ireme-cooperatives";

export const HEALTH = ["Going well", "Struggling", "Inactive"];
export const JOIN_STATUS = ["Open", "Full", "Closed"];
export const OPEN_STATES = ["Pending", "Endorsed"];

const SEED_HEALTH = {
  "CO-004": ["Struggling", "Part of the harvest was lost to flooding; revenue is down about 30%."],
  "CO-007": ["Struggling", "Rent for the salon premises has gone up and two members left."],
  "CO-008": ["Inactive", "No meeting or sales recorded for the last two months."],
};

function unit(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return ((hash >>> 0) % 10000) / 10000;
}

const nowIso = () => new Date().toISOString();
const hoursAgo = (hours) => new Date(Date.now() - hours * 3600000).toISOString();
const daysAgo = (days) => hoursAgo(days * 24);
export const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function seed() {
  const coops = COOPERATIVES.map((item) => {
    const [sector, district] = item.sector.split(",").map((part) => part.trim());
    const [health, healthNote] = SEED_HEALTH[item.id] || ["Going well", ""];
    return { id: item.id, name: item.name, district, sector, activity: item.activity, purpose: item.description, leader: item.leader, verified: item.verified, founded: item.founded, monthlyRevenue: item.monthlyRevenue, members: item.members, joinStatus: item.joinStatus, health, healthNote, log: [{ at: daysAgo(30), by: "System", text: "Cooperative registered." }] };
  });
  // A beneficiary can only belong to a cooperative in their own district, so the sample records are placed that way.
  const members = [];
  for (const person of BENEFICIARIES) {
    if (!person.cooperative) continue;
    const local = coops.filter((coop) => coop.district === person.district);
    if (!local.length) continue;
    const named = local.find((coop) => coop.name === person.cooperative);
    const sameSector = local.filter((coop) => coop.sector === person.sector);
    const pool = sameSector.length ? sameSector : local;
    const coop = named || pool[Math.floor(unit(person.id) * pool.length)];
    members.push({ beneficiaryId: person.id, coopId: coop.id, since: daysAgo(60 + Math.floor(unit(`${person.id}:since`) * 400)), by: "Cooperative" });
  }
  const requests = [{ id: "JR-0001", beneficiaryId: "BN-001", coopId: "CO-001", beneficiaryName: "Mukasine Beatrice", status: "Approved", createdAt: daysAgo(120), endorsedBy: "Habimana Jean", endorsedAt: daysAgo(119), decidedBy: "Twiyubake Cooperative", decidedAt: daysAgo(118), note: "" }];
  // Two sample requests so each step of the flow has something to show.
  const free = BENEFICIARIES.filter((person) => person.district === "Nyaruguru" && !members.some((link) => link.beneficiaryId === person.id));
  if (free[0]) requests.unshift({ id: "JR-0003", beneficiaryId: free[0].id, coopId: "CO-001", beneficiaryName: free[0].name, status: "Endorsed", createdAt: hoursAgo(30), endorsedBy: "Habimana Jean", endorsedAt: hoursAgo(20), decidedBy: null, decidedAt: null, note: "" });
  if (free[1]) requests.unshift({ id: "JR-0002", beneficiaryId: free[1].id, coopId: "CO-004", beneficiaryName: free[1].name, status: "Pending", createdAt: hoursAgo(5), endorsedBy: null, endorsedAt: null, decidedBy: null, decidedAt: null, note: "" });
  return { coops, members, requests };
}

function readState() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall back to the sample data */ }
  const fresh = seed();
  try { window.localStorage.setItem(KEY, JSON.stringify(fresh)); } catch { /* keep the in-memory copy */ }
  return fresh;
}

function writeState(state) {
  try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(EVENT));
}

const person = (id) => BENEFICIARIES.find((item) => item.id === id);
const log = (coop, by, text) => ({ ...coop, log: [{ at: nowIso(), by: by?.name || "System", text }, ...(coop.log || [])].slice(0, 30) });

// ---- who may do what ----
// Government leaders (district, sector, cell) can only look at cooperatives in their area. Only the platform admin manages them.
export function canManageCoop(by) {
  return by?.role === "platform_admin";
}
// Only the cooperative itself, or the platform admin, accepts and removes members.
export const canDecideAsCoop = (by, coop) => Boolean(by) && (by.role === "platform_admin" || (by.role === "cooperative" && by.cooperativeId === coop.id));
// Details such as health, notes and whether new members are welcome can be kept up to date by either side.
export const canEditCoop = (by, coop) => canManageCoop(by, coop) || canDecideAsCoop(by, coop);

export function coopOfPerson(state, beneficiaryId) {
  const link = state.members.find((item) => item.beneficiaryId === beneficiaryId);
  return link ? state.coops.find((coop) => coop.id === link.coopId) || null : null;
}

const findRequest = (state, id) => state.requests.find((item) => item.id === id);
const findCoop = (state, id) => state.coops.find((item) => item.id === id);

export function requestJoin(beneficiaryId, coopId) {
  const state = readState();
  const coop = findCoop(state, coopId);
  const me = person(beneficiaryId);
  if (!coop || !me) throw new Error("That cooperative or program member was not found.");
  if (coop.district !== me.district) throw new Error("You can only join a cooperative in your own district.");
  if (coop.joinStatus !== "Open") throw new Error(`${coop.name} is ${coop.joinStatus.toLowerCase()} and is not accepting new members.`);
  const current = coopOfPerson(state, beneficiaryId);
  if (current) throw new Error(`You already belong to ${current.name}.`);
  if (state.requests.some((item) => item.beneficiaryId === beneficiaryId && OPEN_STATES.includes(item.status))) throw new Error("You already have a request waiting for a decision.");
  const number = state.requests.reduce((max, item) => Math.max(max, Number(item.id.replace(/\D/g, "")) || 0), 0) + 1;
  const request = { id: `JR-${String(number).padStart(4, "0")}`, beneficiaryId, beneficiaryName: me.name, coopId, status: "Pending", createdAt: nowIso(), endorsedBy: null, endorsedAt: null, decidedBy: null, decidedAt: null, note: "" };
  writeState({ ...state, requests: [request, ...state.requests] });
  return request;
}

export function withdrawJoin(requestId) {
  const state = readState();
  writeState({ ...state, requests: state.requests.map((item) => (item.id === requestId && OPEN_STATES.includes(item.status) ? { ...item, status: "Withdrawn", decidedAt: nowIso() } : item)) });
}

// Step 1, government panel: accept the request (it then goes to the cooperative) or decline it with a reason.
export function reviewJoin(requestId, { approve, by, note = "" }) {
  const state = readState();
  const request = findRequest(state, requestId);
  if (!request || request.status !== "Pending") throw new Error("This request is not waiting for government review.");
  const coop = findCoop(state, request.coopId);
  if (!canManageCoop(by, coop)) throw new Error("Only the platform admin can review join requests.");
  if (!approve && !note.trim()) throw new Error("Give a short reason so the program member understands.");
  const next = approve ? { ...request, status: "Endorsed", endorsedBy: by.name, endorsedAt: nowIso() } : { ...request, status: "Declined", decidedBy: by.name, decidedAt: nowIso(), note: note.trim().slice(0, 300), declinedBy: "government" };
  const coops = approve ? state.coops.map((item) => (item.id === coop.id ? log(item, by, `${request.beneficiaryName}'s request was accepted by ${by.name} and sent to the cooperative.`) : item)) : state.coops;
  writeState({ ...state, coops, requests: state.requests.map((item) => (item.id === requestId ? next : item)) });
  return next;
}

// Step 2, the cooperative's own panel: the final say. The admin may also decide, at any step.
export function decideJoin(requestId, { accept, by, note = "" }) {
  const state = readState();
  const request = findRequest(state, requestId);
  if (!request || !OPEN_STATES.includes(request.status)) throw new Error("This request has already been decided.");
  const coop = findCoop(state, request.coopId);
  if (!canDecideAsCoop(by, coop)) throw new Error("Only the cooperative itself, or the platform admin, can accept or decline members.");
  if (!accept && !note.trim()) throw new Error("Give a short reason so the program member understands.");
  if (accept && coop.joinStatus !== "Open") throw new Error(`${coop.name} is ${coop.joinStatus.toLowerCase()}. Open it to new members first, or decline the request.`);
  if (accept && coopOfPerson(state, request.beneficiaryId)) throw new Error("This person already belongs to a cooperative.");
  const decided = { ...request, status: accept ? "Approved" : "Declined", decidedBy: by.role === "cooperative" ? coop.name : by.name, decidedAt: nowIso(), note: note.trim().slice(0, 300), declinedBy: accept ? undefined : "cooperative" };
  const requests = state.requests.map((item) => (item.id === requestId ? decided : item));
  if (!accept) {
    writeState({ ...state, requests, coops: state.coops.map((item) => (item.id === coop.id ? log(item, by, `Declined ${request.beneficiaryName}'s request.`) : item)) });
    return decided;
  }
  const coops = state.coops.map((item) => (item.id === coop.id ? log({ ...item, members: item.members + 1 }, by, `${request.beneficiaryName} joined (accepted by the cooperative).`) : item));
  writeState({ ...state, requests, coops, members: [...state.members, { beneficiaryId: request.beneficiaryId, coopId: coop.id, since: nowIso(), by: coop.name }] });
  return decided;
}

export function addMember(coopId, beneficiaryId, by) {
  const state = readState();
  const coop = findCoop(state, coopId);
  const me = person(beneficiaryId);
  if (!coop || !me) throw new Error("That cooperative or program member was not found.");
  if (!canDecideAsCoop(by, coop)) throw new Error("Only the cooperative itself, or the platform admin, can add members.");
  if (me.district !== coop.district) throw new Error("A member must live in the cooperative's district.");
  if (coopOfPerson(state, beneficiaryId)) throw new Error(`${me.name} already belongs to a cooperative.`);
  const coops = state.coops.map((item) => (item.id === coopId ? log({ ...item, members: item.members + 1 }, by, `${me.name} was added as a member.`) : item));
  writeState({ ...state, coops, members: [...state.members, { beneficiaryId, coopId, since: nowIso(), by: by.name }], requests: state.requests.map((item) => (item.beneficiaryId === beneficiaryId && OPEN_STATES.includes(item.status) ? { ...item, status: "Withdrawn", decidedAt: nowIso(), note: "Added directly by the cooperative." } : item)) });
}

export function removeMember(coopId, beneficiaryId, by) {
  const state = readState();
  const coop = findCoop(state, coopId);
  const me = person(beneficiaryId);
  if (!coop) throw new Error("That cooperative was not found.");
  if (!canDecideAsCoop(by, coop)) throw new Error("Only the cooperative itself, or the platform admin, can remove members.");
  const coops = state.coops.map((item) => (item.id === coopId ? log({ ...item, members: Math.max(0, item.members - 1) }, by, `${me?.name || "A member"} was removed.`) : item));
  writeState({ ...state, coops, members: state.members.filter((item) => !(item.coopId === coopId && item.beneficiaryId === beneficiaryId)) });
}

export function updateCoop(id, patch, by) {
  const state = readState();
  const coop = findCoop(state, id);
  if (!coop) throw new Error("That cooperative was not found.");
  if (!canEditCoop(by, coop)) throw new Error("You can only update your own cooperative, or cooperatives in your own area.");
  if (patch.health && !HEALTH.includes(patch.health)) throw new Error("Choose a valid health status.");
  if (patch.joinStatus && !JOIN_STATUS.includes(patch.joinStatus)) throw new Error("Choose a valid join status.");
  const changes = [];
  if (patch.health && patch.health !== coop.health) changes.push(`Health set to "${patch.health}"`);
  if (patch.joinStatus && patch.joinStatus !== coop.joinStatus) changes.push(`Joining set to ${patch.joinStatus.toLowerCase()}`);
  if (typeof patch.healthNote === "string" && patch.healthNote !== coop.healthNote) changes.push("Health note updated");
  if (typeof patch.purpose === "string" && patch.purpose !== coop.purpose) changes.push("Purpose updated");
  const next = { ...coop, ...(patch.health ? { health: patch.health } : {}), ...(patch.joinStatus ? { joinStatus: patch.joinStatus } : {}), ...(typeof patch.healthNote === "string" ? { healthNote: patch.healthNote.slice(0, 300) } : {}), ...(typeof patch.purpose === "string" ? { purpose: patch.purpose.slice(0, 400) } : {}) };
  writeState({ ...state, coops: state.coops.map((item) => (item.id === id ? (changes.length ? log(next, by, `${changes.join(". ")}.`) : next) : item)) });
}

export function createCoop(input, by) {
  const state = readState();
  if (!canManageCoop(by, { district: input.district, sector: input.sector })) throw new Error("You can only register cooperatives in your own district or sector.");
  if (input.name.trim().length < 3) throw new Error("Give the cooperative a name.");
  if (input.activity.trim().length < 3) throw new Error("Say what the cooperative does.");
  if (state.coops.some((item) => item.name.toLowerCase() === input.name.trim().toLowerCase() && item.district === input.district)) throw new Error("A cooperative with this name already exists in this district.");
  const number = state.coops.reduce((max, item) => Math.max(max, Number(item.id.replace(/\D/g, "")) || 0), 0) + 1;
  const coop = { id: `CO-${String(number).padStart(3, "0")}`, name: input.name.trim().slice(0, 80), district: input.district, sector: input.sector, activity: input.activity.trim().slice(0, 80), purpose: (input.purpose || "").trim().slice(0, 400), leader: (input.leader || "").trim().slice(0, 80), verified: false, founded: String(new Date().getFullYear()), monthlyRevenue: 0, members: 0, joinStatus: "Open", health: "Going well", healthNote: "", log: [{ at: nowIso(), by: by.name, text: "Cooperative registered." }] };
  writeState({ ...state, coops: [coop, ...state.coops] });
  return coop;
}

export function resetSampleCooperatives() { writeState(seed()); }

// ---- each cooperative has its own account (demo sign-ins; real accounts need a server) ----
export function cooperativeAccounts() {
  return readState().coops.map((coop) => ({ email: `${slug(coop.name)}@coops.demo`, role: "cooperative", cooperativeId: coop.id, name: coop.name, title: "Cooperative account", scope: `${coop.sector}, ${coop.district}` }));
}
export const findCooperativeAccount = (email, password) => (password === DEMO_PASSWORD ? cooperativeAccounts().find((account) => account.email === String(email || "").trim().toLowerCase()) || null : null);
export const cooperativeIdOf = (demoUser) => (demoUser?.role === "cooperative" ? demoUser.cooperativeId : null);

export function useCooperatives() {
  const [state, setState] = useState(() => readState());
  useEffect(() => {
    const refresh = () => setState(readState());
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener(EVENT, refresh); window.removeEventListener("storage", refresh); };
  }, []);
  const coopOf = useCallback((beneficiaryId) => coopOfPerson(state, beneficiaryId), [state]);
  const membersOf = useCallback((coopId) => state.members.filter((item) => item.coopId === coopId).map((item) => ({ ...item, person: person(item.beneficiaryId) })).filter((item) => item.person), [state]);
  return { ...state, coopOf, membersOf };
}

// What one programme may see: its own beneficiaries, grouped by the cooperative they belong to.
export function programmeCoops(state, beneficiaries) {
  const mine = new Map(beneficiaries.map((item) => [item.id, item]));
  const groups = new Map();
  let inCoop = 0;
  for (const link of state.members) {
    const found = mine.get(link.beneficiaryId);
    if (!found) continue;
    inCoop += 1;
    if (!groups.has(link.coopId)) groups.set(link.coopId, []);
    groups.get(link.coopId).push({ ...found, since: link.since });
  }
  const rows = [...groups.entries()].map(([coopId, members]) => ({ coop: state.coops.find((item) => item.id === coopId), members })).filter((row) => row.coop).sort((a, b) => b.members.length - a.members.length);
  return { rows, inCoop, outside: beneficiaries.length - inCoop, total: beneficiaries.length };
}

// The area a signed-in leader works in, read from the account's scope text.
// When Supabase is configured the profile row holds district/sector/cell;
// demo mode stores them on demoUser. Both are accepted.
export function leaderScope(demoUser, profile = null) {
  const role = demoUser?.role ?? profile?.role;
  const scope = String(demoUser?.scope || profile?.scope || "");
  if (role === "platform_admin") return { role, district: null, sector: null, canManage: true, all: true, label: "All districts" };
  if (role === "gov_district") {
    const district = profile?.district ?? scope.replace(/\s*district\s*$/i, "").trim();
    return { role, district, sector: null, canManage: false, all: false, label: `${district} District` };
  }
  const [first, second] = scope.split(",").map((part) => part.trim());
  if (role === "gov_sector") return { role, district: (profile?.district ?? second) || null, sector: (profile?.sector ?? first) || null, canManage: false, all: false, label: `${first} sector, ${second}` };
  if (role === "gov_cell") {
    const sector = (profile?.sector ?? second) || null;
    const district = (profile?.district ?? BENEFICIARIES.find((item) => item.sector === sector)?.district) || null;
    return { role, district, sector, cell: (profile?.cell ?? first) || null, canManage: false, all: false, label: `${first} cell, ${sector} sector` };
  }
  return { role, district: null, sector: null, canManage: false, all: false, label: "" };
}

export const districtSectors = (district) => [...new Set([...BENEFICIARIES.filter((item) => item.district === district).map((item) => item.sector)])].sort();
export const beneficiaryFor = (demoUser) => BENEFICIARIES.find((item) => item.name === demoUser?.name) || null;
