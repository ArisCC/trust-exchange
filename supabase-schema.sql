-- 先清除舊資料表
drop table if exists match_proposals cascade;
drop table if exists exchange_requests cascade;

-- 交換申請
create table exchange_requests (
  id uuid primary key default gen_random_uuid(),
  branch_code text not null,
  branch_name text not null,
  requested_count integer not null check (requested_count > 0),
  remaining_count integer not null check (remaining_count >= 0),
  contact_info text,
  status text not null default 'waiting' check (status in ('waiting', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 配對提案（邀請配對）
create table match_proposals (
  id uuid primary key default gen_random_uuid(),
  from_request_id uuid not null references exchange_requests(id),
  to_request_id uuid not null references exchange_requests(id),
  from_branch_code text not null,
  from_branch_name text not null,
  to_branch_code text not null,
  to_branch_name text not null,
  proposed_count integer not null check (proposed_count > 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected', 'cancelled')),
  cancel_requested_by text,
  cancel_status text not null default 'none' check (cancel_status in ('none', 'pending', 'rejected')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

-- Row Level Security
alter table exchange_requests enable row level security;
alter table match_proposals enable row level security;

create policy "allow all" on exchange_requests for all using (true) with check (true);
create policy "allow all" on match_proposals for all using (true) with check (true);

-- 索引
create index on exchange_requests (status, created_at);
create index on exchange_requests (branch_code);
create index on match_proposals (to_request_id, status);
create index on match_proposals (from_request_id);
