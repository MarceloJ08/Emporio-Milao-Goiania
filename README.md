# Empório Milão — código e operação

## Estrutura
- `index.html`: ponto de entrada da loja.
- `src/css/styles.css`: estilos e identidade visual.
- `src/js/app.js`: interface, autenticação Supabase e fluxos de loja/ADM/vendas.
- `supabase/migrations/`: migrations SQL versionadas.
- `docs/SECURITY.md`: limites de acesso e checklist operacional.

## Tecnologias
Frontend estático em HTML, CSS e JavaScript (ES modules). **Não existe código Java neste projeto**; JavaScript é uma linguagem diferente. O backend de dados/autenticação é Supabase (PostgreSQL/Auth/RLS), hospedado e publicado pela Vercel.

## Banco de dados e migrations
O histórico remoto do Supabase está registrado em `docs/REMOTE_MIGRATION_HISTORY.md`. Há scripts históricos aplicados em produção que ainda precisam ser recuperados para que o banco possa ser reconstruído integralmente do zero; não recrie esses SQLs por suposição.

## Desenvolvimento
A raiz do projeto deve continuar sendo a raiz de deploy da Vercel: o arquivo `index.html` importa os ativos por caminhos absolutos em `/src/`. Cada alteração na branch `main` aciona o deploy Git da Vercel.

## Segredos
Nunca commitar arquivos `.env`, tokens, senhas, service-role/secret keys, dumps com dados pessoais ou planilhas de estoque contendo informações internas. O frontend pode conter apenas a chave Supabase publishable/anon, pois ela é pública por definição e deve sempre estar protegida por RLS e grants mínimos.

## Catálogo visual e atendimento
- `src/css/premium.css`: nova direção de arte da vitrine e das áreas de atendimento.
- `supabase/functions/centralize-product-images/index.ts`: importação autenticada das fotos de catálogo para o bucket `product-images`, com allowlist de domínios e validação administrativa.
- O ADM permite editar nome, categoria, preço atual, preço de referência promocional e imagem. Se o preço atual for maior ou igual ao anterior, o preço de referência é removido e somente o preço atual é exibido.
- O acesso de vendas é uma rota independente em `/?vendas=1`, com busca de produtos e registro integrado ao mesmo fluxo financeiro de pedidos.


## Evolução empresarial e validação

A documentação incremental da arquitetura, responsabilidades tecnológicas, segurança e validação está centralizada em [`enterprise/`](enterprise/README.md).

- [Arquitetura](enterprise/ARCHITECTURE.md)
- [Segurança](enterprise/SECURITY.md)
- [Responsabilidades por tecnologia](enterprise/LANGUAGE_ROLES.md)
- [Domínios de negócio](enterprise/domains/README.md)
- [Plano de testes](enterprise/TESTING.md)
- [Status da revisão](enterprise/REVIEW_STATUS.md)

Esta organização está na branch `architecture/enterprise-modular` e não altera a branch `main`.
