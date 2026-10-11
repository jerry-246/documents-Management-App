// Shared (browser + server) payment constants. No server imports here.
export const PAYMENT_METHODS: Record<string, string> = {
  bank: "Bank transfer",
  mobile: "Mobile money",
  cash: "Cash",
  cheque: "Cheque",
  other: "Other",
};

export type PayStatus = "none" | "unpaid" | "partial" | "paid" | "overpaid";
export const PAY_LABEL: Record<PayStatus, string> = { none: "No charges", unpaid: "Unpaid", partial: "Partially paid", paid: "Paid", overpaid: "Overpaid" };
export const PAY_TONE: Record<PayStatus, string> = { none: "slate", unpaid: "red", partial: "amber", paid: "green", overpaid: "purple" };

export const r2 = (n: number) => Math.round(n * 100) / 100;

export function payStatus(total: number, paid: number): PayStatus {
  const t = r2(total);
  const p = r2(paid);
  if (t <= 0 && p <= 0) return "none";
  if (p <= 0) return "unpaid";
  if (p < t) return "partial";
  if (p === t) return "paid";
  return "overpaid";
}

export interface PaymentRow {
  id: number;
  recordId: number | null;
  invoiceNo: string | null;
  containerNo: string | null;
  transporter: string;
  amount: number;
  paymentDate: string;
  method: string;
  reference: string | null;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
}
