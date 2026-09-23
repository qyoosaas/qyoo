# Sales ageing detail

## Goal
Make Sales ageing as detailed as Purchase ageing.

## Changes
- Keep the five ageing summary buckets already shown.
- Add a customer-level table beneath them with Current, 1–30, 31–60, 61–90, 90+, and Total balances.
- Include only open, non-cancelled invoices and sort customers by highest outstanding balance.
- Show a clear empty state when no receivables are open.

## Verification
- Check the Sales Ageing tab with current data.
- Confirm bucket totals reconcile to the customer table totals.
- Confirm the app builds without errors.
