// Single source of truth for an account's balance. Used by Budget → Accounts and by the Insights
// net-worth chart, so the two can never drift apart.
//
//   balance = opening balance
//           + income − spending                 (expenses whose paymentMethod is the account's name)
//           + transfers in − transfers out
//           − pot contributions + pot withdrawals (pot transactions linked to the account)
//           + adjustments                        (dated corrections from "Set today's balances")
//
// upToDate ("YYYY-MM-DD", optional): only items dated on or before it count. Omit it for all time.
// An adjustment is { id, date, amount, createdAt } stored in account.adjustments.
export function computeAccountBalance(account, data = {}, upToDate = null) {
  const { expenses = [], transfers = [], potTxns = [] } = data;
  const counts = (d) => upToDate == null || !(d > upToDate);

  let bal = account.openingBalance || 0;

  for (const e of expenses) {
    if (e.paymentMethod !== account.name || !counts(e.date)) continue;
    bal += e.isIncome ? e.amount : -e.amount;
  }
  for (const t of transfers) {
    if (!counts(t.date)) continue;
    if (t.toAccountId   === account.id) bal += t.amount;
    if (t.fromAccountId === account.id) bal -= t.amount;
  }
  for (const p of potTxns) {
    if (p.linkedAccountId !== account.id || !counts(p.date)) continue;
    bal += p.type === 'contribute' ? -p.amount : p.amount;
  }
  for (const a of (account.adjustments || [])) {
    if (counts(a.date)) bal += a.amount;
  }
  return bal;
}
