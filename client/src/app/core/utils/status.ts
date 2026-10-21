import { OrderStatus } from '../models/api.models';

// CSS class (defined in styles.scss) that carries the colours for an order status.
export function statusClass(status: OrderStatus): string {
  return `st-${status.toLowerCase()}`;
}
