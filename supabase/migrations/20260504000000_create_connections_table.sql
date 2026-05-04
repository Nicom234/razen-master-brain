create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gmail','drive','slack','notion','github','linear')),
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, provider)
);

alter table public.connections enable row level security;

create policy "own connections"
  on public.connections
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.update_connections_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger connections_updated_at
  before update on public.connections
  for each row execute procedure public.update_connections_updated_at();
