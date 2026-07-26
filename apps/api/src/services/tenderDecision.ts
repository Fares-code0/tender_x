import type { Role, Tender } from '@prisma/client';
import type { managerDecisionSchema } from '@tender/shared';
import type { z } from 'zod';
import { logAudit } from '../lib/audit';
import { recordStatusChange } from '../lib/statusChange';
import * as tenderRepo from '../repositories/tenderRepository';
import { runInTransaction } from '../repositories/transaction';
import { resolveTransition } from './tenderWorkflow';
import { notify } from './notifications';

type ManagerDecision = z.infer<typeof managerDecisionSchema>;
/** فروع القرار مُنمَّطة بدقّة حتى يحفظ TypeScript تمييز الاتحاد عبر الدوال */
type ReturnDecision = Extract<ManagerDecision, { decision: 'return' }>;
type StopDecision = Extract<ManagerDecision, { decision: 'stop' }>;

export interface DecisionResult {
  tender: Tender;
  approved?: boolean;
}

/**
 * H6.2 — قرار المدير (M4.4) بفروعه الثلاثة، مُخرَجًا من المعالج.
 *
 * كان أطول معالج في الملف (87 سطرًا) يخلط ثلاث قواعد عمل مختلفة مع HTTP.
 * هنا المنطق وحده، فيصير قابلًا للاختبار مباشرةً ويبقى المعالج سطورًا قليلة.
 */
export async function decideAsManager(args: {
  tender: Tender;
  input: ManagerDecision;
  userId: string;
  userRole: Role;
}): Promise<DecisionResult> {
  const { tender, input, userId, userRole } = args;

  if (input.decision === 'approve') return approve(tender, userId);
  if (input.decision === 'return') return returnToWriter(tender, input, userId, userRole);
  return stop(tender, input, userId, userRole);
}

/** اعتماد: لا يغيّر الحالة — يضبط managerApprovedAt استعدادًا للتقديم (BR-004) */
async function approve(tender: Tender, userId: string): Promise<DecisionResult> {
  const updated = await runInTransaction(async (tx) => {
    const t = await tenderRepo.updatePlain(
      tender.id,
      { managerApprovedAt: new Date(), currentAssignee: { connect: { id: userId } } },
      tx,
    );
    await logAudit({ tx, userId, tenderId: tender.id, action: 'MANAGER_APPROVED' });
    return t;
  });

  // M6.1 — إشعار الكاتب المُرسِل باعتماد عرضه
  const submitEvent = await tenderRepo.findLastStatusEvent({
    tenderId: tender.id,
    toStatus: 'PENDING_APPROVAL',
  });
  if (submitEvent?.changedById) {
    await notify({
      userId: submitEvent.changedById,
      type: 'APPROVED',
      tenderId: tender.id,
      message: `اعتُمد عرضك: ${tender.title}`,
    });
  }

  return { tender: updated, approved: true };
}

/** إعادة: PENDING_APPROVAL → PROPOSAL_PREPARATION للكاتب نفسه (BR-011) */
async function returnToWriter(
  tender: Tender,
  input: ReturnDecision,
  userId: string,
  userRole: Role,
): Promise<DecisionResult> {
  const to = resolveTransition('MANAGER_RETURN', tender.status, userRole);
  // الكاتب نفسه = من أرسل للاعتماد آخر مرة
  const lastSubmit = await tenderRepo.findLastStatusEvent({
    tenderId: tender.id,
    toStatus: 'PENDING_APPROVAL',
  });

  const updated = await runInTransaction((tx) =>
    recordStatusChange(tx, {
      tenderId: tender.id,
      from: tender.status,
      to,
      userId,
      action: 'MANAGER_RETURNED',
      note: input.notes,
      details: { notes: input.notes },
      extraData: { currentAssigneeId: lastSubmit?.changedById ?? null, managerApprovedAt: null },
    }),
  );

  // M6.1 — إشعار الكاتب بإعادة العرض إليه مع الملاحظات
  if (lastSubmit?.changedById) {
    await notify({
      userId: lastSubmit.changedById,
      type: 'RETURNED',
      tenderId: tender.id,
      message: `أُعيدت إليك المناقصة مع ملاحظات: ${tender.title}`,
    });
  }

  return { tender: updated };
}

/** إيقاف: PENDING_APPROVAL → REJECTED (سبب إلزامي) */
async function stop(
  tender: Tender,
  input: StopDecision,
  userId: string,
  userRole: Role,
): Promise<DecisionResult> {
  const to = resolveTransition('MANAGER_STOP', tender.status, userRole);
  const updated = await runInTransaction((tx) =>
    recordStatusChange(tx, {
      tenderId: tender.id,
      from: tender.status,
      to,
      userId,
      action: 'MANAGER_STOPPED',
      note: input.reason,
      details: { reason: input.reason },
      extraData: {
        rejectionReason: input.reason,
        currentAssigneeId: null,
        managerApprovedAt: null,
      },
    }),
  );
  return { tender: updated };
}
