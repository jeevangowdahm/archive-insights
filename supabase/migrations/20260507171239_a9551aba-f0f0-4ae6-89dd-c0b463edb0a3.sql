
create extension if not exists vector;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  page_count int,
  full_text text,
  summary text,
  entities jsonb default '[]'::jsonb,
  doc_date date,
  status text not null default 'processing',
  error text,
  created_at timestamptz not null default now()
);

create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(768),
  created_at timestamptz not null default now()
);

create index chunks_document_id_idx on public.chunks(document_id);
create index chunks_embedding_idx on public.chunks using hnsw (embedding vector_cosine_ops);

alter table public.documents enable row level security;
alter table public.chunks enable row level security;

-- MVP: public archive (no auth this week per spec)
create policy "public read documents" on public.documents for select using (true);
create policy "public insert documents" on public.documents for insert with check (true);
create policy "public update documents" on public.documents for update using (true);
create policy "public delete documents" on public.documents for delete using (true);

create policy "public read chunks" on public.chunks for select using (true);
create policy "public insert chunks" on public.chunks for insert with check (true);
create policy "public delete chunks" on public.chunks for delete using (true);

-- Similarity search RPC
create or replace function public.match_chunks(
  query_embedding vector(768),
  match_count int default 8,
  filter_document_id uuid default null
)
returns table (
  id uuid,
  document_id uuid,
  chunk_index int,
  content text,
  similarity float
)
language sql stable
as $$
  select c.id, c.document_id, c.chunk_index, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  where c.embedding is not null
    and (filter_document_id is null or c.document_id = filter_document_id)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Storage bucket for raw uploads
insert into storage.buckets (id, name, public)
values ('archive', 'archive', true)
on conflict (id) do nothing;

create policy "public read archive" on storage.objects for select using (bucket_id = 'archive');
create policy "public upload archive" on storage.objects for insert with check (bucket_id = 'archive');
create policy "public update archive" on storage.objects for update using (bucket_id = 'archive');
create policy "public delete archive" on storage.objects for delete using (bucket_id = 'archive');
