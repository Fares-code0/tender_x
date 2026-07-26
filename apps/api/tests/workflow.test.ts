import { describe, it, expect } from 'vitest';
import type { Role, TenderStatus } from '@prisma/client';
import { resolveTransition, canTransition, TRANSITIONS } from '../src/services/tenderWorkflow';
import { AppError } from '../src/lib/errors';

describe('Tender workflow state machine (M4.1)', () => {
  it('allows every defined transition and returns the correct target status', () => {
    for (const rule of TRANSITIONS) {
      const to = resolveTransition(rule.action, rule.from, rule.roles[0]);
      expect(to).toBe(rule.to);
    }
  });

  it('covers the full happy-path chain New→…→WON', () => {
    expect(resolveTransition('REVIEW_START', 'NEW', 'QA')).toBe('UNDER_REVIEW');
    expect(resolveTransition('ASSIGN_WRITER', 'UNDER_REVIEW', 'QA')).toBe('PROPOSAL_PREPARATION');
    expect(resolveTransition('SUBMIT_FOR_APPROVAL', 'PROPOSAL_PREPARATION', 'WRITER')).toBe(
      'PENDING_APPROVAL',
    );
    expect(resolveTransition('MARK_SUBMITTED', 'PENDING_APPROVAL', 'MANAGER')).toBe('SUBMITTED');
    expect(resolveTransition('RESULT_WON', 'SUBMITTED', 'MANAGER')).toBe('WON');
  });

  // ── انتقالات ممنوعة (≥5): قفز حالات + دور غلط ──
  const forbidden: { name: string; action: Parameters<typeof resolveTransition>[0]; from: TenderStatus; role: Role; code: string }[] = [
    { name: 'jump NEW→SUBMITTED (mark-submitted on NEW)', action: 'MARK_SUBMITTED', from: 'NEW', role: 'MANAGER', code: 'INVALID_TRANSITION' },
    { name: 'jump NEW→PENDING (submit on NEW)', action: 'SUBMIT_FOR_APPROVAL', from: 'NEW', role: 'WRITER', code: 'INVALID_TRANSITION' },
    { name: 'result on a non-submitted tender', action: 'RESULT_WON', from: 'UNDER_REVIEW', role: 'MANAGER', code: 'INVALID_TRANSITION' },
    { name: 'assign from PENDING_APPROVAL', action: 'ASSIGN_WRITER', from: 'PENDING_APPROVAL', role: 'QA', code: 'INVALID_TRANSITION' },
    { name: 'reopen a REJECTED tender', action: 'REVIEW_START', from: 'REJECTED', role: 'QA', code: 'INVALID_TRANSITION' },
    { name: 'wrong role: WRITER starts review', action: 'REVIEW_START', from: 'NEW', role: 'WRITER', code: 'FORBIDDEN_TRANSITION' },
    { name: 'wrong role: QA marks submitted', action: 'MARK_SUBMITTED', from: 'PENDING_APPROVAL', role: 'QA', code: 'FORBIDDEN_TRANSITION' },
  ];

  for (const f of forbidden) {
    it(`rejects: ${f.name}`, () => {
      try {
        resolveTransition(f.action, f.from, f.role);
        throw new Error('expected resolveTransition to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe(f.code);
      }
    });
  }

  it('canTransition reflects the table without role checks', () => {
    expect(canTransition('REVIEW_START', 'NEW')).toBe(true);
    expect(canTransition('MARK_SUBMITTED', 'NEW')).toBe(false);
  });
});
