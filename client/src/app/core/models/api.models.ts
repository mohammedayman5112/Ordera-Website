// Types mirror the DTOs exposed by the ASP.NET Core API (camelCase JSON, enums serialized as strings).

export const ORDER_STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// Mirrors OrderStatusRules on the server. The API stays the source of truth and rejects invalid transitions.
export const NEXT_STATUSES: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  Pending: ['Processing', 'Cancelled'],
  Processing: ['Shipped', 'Cancelled'],
  Shipped: ['Delivered'],
  Delivered: [],
  Cancelled: [],
};

export type UserRole = 'Admin' | 'User';

export interface User {
  id: number;
  email: string;
  displayName: string;
  role: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  displayName: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  expiresAt: string;
  user: User;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface Product {
  id: number;
  name: string;
  price: number;
  availableQuantity: number;
  // Archived products are hidden from customers and cannot be ordered.
  isActive: boolean;
  // Relative URL of the product picture, or null when it has none.
  imageUrl: string | null;
}

export interface CreateProductRequest {
  name: string;
  price: number;
  availableQuantity: number;
}

export interface UpdateProductRequest {
  name: string;
  price: number;
}

export interface OrderItem {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  imageUrl: string | null;
}

export interface OrderItemRequest {
  productId: number;
  quantity: number;
}

export interface CreateOrderRequest {
  items: OrderItemRequest[];
}

// Returned by POST /api/orders.
export interface CreatedOrder {
  id: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  totalAmount: number;
  items: OrderItem[];
}

export interface OrderListItem {
  id: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  totalAmount: number;
  // Null for orders that were placed before accounts existed.
  customerEmail: string | null;
}

export interface OrderStatusHistoryEntry {
  oldStatus: OrderStatus | null;
  newStatus: OrderStatus;
  changedAt: string;
  // Display name of the person who made the change; null for history from before accounts existed.
  changedBy: string | null;
}

export interface OrderDetails {
  id: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  totalAmount: number;
  items: OrderItem[];
  history: OrderStatusHistoryEntry[];
  customerId: number | null;
  customerName: string | null;
  customerEmail: string | null;
}

export interface OrderStatusChange {
  id: number;
  oldStatus: OrderStatus;
  newStatus: OrderStatus;
  updatedAt: string;
}

export interface StatusCount {
  status: OrderStatus;
  count: number;
}

export interface DashboardSummary {
  totalOrders: number;
  totalProducts: number;
  totalRevenue: number;
  lowStockCount: number;
  ordersByStatus: StatusCount[];
  lowStockProducts: Product[];
  recentOrders: OrderListItem[];
}

export interface DailyPoint {
  date: string; // yyyy-MM-dd (UTC day)
  orders: number;
  revenue: number;
}

export interface TopProduct {
  productId: number;
  name: string;
  unitsSold: number;
  revenue: number;
  imageUrl: string | null;
}

// Sales for the last N days compared with the N days before. Cancelled orders are excluded.
export interface Analytics {
  days: number;
  orders: number;
  revenue: number;
  averageOrderValue: number;
  previousOrders: number;
  previousRevenue: number;
  daily: DailyPoint[];
  topProducts: TopProduct[];
}

export interface UserListItem {
  id: number;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  orderCount: number;
}

// RFC 7807 problem details, including the extension members the API attaches to some 409 responses.
export interface ProblemDetails {
  title?: string;
  detail?: string;
  status?: number;
  errors?: Record<string, string[]>;
  productId?: number;
  requested?: number;
  available?: number;
  currentStatus?: OrderStatus;
  allowedStatuses?: OrderStatus[];
}
