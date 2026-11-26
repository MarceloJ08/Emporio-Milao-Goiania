export async function printSaleReceipt(client, sellerId, orderId, isActive) {
  const { data: order, error } = await client.from('orders')
    .select('id,customer_name,created_at,payment_status,subtotal_amount,discount_amount,total_amount,store_locations(name),order_items(product_name,quantity,unit_price)')
    .eq('id', orderId).eq('seller_user_id', sellerId).single();
  if (error || !order) throw new Error('Cupom indisponível');
  if (!isActive()) return;

  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const receipt = document.createElement('article');
  receipt.id = 'customerReceipt';
  function line(tag, value) {
    const element = document.createElement(tag);
    element.textContent = value;
    receipt.append(element);
  }
  line('h1', 'Empório Milão Prime');
  line('p', order.store_locations?.name || 'Goiânia');
  line('h2', 'Comprovante de venda');
  line('p', 'Pedido ' + order.id);
  line('p', new Date(order.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }));
  line('p', 'Cliente: ' + order.customer_name);
  for (const item of order.order_items) {
    line('h3', item.product_name);
    line('p', item.quantity + ' × ' + currency.format(item.unit_price) + ' = ' + currency.format(item.quantity * item.unit_price));
  }
  line('h2', 'Resumo');
  line('p', 'Subtotal: ' + currency.format(order.subtotal_amount));
  line('p', 'Descontos: ' + currency.format(order.discount_amount));
  line('strong', 'Total: ' + currency.format(order.total_amount));
  line('p', order.payment_status === 'paid' ? 'Pagamento recebido' : 'Pagamento pendente');
  line('small', 'Cupom não fiscal');

  document.getElementById(receipt.id)?.remove();
  document.body.append(receipt);
  window.addEventListener('afterprint', () => receipt.remove(), { once: true });
  window.print();
}
