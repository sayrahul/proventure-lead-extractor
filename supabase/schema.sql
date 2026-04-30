create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  google_place_id text not null unique,
  business_name text not null,
  phone_number text,
  website text,
  address text,
  email text,
  social_links text[] not null default '{}',
  google_rating numeric,
  google_review_count integer,
  place_types text[] not null default '{}',
  quality_score integer not null default 0,
  notes text,
  follow_up_date date,
  status text not null default 'New' check (status in ('New', 'Verified', 'Called', 'Interested', 'Not Interested', 'Converted', 'Rejected')),
  search_query text
);

alter table public.leads add column if not exists email text;
alter table public.leads add column if not exists social_links text[] not null default '{}';
alter table public.leads add column if not exists google_rating numeric;
alter table public.leads add column if not exists google_review_count integer;
alter table public.leads add column if not exists place_types text[] not null default '{}';
alter table public.leads add column if not exists quality_score integer not null default 0;
alter table public.leads add column if not exists notes text;
alter table public.leads add column if not exists follow_up_date date;

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads
  add constraint leads_status_check
  check (status in ('New', 'Verified', 'Called', 'Interested', 'Not Interested', 'Converted', 'Rejected'));

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_quality_score_idx on public.leads (quality_score desc);
create index if not exists leads_google_review_count_idx on public.leads (google_review_count desc);
create index if not exists leads_follow_up_date_idx on public.leads (follow_up_date);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leads_set_updated_at on public.leads;

create trigger leads_set_updated_at
before update on public.leads
for each row
execute function public.set_updated_at();
