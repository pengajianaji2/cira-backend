export type PaymentStatus = "pending" | "verified";

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
}
