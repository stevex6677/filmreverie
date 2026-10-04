/** Measured progress within the current stage; omit totals for server work. */
export interface OperationProgress {
  label: string;
  detail?: string;
  completed?: number;
  total?: number;
}
export type ProgressReporter = (progress: OperationProgress) => void;
