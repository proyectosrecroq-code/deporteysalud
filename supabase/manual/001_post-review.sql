-- Deporte y Salud · manual hardening script
-- Run it ONCE from the Lovable Cloud SQL editor (Cloud → Database → SQL). It is idempotent.
-- The app never needs it to start, but it brings the database in line with the code.

-- 1) Columns the app already uses (src/integrations/supabase/types.ts) that are missing from drizzle/migrations.
alter table public.members
  add column if not exists recovery_sessions int not null default 0,
  add column if not exists recovery_notes text not null default '';

-- 2) Defence in depth: the browser must never reach these tables, only the server (service_role).
--    RLS is already on with no policies; this also removes the table grants from the public roles.
do $$ declare t text; begin
  foreach t in array array['members','payments','exercises','workouts','conditions','member_requests','settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- 3) Demo data created by the first migration (14 fake members with PIN 1234 and a 3-month payment history).
--    REVIEW BEFORE RUNNING: it deletes members (and, by cascade, their payments, workouts and requests)
--    whose phone is 6001110xx AND whose PIN is still 1234. Real members are not matched.
-- begin;
--   delete from public.members where phone like '6001110%' and pin = '1234';
-- commit;

-- 4) Optional: legacy plaintext owner password. The app migrates it to a salted hash on the next login
--    and removes it by itself; nothing to do here. To check that it is gone afterwards:
--    select (data ? 'owner_password') as plaintext_left, (data ? 'owner_password_hash') as hashed from public.settings where id = 1;
