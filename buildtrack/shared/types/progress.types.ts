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