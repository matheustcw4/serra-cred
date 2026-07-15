-- Nova tabela: despesas (Contas a Pagar)
create table if not exists despesas (
  id text primary key,
  user_id uuid references auth.users(id) not null default auth.uid(),
  descricao text not null,
  valor numeric not null,
  data text not null,
  pago boolean not null default false,
  criado_em text
);

alter table despesas enable row level security;

create policy "acesso proprio" on despesas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
