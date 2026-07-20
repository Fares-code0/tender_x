import { useMe } from '../hooks/useAuth';
import { roleLabels } from '../lib/labels';

export function HomePage() {
  const { data: user } = useMe();
  if (!user) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800">
        مرحبًا، {user.name} <span className="text-base font-normal text-slate-500">({roleLabels[user.role]})</span>
      </h1>
      <p className="mt-2 text-slate-500">
        لوحة التحكم الخاصة بدورك ستُبنى في المراحل القادمة (M7).
      </p>
    </div>
  );
}
