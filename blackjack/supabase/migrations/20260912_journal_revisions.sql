-- Apply before releasing the account-isolated client. Additive and rerunnable.
begin;

alter table journal_bankrolls add column if not exists updated_at timestamptz;
update journal_bankrolls set updated_at = created_at where updated_at is null;
alter table journal_bankrolls alter column updated_at set default now();
alter table journal_bankrolls alter column updated_at set not null;
alter table journal_bankrolls add column if not exists deleted_at timestamptz;
alter table journal_sessions add column if not exists updated_at timestamptz;
update journal_sessions set updated_at = created_at where updated_at is null;
alter table journal_sessions alter column updated_at set default now();
alter table journal_sessions alter column updated_at set not null;
alter table journal_sessions add column if not exists deleted_at timestamptz;
alter table journal_transactions add column if not exists updated_at timestamptz;
update journal_transactions set updated_at = created_at where updated_at is null;
alter table journal_transactions alter column updated_at set default now();
alter table journal_transactions alter column updated_at set not null;
alter table journal_transactions add column if not exists deleted_at timestamptz;


-- Preserve a newer journal revision when delayed/offline clients reconnect.
create or replace function journal_reject_stale_revision() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.updated_at < old.updated_at or (old.deleted_at is not null and new.deleted_at is null and new.updated_at <= old.updated_at) then
    raise exception 'A newer journal revision exists. Refresh before retrying.' using errcode = '40001';
  end if;
  return new;
end;
$$;
drop trigger if exists journal_bankroll_revision on journal_bankrolls;
create trigger journal_bankroll_revision before update on journal_bankrolls for each row execute function journal_reject_stale_revision();
drop trigger if exists journal_session_revision on journal_sessions;
create trigger journal_session_revision before update on journal_sessions for each row execute function journal_reject_stale_revision();
drop trigger if exists journal_transaction_revision on journal_transactions;
create trigger journal_transaction_revision before update on journal_transactions for each row execute function journal_reject_stale_revision();

commit;
