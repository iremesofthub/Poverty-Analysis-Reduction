const STATUS_LABELS = {
  Scheduled: "Pending",
  Done: "Done",
  Missed: "Missed",
  Cancelled: "Cancelled",
};

export function mapAgentVisit(row) {
  const scheduledAt = new Date(row.scheduled_at);
  return {
    id: row.id,
    memberId: row.member_id,
    name: row.members?.full_name ?? "Program member",
    cell: row.members?.cell ?? "—",
    district: row.members?.district ?? "—",
    type: row.purpose,
    time: Number.isNaN(scheduledAt.getTime())
      ? "—"
      : new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(scheduledAt),
    scheduledAt: row.scheduled_at,
    status: STATUS_LABELS[row.status] ?? row.status,
    checklist: Array.isArray(row.checklist) ? row.checklist : [],
  };
}
