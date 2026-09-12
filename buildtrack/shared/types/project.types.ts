export type ProjectStatus = 'Planning' | 'Active' | 'On Hold' | 'Completed';

export type ProjectDocumentCategory = 'blueprint' | 'permit' | 'contract' | 'other';

export interface ProjectDocument {
  key: string; // S3 object key, e.g. project-documents/<projectId>/<uuid>-<fileName>
  fileName: string; // original file name supplied by the uploader
  category: ProjectDocumentCategory;
  contentType: string;
  uploadedAt: string;
}

export interface Project {
  id: string;
  name: string;
  location: string;
  startDate: string;       // ISO date string YYYY-MM-DD
  endDate: string;
  budget: number;          // in rupees/dollars
  status: ProjectStatus;
  description?: string;
  documents?: ProjectDocument[]; // blueprints, contracts, government permits
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
  updatedAt: string;
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
