# Preparação da planilha de catálogo e estoque

## Modelo
Use `templates/catalogo-e-estoque-template.csv` como referência. Uma linha por produto.

## Campos
- `product_id`: identificador existente no sistema; deixe vazio para produto novo.
- `nome`, `categoria`, `pais`: cadastro do catálogo.
- `preco_venda`, `preco_anterior`: valores em reais, com ponto decimal (ex.: 29.90). Não preencher preço anterior sem promoção real.
- `ativo`: `true` ou `false`.
- `estoque_galpao`: saldo físico confirmado no galpão.
- `estoque_alto_da_gloria`, `estoque_nova_suica`, `estoque_avenida_milao`: saldos físicos confirmados de cada unidade.
- `observacao`: divergências, validade, lote ou informação de conferência.

## Regras antes de importar
1. Conferir nomes, EAN/SKU e unidade de medida; não duplicar produto com nome semelhante.
2. Contar fisicamente cada local e registrar a data e o responsável pela contagem.
3. Não substituir saldo existente por zero ou célula vazia sem autorização explícita.
4. Separar saldo disponível, reservado, avariado e em trânsito, caso a operação utilize esses estados.
5. Revisar preços, promoções e status ativo com a administração.
6. Fazer uma prévia com totais por local, diferenças e produtos não encontrados antes de confirmar qualquer gravação.
7. Registrar a importação como ajuste auditável, preservando autor, data, origem e valores anteriores.

## Segurança
A planilha real contém informação comercial interna. Envie-a diretamente nesta conversa ou por canal privado aprovado pela empresa. **Não coloque a planilha real no GitHub**, mesmo depois de tornar o repositório privado. O CSV versionado neste repositório é apenas um modelo vazio.

O cadastro em massa ainda deve ser validado contra o banco antes da execução. Este documento não representa uma importação já realizada.
