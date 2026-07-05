export type ReportStatus = "pending" | "approved" | "dismissed" | "actioned";

export const ReportStatusEnum = {
  PENDING: "pending" as ReportStatus,
  APPROVED: "approved" as ReportStatus,
  DISMISSED: "dismissed" as ReportStatus,
  ACTIONED: "actioned" as ReportStatus,
};

export const NON_PENDING_REPORT_STATUSES: ReportStatus[] = [
  ReportStatusEnum.APPROVED,
  ReportStatusEnum.DISMISSED,
  ReportStatusEnum.ACTIONED,
];
