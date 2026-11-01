import test from "node:test";
import assert from "node:assert/strict";
import { mapAgentVisit } from "./fieldVisitModel.mjs";

test("maps a hosted visit row without changing its database status or member scope", () => {
  const visit = mapAgentVisit({
    id: "visit-1",
    member_id: "member-1",
    scheduled_at: "2026-10-31T08:15:00.000Z",
    purpose: "Home visit",
    status: "Scheduled",
    checklist: ["Member reached"],
    members: { full_name: "Aline Example", cell: "Cell A", district: "District B" },
  });

  assert.equal(visit.id, "visit-1");
  assert.equal(visit.memberId, "member-1");
  assert.equal(visit.name, "Aline Example");
  assert.equal(visit.type, "Home visit");
  assert.equal(visit.status, "Pending");
  assert.deepEqual(visit.checklist, ["Member reached"]);
  assert.match(visit.time, /^\d{2}:\d{2}$/);
});

test("keeps an unmapped database status visible instead of implying completion", () => {
  assert.equal(mapAgentVisit({ scheduled_at: "invalid", status: "Needs review" }).status, "Needs review");
  assert.equal(mapAgentVisit({ scheduled_at: "invalid", status: "Scheduled" }).time, "—");
});
