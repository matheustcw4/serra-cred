-- Adiciona o campo modalidade (diario / semanal) na tabela de empréstimos.
-- Empréstimos já existentes recebem 'diario' automaticamente (mantém o
-- comportamento que já tinham).
alter table emprestimos
  add column if not exists modalidade text not null default 'diario';
