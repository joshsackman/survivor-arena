-- Survivor Arena — global leaderboard schema.
-- Safe to run more than once.

create table if not exists public.scores (
    id bigint generated always as identity primary key,
    initials text not null,
    kills integer not null default 0,
    time_survived integer not null default 0, -- whole seconds
    level integer not null default 1,
    stage text,
    created_at timestamptz not null default now(),
    constraint initials_format check (initials ~ '^[A-Z]{3}$'),
    constraint kills_sane check (kills between 0 and 100000),
    constraint time_sane check (time_survived between 0 and 86400),
    constraint level_sane check (level between 1 and 999)
);

create index if not exists scores_rank_idx
    on public.scores (time_survived desc, kills desc, created_at asc);

-- Blocked initials. A table (not a hardcoded list) so bad ones can be added
-- later without a code deploy.
create table if not exists public.banned_initials (
    initials text primary key,
    constraint banned_format check (initials ~ '^[A-Z]{3}$')
);

insert into public.banned_initials (initials) values
    ('ASS'),('ASZ'),('FUK'),('FUC'),('FCK'),('FUQ'),('PHK'),('CUM'),('KUM'),
    ('SEX'),('SXX'),('TIT'),('TTS'),('FAG'),('FGT'),('NIG'),('NGR'),('KKK'),('NAZ'),
    ('HIT'),('JEW'),('WTF'),('STF'),('PIS'),('PSS'),('SHT'),('SHI'),('DIK'),
    ('DIC'),('DCK'),('CCK'),('COK'),('KOK'),('PEN'),('VAG'),('HOE'),('SLT'),('WHR'),
    ('RAP'),('GAY'),('JIZ'),('BUT'),('POO'),('PEE'),('FAP'),('MFK'),('KYS'),('DIE'),
    ('BCH'),('BIH'),('CNT'),('KNT'),('TWT'),('PRN'),('XXX'),('STD'),('HIV'),('DMN')
on conflict do nothing;

-- Normalise to uppercase and reject anything on the blocklist, server-side,
-- so a hand-crafted request can't bypass the check in the page.
create or replace function public.reject_banned_initials()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
    new.initials := upper(btrim(new.initials));
    if exists (select 1 from public.banned_initials b where b.initials = new.initials) then
        raise exception 'those initials are not allowed';
    end if;
    return new;
end;
$fn$;

drop trigger if exists scores_block_banned on public.scores;
create trigger scores_block_banned
    before insert or update on public.scores
    for each row execute function public.reject_banned_initials();

alter table public.scores enable row level security;
alter table public.banned_initials enable row level security;

-- Anyone may read the board and add a run. No update or delete policy exists,
-- so nobody can edit or erase someone else's score.
drop policy if exists "public read scores" on public.scores;
create policy "public read scores" on public.scores
    for select to anon, authenticated using (true);

drop policy if exists "public insert scores" on public.scores;
create policy "public insert scores" on public.scores
    for insert to anon, authenticated with check (true);

drop policy if exists "public read banned" on public.banned_initials;
create policy "public read banned" on public.banned_initials
    for select to anon, authenticated using (true);

-- The trigger function must not be callable as an RPC by site visitors.
-- Triggers do not check EXECUTE privilege, so revoking here keeps the word
-- filter working while removing it from the public API surface.
revoke execute on function public.reject_banned_initials() from public;
revoke execute on function public.reject_banned_initials() from anon;
revoke execute on function public.reject_banned_initials() from authenticated;

-- RLS policies decide which rows are visible; table GRANTs decide whether the
-- role may touch the table at all. Without these, every anonymous request gets
-- 401 "permission denied for table scores". Update and delete are deliberately
-- NOT granted, so a score can be added and read but never edited or erased.
grant usage on schema public to anon, authenticated;
grant select, insert on public.scores to anon, authenticated;
grant select on public.banned_initials to anon, authenticated;
