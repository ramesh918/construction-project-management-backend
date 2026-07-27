# Step 7 — Shared Types

All files go inside the `shared/types/` folder you created in Step 5. using the command `mkdir -p shared/types`

---

## 7.1 Create shared/types/common.types.ts

```typescript
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  count: number;
  lastEvaluatedKey?: string;
}

export type UserRole = 'admin' | 'user';

export interface AuthContext {
  userId: string;
  email: string;
  role: UserRole;
  isAdmin: boolean;
}
```

---

## 7.2 Create shared/types/project.types.ts

```typescript
export type ProjectStatus = 'Planning' | 'Active' | 'On Hold' | 'Completed';

export interface Project {
  id: string;
  name: string;
  location: string;
  startDate: string;       // ISO date string YYYY-MM-DD
  endDate: string;
  budget: number;          // in rupees/dollars
  status: ProjectStatus;
  description?: string;
  documentKeys?: string[]; // S3 keys for blueprints/contracts
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCostSummary {
  projectId: string;
  labourCost: number;
  materialCost: number;
  otherCost: number;
  totalCost: number;
  budget: number;
  remaining: number;
  isOverBudget: boolean;
}

export interface CreateProjectInput {
  name: string;
  location: string;
  startDate: string;
  endDate: string;
  budget: number;
  description?: string;
}

export interface UpdateProjectInput {
  name?: string;
  status?: ProjectStatus;
  endDate?: string;
  budget?: number;
  description?: string;
}
```

---

## 7.3 Create shared/types/worker.types.ts

```typescript
export type WorkerRole = 'Mason' | 'Carpenter' | 'Plumber' | 'Electrician' | 'Labourer' | 'Supervisor' | 'Other';

export interface Worker {
  id: string;
  name: string;
  role: WorkerRole;
  phone: string;
  dailyWage: number;
  isActive: boolean;
  createdAt: string;
}

export interface AttendanceRecord {
  workerId: string;
  workerName: string;
  projectId: string;
  date: string;            // YYYY-MM-DD
  present: boolean;
  cost: number;            // dailyWage if present, 0 if absent
  markedBy: string;        // userId who marked attendance
  markedAt: string;        // ISO timestamp
}

export interface CreateWorkerInput {
  name: string;
  role: WorkerRole;
  phone: string;
  dailyWage: number;
}

export interface MarkAttendanceInput {
  projectId: string;
  date: string;
  present: boolean;
}
```



## 7.4 Create shared/types/material.types.ts

```typescript
export type MaterialUnit = 'kg' | 'ton' | 'bag' | 'piece' | 'litre' | 'cubic_meter' | 'square_meter';

export interface Material {
  id: string;
  name: string;
  unit: MaterialUnit;V
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
```

---

## 7.5 Create shared/types/progress.types.ts

```typescript
export interface ProgressLog {
  id: string;
  projectId: string;
  date: string;            // YYYY-MM-DD
  workDone: string;        // description of work completed today
  workersPresent: string[];// array of workerIds
  materialsUsed: ProgressMaterialUsed[];
  photoKeys: string[];     // S3 keys for site photos
  remarks?: string;        // issues, notes
  loggedBy: string;        // userId of supervisor
  createdAt: string;
}

export interface ProgressMaterialUsed {
  materialId: string;
  materialName: string;
  quantity: number;
  unit: string;
}

export interface CreateProgressLogInput {
  date: string;
  workDone: string;
  workersPresent: string[];
  materialsUsed: ProgressMaterialUsed[];
  photoKeys?: string[];
  remarks?: string;
}
```

---

## 7.6 Create shared/types/index.ts (Barrel Export)

```typescript
export * from './common.types';
export * from './project.types';
export * from './worker.types';
export * from './material.types';
export * from './progress.types';
```

---

## Checkpoints Before Moving to Step 8

- [ ] `shared/types/common.types.ts` created
- [ ] `shared/types/project.types.ts` created
- [ ] `shared/types/worker.types.ts` created
- [ ] `shared/types/material.types.ts` created
- [ ] `shared/types/progress.types.ts` created
- [ ] `shared/types/index.ts` created (barrel export)
