import { describe, it, expect } from 'vitest';
import { csvField, csvRow } from './csv';

// S7 — حقول التقرير كانت تُلصق في السطر بلا تهيئة: اسم فيه فاصلة يزيح الأعمدة،
// واسم يبدأ بـ`=` يصير صيغة تنفّذها Excel عند فتح الملف. مصدر الأسماء مسؤول
// النظام لا الجمهور، فالخطورة محدودة — لكن ملف تقرير يُفتح خارج التطبيق ولا
// يحمل أيًّا من دفاعاته، فما يخرج منه لا يصح أن يكون قابلًا للتنفيذ.
describe('csvField', () => {
  it('leaves an ordinary value untouched', () => {
    expect(csvField('أحمد المراجع')).toBe('أحمد المراجع');
    expect(csvField(12)).toBe('12');
  });

  it('quotes a value containing a comma', () => {
    expect(csvField('المالك, بالإنابة')).toBe('"المالك, بالإنابة"');
  });

  it('quotes and doubles embedded quotes', () => {
    expect(csvField('اسم "مستعار"')).toBe('"اسم ""مستعار"""');
  });

  it('quotes a value containing a newline', () => {
    expect(csvField('سطر\nآخر')).toBe('"سطر\nآخر"');
  });

  it('neutralises formula-leading characters', () => {
    expect(csvField("=cmd|'/c calc'!A1")).toBe("'=cmd|'/c calc'!A1");
    expect(csvField('+1234')).toBe("'+1234");
    expect(csvField('-1+1')).toBe("'-1+1");
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('neutralises a formula that also needs quoting', () => {
    expect(csvField('=HYPERLINK("http://x","a,b")')).toBe(
      '"\'=HYPERLINK(""http://x"",""a,b"")"',
    );
  });

  // الأعداد تأتي من الخادم لا من نص مستخدم، وسالبها رقم لا صيغة
  it('does not prefix negative numbers', () => {
    expect(csvField(-3)).toBe('-3');
  });

  it('renders an empty value as empty', () => {
    expect(csvField('')).toBe('');
  });
});

describe('csvRow', () => {
  it('joins escaped fields with commas', () => {
    expect(csvRow(['أحمد', 'المدير', 3, 7])).toBe('أحمد,المدير,3,7');
  });

  it('keeps a malicious name inside its own column', () => {
    expect(csvRow(['=1,2', 'QA', 0, 0])).toBe('"\'=1,2",QA,0,0');
  });
});
