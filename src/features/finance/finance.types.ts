export type PaymentStatus = "pending" | "verified";

export type TermTriggerType = "date" | "sprint" | "manual";
export type TermStatus = "planned" | "ready" | "invoiced" | "paid";

export interface TermInputDto {
  title: string;
  percentage: number;
  triggerType: TermTriggerType;
  triggerDate?: string | null;
  requiredCompletedSprints?: number | null;
  triggerSprintId?: string | null;
  dueDate?: string | null;
  notes?: string | null;
}

export interface UpdateTermDto {
  title?: string;
  triggerType?: TermTriggerType;
  triggerDate?: string | null;
  requiredCompletedSprints?: number | null;
  notes?: string | null;
}

export interface CreateContractDto {
  contractValue: number;
  terms: TermInputDto[];
}

export interface UploadBastDto {
  notes?: string;
}

export interface IssueInvoiceDto {
  invoiceNumber?: string;
  invoiceDueDate: string;
  notes?: string;
}

export interface PaymentTermDetail {
  id: string;
  projectId: string;
  termNumber: number;
  title: string;
  percentage: number;
  amount: number;
  triggerType: TermTriggerType;
  triggerDate?: string | null;
  requiredCompletedSprints?: number | null;
  triggerSprintId?: string | null;
  dueDate?: string | null;
  status: TermStatus;
  readyAt?: Date | null;
  bastUrl?: string | null;
  bastFileName?: string | null;
  bastUploadedAt?: Date | null;
  invoiceNumber?: string | null;
  invoiceIssuedAt?: Date | null;
  invoiceDueDate?: string | null;
  paidAt?: Date | null;
  invoicePdfUrl?: string | null;
  isLocked: boolean;
  overdue: boolean;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaymentDto {
  title: string;
  amount: number;
  dueDate?: string;
  notes?: string;
}

export interface UpdatePaymentDto {
  title?: string;
  amount?: number;
  dueDate?: string;
  notes?: string;
}

export interface VerifyPaymentDto {
  verified: boolean;
}

export interface FinanceSummary {
  contractValue: number;
  totalVerified: number;
  totalPending: number;
  remainingBalance: number;
  paidPercentage: number;
  hasVerifiedDp: boolean;
  paymentsCount: number;
  termsCount?: number;
  totalInvoiced?: number;
}
