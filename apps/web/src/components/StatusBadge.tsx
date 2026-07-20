import type { TenderStatusName } from '@tender/shared';
import { statusBadgeClasses, statusLabels } from '../lib/labels';

export function StatusBadge({ status }: { status: TenderStatusName }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClasses[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}
