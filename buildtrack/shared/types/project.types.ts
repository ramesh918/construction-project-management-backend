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