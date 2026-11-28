# Teste do Sommelier, das fichas e do Kit Presente

## Três fichas de exemplo

Em uma base de teste, cadastre os exemplos abaixo em **Produtos** no ADM. São dados fictícios para validar as regras. Cadastre saldo positivo na unidade indicada e use **Gerar descrição** para completar os textos. Revise os textos antes de marcar a descrição como revisada.

| Produto | Tipo, corpo e estilo | Uva e aromas | Harmonização e ocasião | Preço e unidade |
| --- | --- | --- | --- | --- |
| Tinto de teste | Tinto, encorpado, seco | Malbec, ameixa | Carne, churrasco | R$ 129, Nova Suíça |
| Branco de teste | Branco, leve, seco | Pinot Grigio, cítrico | Peixe, jantar a dois | R$ 90, Alto da Glória |
| Espumante de teste | Espumante, médio, espumante | Chardonnay, maçã | Queijo, comemoração | R$ 250, Nova Suíça |

1. Abra **Ver detalhes** de cada produto e confira as descrições, os aromas e os indicadores preenchidos. Verifique que os campos vazios ficam ocultos.
2. No Sommelier, selecione churrasco, carne, até R$ 150 e encorpado. O tinto deve ser a primeira indicação. Repita com jantar a dois, peixe, até R$ 150 e leve para o branco. Use comemoração, queijo, R$ 150 a R$ 400 e surpresa para o espumante.
3. Remova o saldo do tinto na unidade e repita a consulta. Ele deve sair dos resultados. Remova o corpo do branco e confira também sua presença na lista **Fichas incompletas** do ADM.
4. Consulte uma característica ausente pelo Sommelier. A resposta deve oferecer o WhatsApp para confirmação.

O saldo usado pelo Sommelier e pelo kit é o da unidade. Os testes automatizados de recomendação, estoque e descrições rodam com `node --test tests/*.test.mjs`.

## Kit de Natal

1. Na base de teste, marque o tinto como elegível ao kit na categoria **Vinho**. Cadastre um queijo como **Queijo** e vincule-o em **Produtos que combinam** no vinho. Ajuste saldo de ambos na Nova Suíça.
2. Em **Kits Presente** no ADM, cadastre uma caixa clássica com foto, preço e saldo na Nova Suíça. Cadastre as demais embalagens com os dados reais antes de disponibilizá-las aos clientes. Configure um prazo futuro para o Natal. Associe os componentes ao kit **Essencial**, informe um preço fechado e marque **Publicar**.
3. Na loja, entre em **Kit Presente**, escolha **Natal** e selecione o vinho, o queijo com o selo **Combina** e a caixa. Veja as três sugestões de mensagem e preencha remetente, destinatário e mensagem. Baixe a prévia e confira o total. Em uma segunda montagem, escolha o **Essencial** e confirme o preço fechado com os componentes originais.
4. Selecione **Retirar na loja** e confira que a Nova Suíça aparece. Remova o saldo de um componente e tente avançar para verificar o aviso. Restaure o saldo. Teste a opção de entrega com um endereço e uma data dentro do prazo.
5. Adicione o kit à sacola e confirme que ele aparece agrupado. Adicione também um produto avulso e finalize com uma conta de teste. Confira os detalhes na mensagem de WhatsApp, incluindo embalagem, cartão e retirada ou entrega. O fluxo de teste termina antes do envio da mensagem.
6. No ADM, abra o pedido em **Kits Presente** e use **Imprimir cartão**. Marque o pedido de teste como pago e confira a contagem de Natal e o ticket médio.
