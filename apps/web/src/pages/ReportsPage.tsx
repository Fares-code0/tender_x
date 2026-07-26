import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { TENDER_STATUSES, type TenderStatusName } from '@tender/shared';
import { fetchReportSummary, type ReportSummary } from '../api/reports';
import { roleLabels, statusLabels } from '../lib/labels';

function toIso(date: string, endOfDay = false): string | undefined {
  if (!date) return undefined;
  return `${date}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`;
}

function buildCsv(r: ReportSummary): string {
  const lines: string[] = [];
  lines.push(`تقرير المناقصات,من:,${r.from ?? 'الكل'},إلى:,${r.to ?? 'الكل'}`);
  lines.push('');
  lines.push('الحالة,العدد');
  for (const s of TENDER_STATUSES) lines.push(`${statusLabels[s]},${r.byStatus[s]}`);
  lines.push(`الإجمالي,${r.total}`);
  lines.push('');
  lines.push(`فوز,${r.wonLost.won}`);
  lines.push(`خسارة,${r.wonLost.lost}`);
  lines.push('');
  lines.push('المستخدم,الدور,مناقصات أنشأها,تغييرات الحالة');
  for (const u of r.byUser) {
    lines.push(`${u.name},${roleLabels[u.role as keyof typeof roleLabels] ?? u.role},${u.tendersCreated},${u.statusChanges}`);
  }
  return '﻿' + lines.join('\n'); // BOM لدعم العربية في Excel
}

function downloadCsv(r: ReportSummary) {
  const blob = new Blob([buildCsv(r)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report-${r.from ?? 'all'}-${r.to ?? 'all'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [userId, setUserId] = useState('');

  // قائمة المستخدمين للفلتر تُشتق من تقرير غير مُفلتَر
  const { data: allUsers } = useQuery({
    queryKey: ['report-users'],
    queryFn: () => fetchReportSummary({}),
    staleTime: 5 * 60 * 1000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['report-summary', { from, to, userId }],
    queryFn: () => fetchReportSummary({ from: toIso(from), to: toIso(to, true), userId }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">التقارير</h1>
        <button
          onClick={() => data && downloadCsv(data)}
          disabled={!data}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          تصدير CSV
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <label htmlFor="from" className="mb-1 block text-xs font-medium text-slate-500">من تاريخ</label>
          <input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label htmlFor="to" className="mb-1 block text-xs font-medium text-slate-500">إلى تاريخ</label>
          <input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label htmlFor="user" className="mb-1 block text-xs font-medium text-slate-500">المستخدم</label>
          <select id="user" value={userId} onChange={(e) => setUserId(e.target.value)}
            className="w-48 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm">
            <option value="">كل المستخدمين</option>
            {allUsers?.byUser.map((u) => (
              <option key={u.userId} value={u.userId}>{u.name} — {roleLabels[u.role as keyof typeof roleLabels] ?? u.role}</option>
            ))}
          </select>
        </div>
        {(from || to || userId) && (
          <button onClick={() => { setFrom(''); setTo(''); setUserId(''); }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
            مسح الفلاتر
          </button>
        )}
      </div>

      {isLoading && <p className="text-slate-500">جارٍ التحميل...</p>}
      {error != null && <p className="text-red-600">تعذر تحميل التقرير</p>}

      {data && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-700">
              الأعداد حسب الحالة (الإجمالي: {data.total})
            </div>
            <table className="w-full text-right text-sm">
              <tbody>
                {TENDER_STATUSES.map((s: TenderStatusName) => (
                  <tr key={s} className="border-t border-slate-50">
                    <td className="px-4 py-2 text-slate-600">{statusLabels[s]}</td>
                    <td className="px-4 py-2 font-medium text-slate-800">{data.byStatus[s]}</td>
                  </tr>
                ))}
                <tr className="border-t border-slate-100 bg-slate-50">
                  <td className="px-4 py-2 font-semibold text-slate-700">فوز / خسارة</td>
                  <td className="px-4 py-2 font-semibold text-slate-800">
                    {data.wonLost.won} / {data.wonLost.lost}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-700">أداء المستخدمين</div>
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-2 font-medium">المستخدم</th>
                  <th className="px-4 py-2 font-medium">الدور</th>
                  <th className="px-4 py-2 font-medium">أنشأ</th>
                  <th className="px-4 py-2 font-medium">تغييرات الحالة</th>
                </tr>
              </thead>
              <tbody>
                {data.byUser.map((u) => (
                  <tr key={u.userId} className="border-t border-slate-50">
                    <td className="px-4 py-2 text-slate-800">{u.name}</td>
                    <td className="px-4 py-2 text-slate-600">{roleLabels[u.role as keyof typeof roleLabels] ?? u.role}</td>
                    <td className="px-4 py-2 text-slate-600">{u.tendersCreated}</td>
                    <td className="px-4 py-2 text-slate-600">{u.statusChanges}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </div>
  );
}
