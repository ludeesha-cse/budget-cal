export type TransactionType = 'Food' | 'Transport' | 'Bills' | 'Entertainment' | 'Other'

export type PaymentMethod = 'Cash' | 'Card' | 'Bank Transfer'

export interface Transaction {
  id: number
  date: string
  amount: number
  type: TransactionType
  description: string
  paymentMethod: PaymentMethod
}
