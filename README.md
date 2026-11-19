# Empório Milão — código e operação

## Estrutura
- `index.html`: ponto de entrada da loja.
- `src/css/styles.css`: estilos e identidade visual.
- `src/js/app.js`: interface, autenticação Supabase e fluxos de loja/ADM/vendas.
- `supabase/migrations/`: migrations SQL versionadas.
- `docs/SECURITY.md`: limites de acesso e checklist operacional.

## Tecnologias
Frontend estático em HTML, CSS e JavaScript (ES modules). **Não existe código Java neste projeto**; JavaScript é uma linguagem diferente. O backend de dados/autenticação é Supabase (PostgreSQL/Auth/RLS), hospedado e publicado pela Vercel.

## Desenvolvimento
A raiz do projeto deve continuar sendo a raiz de deploy da Vercel: o arquivo `index.html` importa os ativos por caminhos absolutos em `/src/`. Cada alteração na branch `main` aciona o deploy Git da Vercel.

## Segredos
Nunca commitar arquivos `.env`, tokens, senhas, service-role/secret keys, dumps com dados pessoais ou planilhas de estoque contendo informações internas. O frontend pode conter apenas a chave Supabase publishable/anon, pois ela é pública por definição e deve sempre estar protegida por RLS e grants mínimos.
