import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TenderStatusName } from '@tender/shared';
import { fetchDashboard } from '../api/dashboard';
import { useMe } from '../hooks/useAuth';
import { roleLabels, statusLabels } from '../lib/labels';

const STATUS_COLORS: Record<TenderStatusName, string> = {
  NEW: '#0ea5e9',
  UNDER_REVIEW: '#f59e0b',
  REJECTED: '#ef4444',
  PROPOSAL_PREPARATION: '#8b5cf6',
  PENDING_APPROVAL: '#f97316',
  SUBMITTED: '#6366f1',
  WON: '#22c55e',
  LOST: '#94a3b8',
};

function Card({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${accent ?? 'text-slate-800'}`}>{value}</div>
    </div>
  );
}

export function DashboardPage() {
  const { data: user } = useMe();
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard });

  if (isLoading) return <p className="text-slate-500">جارٍ التحميل...</p>;
  if (error || !data) return <p className="text-red-600">تعذر تحميل لوحة المعلومات</p>;

  const pieData = (Object.keys(data.statusDistribution) as TenderStatusName[])
    .map((s) => ({ name: statusLabels[s], value: data.statusDistribution[s], status: s }))
    .filter((d) => d.value > 0);

  const barData = data.monthly.map((m) => ({ month: m.month, count: m.count }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">لوحة المعلومات</h1>
        {user && (
          <p className="mt-1 text-sm text-slate-500">
            {user.name} — {roleLabels[user.role]}
          </p>
        )}
      </div>

      {/* كروت أرقام حسب الدور */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {data.qa && (
          <>
            <Card label="مناقصات جديدة" value={data.qa.newCount} accent="text-sky-600" />
            <Card label="قيد مراجعتي" value={data.qa.underReviewMineCount} accent="text-amber-600" />
            <Card label="قريبة الإغلاق" value={data.qa.closingSoonCount} accent="text-red-600" />
          </>
        )}
        {data.writer && (
          <>
            <Card label="مهامي" value={data.writer.myTasksCount} accent="text-violet-600" />
            <Card label="معادة لي" value={data.writer.returnedToMeCount} accent="text-orange-600" />
          </>
        )}
        {data.manager && (
          <>
            <Card
              label="بانتظار اعتمادي"
              value={data.manager.pendingApprovalCount}
              accent="text-orange-600"
            />
            <Card label="مقدَّمة" value={data.manager.submittedCount} accent="text-indigo-600" />
          </>
        )}
        <Card label="إجمالي المناقصات" value={data.total} />
        {data.winRate !== null && (
          <Card
            label="نسبة الفوز"
            value={`${Math.round(data.winRate * 100)}%`}
            accent="text-green-600"
          />
        )}
      </div>

      {/* رسمان بيانيان */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 font-semibold text-slate-700">توزيع المناقصات حسب الحالة</h2>
          {pieData.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">لا توجد بيانات</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={90} label>
                  {pieData.map((d) => (
                    <Cell key={d.status} fill={STATUS_COLORS[d.status]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 font-semibold text-slate-700">المناقصات المُنشأة شهريًا</h2>
          {barData.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">لا توجد بيانات</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} name="عدد المناقصات" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>

      {/* متوسط زمن المراحل (Manager/Owner/Admin) */}
      {data.avgStageDurationDays && Object.keys(data.avgStageDurationDays).length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 font-semibold text-slate-700">متوسط زمن كل مرحلة (بالأيام)</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Object.entries(data.avgStageDurationDays).map(([status, days]) => (
              <div key={status} className="rounded-lg bg-slate-50 p-3 text-center">
                <div className="text-xs text-slate-500">
                  {statusLabels[status as TenderStatusName] ?? status}
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-800">{days}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
