-- AnytimeShift beta dashboard schema
-- Run this in Supabase SQL Editor (Project → SQL Editor → New query)

-- Beta testers (one row per email + platform + role combo)
create table if not exists beta_testers (
  id                      uuid primary key default gen_random_uuid(),
  email                   text not null,
  platform                text not null check (platform in ('android','ios')),
  role                    text not null check (role in ('employee','employer')),
  wants_feedback          boolean not null default false,
  signed_up_at            timestamptz not null default now(),
  feedback_token          text not null unique default gen_random_uuid()::text,
  feedback_email_sent_at  timestamptz
);

create unique index if not exists beta_testers_email_platform_role_idx
  on beta_testers (email, platform, role);

-- Index used by the cron job to find pending feedback emails fast
create index if not exists beta_testers_pending_feedback_idx
  on beta_testers (signed_up_at)
  where wants_feedback = true and feedback_email_sent_at is null;

-- One feedback submission per tester (upsert pattern)
create table if not exists feedback_responses (
  id            uuid primary key default gen_random_uuid(),
  tester_id     uuid not null references beta_testers(id) on delete cascade,
  role          text not null,
  responses     jsonb not null,
  submitted_at  timestamptz not null default now(),
  unique (tester_id)
);

-- Sliding-window rate limiting (signup + admin login share this table)
create table if not exists rate_limit_attempts (
  id            bigserial primary key,
  kind          text not null,
  ip            text not null,
  attempted_at  timestamptz not null default now()
);

create index if not exists rate_limit_attempts_lookup_idx
  on rate_limit_attempts (kind, ip, attempted_at desc);

-- Lock everything down. Service role key bypasses RLS, so the Netlify
-- functions still work; the anon key (if ever leaked) reads nothing.
alter table beta_testers          enable row level security;
alter table feedback_responses    enable row level security;
alter table rate_limit_attempts   enable row level security;
