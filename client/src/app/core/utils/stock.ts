// Quantities at or below this are shown as "low"; keep in sync with LowStockThreshold in DashboardService.
export const LOW_STOCK_THRESHOLD = 10;

export type StockLevel = 'ok' | 'low' | 'out';

export function stockLevel(quantity: number): StockLevel {
  if (quantity <= 0) return 'out';
  return quantity <= LOW_STOCK_THRESHOLD ? 'low' : 'ok';
}

export function stockLabel(quantity: number): string {
  const level = stockLevel(quantity);
  return level === 'out' ? 'Out of stock' : level === 'low' ? 'Low stock' : 'In stock';
}
