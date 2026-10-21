-- Wallet + transaction ledger.
-- The balance is always derived from completed transactions, so clients can
-- only ever *request* a deposit/withdrawal (status 'pending'). Only a trusted
-- role (service key / dashboard / future admin API) can set a row to
-- 'completed', which is what actually moves the money.

create table if not exists public.wallets (
  id uuid primary key references auth.users (id) on delete cascade,
  balance numeric(14, 2) not null default 0 check (balance >= 0),
  currency text not null default 'INR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('deposit', 'withdraw', 'bonus', 'adjustment')),
  amount numeric(14, 2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'completed', 'rejected')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wallet_transactions_user_created_idx
  on public.wallet_transactions (user_id, created_at desc);

alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;

drop policy if exists "Users can read their own wallet" on public.wallets;
create policy "Users can read their own wallet"
  on public.wallets for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users can read their own wallet transactions" on public.wallet_transactions;
create policy "Users can read their own wallet transactions"
  on public.wallet_transactions for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- A user may only create their own pending deposit/withdrawal requests; the
-- balance can never be credited from the client.
drop policy if exists "Users can request their own deposits and withdrawals" on public.wallet_transactions;
create policy "Users can request their own deposits and withdrawals"
  on public.wallet_transactions for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and kind in ('deposit', 'withdraw')
    and status = 'pending'
  );

-- Keep wallets.balance in sync with the ledger. Recomputing the whole total is
-- idempotent, so inserts/updates/deletes can never double count.
create or replace function public.sync_wallet_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  total numeric(14, 2);
begin
  target := coalesce(new.user_id, old.user_id);

  select coalesce(sum(
    case
      when status = 'completed' then
        case when kind = 'withdraw' then -amount else amount end
      else 0
    end
  ), 0)
  into total
  from public.wallet_transactions
  where user_id = target;

  insert into public.wallets (id, balance, updated_at)
  values (target, greatest(total, 0), now())
  on conflict (id) do update
    set balance = greatest(excluded.balance, 0),
        updated_at = now();

  return null;
end;
$$;

drop trigger if exists sync_wallet_balance_on_transaction on public.wallet_transactions;
create trigger sync_wallet_balance_on_transaction
  after insert or update or delete on public.wallet_transactions
  for each row execute procedure public.sync_wallet_balance();

create or replace function public.update_wallet_transaction_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_wallet_transaction_updated_at on public.wallet_transactions;
create trigger set_wallet_transaction_updated_at
  before update on public.wallet_transactions
  for each row execute procedure public.update_wallet_transaction_updated_at();

-- Every user gets a wallet row as soon as the auth user is created.
create or replace function public.create_wallet_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.wallets (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_wallet on auth.users;
create trigger on_auth_user_created_wallet
  after insert on auth.users
  for each row execute procedure public.create_wallet_for_new_user();

-- Backfill wallets for accounts created before this migration.
insert into public.wallets (id)
select id from auth.users
on conflict (id) do nothing;
