-- Who paid, for which add-on, tied to a filing. This is the client desk.
create table if not exists filing_payments (
  id serial primary key,
  filing_id integer not null references filings (id) on delete cascade,
  addon_key text not null,
  stripe_session_id text not null unique,
  stripe_customer_id text not null default '',
  email text not null default '',
  amount_cents integer not null default 0,
  currency text not null default 'usd',
  status text not null default 'paid',
  created_at timestamptz not null default now()
);
create index if not exists filing_payments_filing_id_idx on filing_payments (filing_id);

alter table filings add column if not exists service_status text not null default 'open';
alter table filings add column if not exists service_notes text not null default '';
