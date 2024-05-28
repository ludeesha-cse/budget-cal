// Union type, not enum — no extra runtime JS, and matches plain strings from JSON/DB as-is.
export type TransactionType = 'Food' | 'Transport' | 'Bills' | 'Entertainment' | 'Other'

export type PaymentMethod = 'Cash' | 'Card' | 'Bank Transfer'

// interface, not type alias — reads as an entity contract and supports declaration merging.
// id: string, not number — matches Prisma's `cuid()`-generated Transaction.id now that
// this shape describes real API/DB records instead of mock data with sequential ids.
export interface Transaction {
  id: string
  date: string
  amount: number
  type: TransactionType
  description: string
  paymentMethod: PaymentMethod
}
