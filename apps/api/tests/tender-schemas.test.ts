import { describe, it, expect } from 'vitest';
import { createTenderSchema, updateTenderSchema } from '@tender/shared';

describe('createTenderSchema (M2.1 / BR-010)', () => {
  const valid = {
    title: 'مناقصة توريد أجهزة',
    entity: 'وزارة التعليم',
    closingDate: '2026-09-01T00:00:00.000Z',
  };

  it('accepts a valid tender', () => {
    const r = createTenderSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.closingDate).toBeInstanceOf(Date);
  });

  it('rejects a tender without closingDate', () => {
    const r = createTenderSchema.safeParse({ title: valid.title, entity: valid.entity });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path[0] === 'closingDate')).toBe(true);
    }
  });

  it('rejects a tender without entity', () => {
    const r = createTenderSchema.safeParse({ title: valid.title, closingDate: valid.closingDate });
    expect(r.success).toBe(false);
  });

  it('rejects an invalid url with an Arabic message', () => {
    const r = createTenderSchema.safeParse({ ...valid, url: 'not-a-url' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('رابط غير صالح');
  });
});

describe('updateTenderSchema', () => {
  it('rejects an empty update', () => {
    expect(updateTenderSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a partial update', () => {
    expect(updateTenderSchema.safeParse({ title: 'عنوان معدل' }).success).toBe(true);
  });
});
