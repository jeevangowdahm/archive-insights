
alter table public.documents
  add column if not exists progress jsonb not null default '{}'::jsonb,
  add column if not exists ocr_used boolean not null default false;

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chat_sessions_document_idx on public.chat_sessions(document_id, updated_at desc);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  citations jsonb,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_session_idx on public.chat_messages(session_id, created_at);

alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

create policy "public read chat_sessions" on public.chat_sessions for select using (true);
create policy "public insert chat_sessions" on public.chat_sessions for insert with check (true);
create policy "public update chat_sessions" on public.chat_sessions for update using (true);
create policy "public delete chat_sessions" on public.chat_sessions for delete using (true);

create policy "public read chat_messages" on public.chat_messages for select using (true);
create policy "public insert chat_messages" on public.chat_messages for insert with check (true);
create policy "public delete chat_messages" on public.chat_messages for delete using (true);

-- Updated match_chunks with optional date filter
create or replace function public.match_chunks(
  query_embedding vector,
  match_count integer default 8,
  filter_document_id uuid default null,
  date_from date default null,
  date_to date default null
)
returns table(id uuid, document_id uuid, chunk_index integer, content text, similarity double precision)
language sql stable as $$
  select c.id, c.document_id, c.chunk_index, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  join public.documents d on d.id = c.document_id
  where c.embedding is not null
    and (filter_document_id is null or c.document_id = filter_document_id)
    and (date_from is null or d.doc_date >= date_from)
    and (date_to is null or d.doc_date <= date_to)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
