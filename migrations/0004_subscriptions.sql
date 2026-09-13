-- Recurring gigs: command desk (month) and compliance (year).
alter table filing_payments
  add column if not exists stripe_subscription_id text not null default '';
create index if not exists filing_payments_sub_idx
  on filing_payments (stripe_subscription_id);
