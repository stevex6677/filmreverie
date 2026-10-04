import type { OperationProgress } from '../utils/operationProgress';
import './rollProgress.css';

export function RollProgress({ progress }: { progress: OperationProgress }) {
  const measured = progress.total !== undefined && progress.total > 0 && progress.completed !== undefined;
  return <div className="roll-operation-progress">
    <div role="status" aria-live="polite" aria-atomic="true"><strong>{progress.label}</strong>{progress.detail && <span>{progress.detail}</span>}</div>
    <progress aria-label={progress.label} max={measured ? progress.total : undefined} value={measured ? progress.completed : undefined} />
  </div>;
}
