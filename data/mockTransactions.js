// Mock transaction data used until the Phase 2 API is available.
// Shape: { id, date (YYYY-MM-DD), amount, type, description, paymentMethod }

export const monthlyBudget = 50000

export const mockTransactions = [
  { id: 1, date: '2026-07-02', amount: 2500, type: 'Food', description: 'Groceries - weekly shop', paymentMethod: 'Card' },
  { id: 2, date: '2026-07-03', amount: 1200, type: 'Transport', description: 'Fuel top-up', paymentMethod: 'Card' },
  { id: 3, date: '2026-07-04', amount: 15000, type: 'Bills', description: 'Rent contribution', paymentMethod: 'Bank Transfer' },
  { id: 4, date: '2026-07-05', amount: 3400, type: 'Entertainment', description: 'Cinema with friends', paymentMethod: 'Cash' },
  { id: 5, date: '2026-07-07', amount: 800, type: 'Food', description: 'Coffee and lunch', paymentMethod: 'Cash' },
  { id: 6, date: '2026-07-08', amount: 4500, type: 'Bills', description: 'Electricity bill', paymentMethod: 'Bank Transfer' },
  { id: 7, date: '2026-07-10', amount: 2000, type: 'Other', description: 'Textbooks', paymentMethod: 'Card' },
  { id: 8, date: '2026-07-11', amount: 1500, type: 'Transport', description: 'Bus pass top-up', paymentMethod: 'Cash' },
  { id: 9, date: '2026-07-12', amount: 3200, type: 'Food', description: 'Takeaway dinner', paymentMethod: 'Card' },
  { id: 10, date: '2026-07-14', amount: 6000, type: 'Entertainment', description: 'Concert ticket', paymentMethod: 'Card' },
  { id: 11, date: '2026-07-15', amount: 1000, type: 'Other', description: 'Phone accessories', paymentMethod: 'Cash' },
  { id: 12, date: '2026-07-16', amount: 2800, type: 'Food', description: 'Groceries top-up', paymentMethod: 'Card' },
  { id: 13, date: '2026-06-03', amount: 2600, type: 'Food', description: 'Groceries - weekly shop', paymentMethod: 'Card' },
  { id: 14, date: '2026-06-05', amount: 1100, type: 'Transport', description: 'Fuel top-up', paymentMethod: 'Card' },
  { id: 15, date: '2026-06-06', amount: 15000, type: 'Bills', description: 'Rent contribution', paymentMethod: 'Bank Transfer' },
  { id: 16, date: '2026-06-09', amount: 2900, type: 'Entertainment', description: 'Streaming subscriptions', paymentMethod: 'Card' },
  { id: 17, date: '2026-06-12', amount: 4200, type: 'Bills', description: 'Water and internet', paymentMethod: 'Bank Transfer' },
  { id: 18, date: '2026-06-18', amount: 1800, type: 'Other', description: 'Stationery', paymentMethod: 'Cash' },
  { id: 19, date: '2026-06-22', amount: 3300, type: 'Food', description: 'Dinner out', paymentMethod: 'Card' },
  { id: 20, date: '2026-06-27', amount: 900, type: 'Transport', description: 'Taxi ride', paymentMethod: 'Cash' },
]
