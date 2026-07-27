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