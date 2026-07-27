export type MaterialUnit = 'kg' | 'ton' | 'bag' | 'piece' | 'litre' | 'cubic_meter' | 'square_meter';

export interface Material {
  id: string;
  name: string;
  unit: MaterialUnit;
  currentStock: number;
  lowStockThreshold: number;
  isLowStock: boolean;     // computed: currentStock <= lowStockThreshold
  createdAt: string;
}

export interface MaterialPurchase {
  id: string;
  materialId: string;
  materialName: string;
  quantity: number;
  unitPrice: number;
  totalCost: number;       // quantity * unitPrice
  vendor: string;
  date: string;
  billKey?: string;        // S3 key for the purchase bill
  projectId?: string;      // which project this purchase was for
  createdAt: string;
}

export interface MaterialUsage {
  id: string;
  materialId: string;
  materialName: string;
  projectId: string;
  quantityUsed: number;
  date: string;
  loggedBy: string;
  createdAt: string;
}

export interface CreateMaterialInput {
  name: string;
  unit: MaterialUnit;
  initialStock?: number;
  lowStockThreshold: number;
}

export interface RecordPurchaseInput {
  quantity: number;
  unitPrice: number;
  vendor: string;
  date: string;
  projectId?: string;
  billKey?: string;
}

export interface RecordUsageInput {
  projectId: string;
  quantityUsed: number;
  date: string;
}