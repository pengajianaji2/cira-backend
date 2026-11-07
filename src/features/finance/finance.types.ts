export type PaymentStatus = "pending" | "verified";

export type TermTriggerType = "date" | "sprint" | "manual";
export type TermStatus = "planned" | "ready" | "invoiced" | "paid";

export interface TermInputDto {
  title: string;
  percentage: number;
  triggerType: TermTriggerType;
  triggerSprintId?: string | null;
  dueDate?: string | null;
  notes?: string | null;
}

export interface CreateContractDto {
  contractValue: number;
  terms: TermInputDto[];
}

export interface UploadBastDto {
  bastUrl: string;
  bastFileName?: string;
}

export interface IssueInvoiceDto {
  notes?: string;
  invoicePdfUrl?: string;
}

export interface PaymentTermDetail {
  id: string;
  projectId: string;
  termNumber: number;
  title: string;
  percentage: number;
  amount: number;
  triggerType: TermTriggerType;
  triggerSprintId?: string | null;
  dueDate?: string | null;
  status: TermStatus;
  bastUrl?: string | null;
  bastFileName?: string | null;
  bastUploadedAt?: Date | null;
  invoiceNumber?: string | null;
  invoiceIssuedAt?: Date | null;
  invoicePdfUrl?: string | null;
  isLocked: boolean;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaymentDto {
  title: string;
  amount: number;
  dueDate?: string;
  notes?: string;
  proofUrl?: string;
  proofFileName?: string;
}

export interface UpdatePaymentDto {
  title?: string;
  amount?: number;
  dueDate?: string;
  notes?: string;
  proofUrl?: string;
  proofFileName?: string;
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
