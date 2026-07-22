import { PrismaClient, Role, TenderStatus } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

export const SEED_PASSWORD = 'Test1234!';

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  const users = [
    { email: 'admin@test.com', name: 'مدير النظام', role: Role.ADMIN },
    { email: 'qa@test.com', name: 'أحمد المراجع', role: Role.QA },
    { email: 'writer@test.com', name: 'سارة الكاتبة', role: Role.WRITER },
    { email: 'manager@test.com', name: 'خالد المدير', role: Role.MANAGER },
    { email: 'owner@test.com', name: 'عمر المالك', role: Role.OWNER },
  ];

  const byEmail: Record<string, { id: string }> = {};
  for (const u of users) {
    byEmail[u.email] = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, passwordHash, isActive: true },
      create: { ...u, passwordHash },
    });
  }

  const qa = byEmail['qa@test.com'];
  const writer = byEmail['writer@test.com'];
  const manager = byEmail['manager@test.com'];

  // M3.2 — قالب Checklist افتراضي ببنوده الستة (idempotent: يُعاد بناؤه من الصفر)
  await prisma.checklistTemplate.deleteMany();
  await prisma.checklistTemplate.create({
    data: {
      name: 'قالب مراجعة المناقصات الافتراضي',
      isActive: true,
      items: {
        create: [
          { text: 'توافق نشاط الشركة مع مجال المناقصة', order: 0 },
          { text: 'الموعد المتبقي كافٍ لإعداد عرض متكامل', order: 1 },
          { text: 'المتطلبات الفنية واضحة ومفهومة', order: 2 },
          { text: 'القدرة الفنية والكوادر متوفرة للتنفيذ', order: 3 },
          { text: 'الجدوى المالية مناسبة (قيمة المناقصة تبرّر التكلفة)', order: 4 },
          { text: 'لا يوجد تعارض مصالح أو مانع نظامي', order: 5 },
        ],
      },
    },
  });

  // إعادة بناء بيانات المناقصات التجريبية من الصفر (seed تطويري)
  await prisma.tender.deleteMany();

  const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

  const tenders: {
    title: string;
    entity: string;
    source?: string;
    url?: string;
    closingDate: Date;
    description?: string;
    status: TenderStatus;
    currentAssigneeId?: string;
    path: TenderStatus[];
  }[] = [
    {
      title: 'توريد وتركيب أنظمة شبكات لمقر الوزارة',
      entity: 'وزارة الاتصالات',
      source: 'منصة اعتماد',
      url: 'https://etimad.sa/tender/1001',
      closingDate: days(14),
      description: 'مناقصة لتوريد وتركيب بنية تحتية للشبكات.',
      status: TenderStatus.NEW,
      currentAssigneeId: qa.id,
      path: [TenderStatus.NEW],
    },
    {
      title: 'تطوير بوابة خدمات إلكترونية',
      entity: 'أمانة المنطقة الشرقية',
      source: 'منصة اعتماد',
      url: 'https://etimad.sa/tender/1002',
      closingDate: days(2),
      description: 'تطوير بوابة موحدة للخدمات البلدية.',
      status: TenderStatus.UNDER_REVIEW,
      currentAssigneeId: qa.id,
      path: [TenderStatus.NEW, TenderStatus.UNDER_REVIEW],
    },
    {
      title: 'صيانة وتشغيل مراكز البيانات',
      entity: 'الهيئة العامة للنقل',
      source: 'موقع الهيئة',
      url: 'https://example.gov.sa/tender/1003',
      closingDate: days(10),
      description: 'عقد صيانة سنوي لمراكز البيانات.',
      status: TenderStatus.PROPOSAL_PREPARATION,
      currentAssigneeId: writer.id,
      path: [TenderStatus.NEW, TenderStatus.UNDER_REVIEW, TenderStatus.PROPOSAL_PREPARATION],
    },
    {
      title: 'توريد أجهزة حاسب آلي وملحقاتها',
      entity: 'جامعة الملك سعود',
      source: 'منصة اعتماد',
      url: 'https://etimad.sa/tender/1004',
      closingDate: days(5),
      description: 'توريد 500 جهاز حاسب مكتبي.',
      status: TenderStatus.PENDING_APPROVAL,
      currentAssigneeId: manager.id,
      path: [
        TenderStatus.NEW,
        TenderStatus.UNDER_REVIEW,
        TenderStatus.PROPOSAL_PREPARATION,
        TenderStatus.PENDING_APPROVAL,
      ],
    },
    {
      title: 'مشروع أتمتة الأرشيف الإداري',
      entity: 'وزارة العدل',
      source: 'منصة اعتماد',
      url: 'https://etimad.sa/tender/1005',
      closingDate: days(30),
      description: 'رقمنة وأتمتة الأرشيف الورقي.',
      status: TenderStatus.SUBMITTED,
      currentAssigneeId: manager.id,
      path: [
        TenderStatus.NEW,
        TenderStatus.UNDER_REVIEW,
        TenderStatus.PROPOSAL_PREPARATION,
        TenderStatus.PENDING_APPROVAL,
        TenderStatus.SUBMITTED,
      ],
    },
  ];

  for (const t of tenders) {
    const { path, ...data } = t;
    const created = await prisma.tender.create({
      data: {
        ...data,
        createdById: qa.id,
        managerApprovedAt: t.status === TenderStatus.SUBMITTED ? new Date() : null,
        statusHistory: {
          create: path.map((toStatus, i) => ({
            fromStatus: i === 0 ? null : path[i - 1],
            toStatus,
            changedById: qa.id,
          })),
        },
      },
    });
    await prisma.auditLog.create({
      data: {
        tenderId: created.id,
        userId: qa.id,
        action: 'TENDER_CREATED',
        details: { seed: true },
      },
    });
  }

  // M6.2 — إعداد عدد أيام التنبيه قبل الإغلاق (BR-009)
  await prisma.systemSetting.upsert({
    where: { key: 'closingReminderDays' },
    update: { value: '3' },
    create: { key: 'closingReminderDays', value: '3' },
  });

  const templateCount = await prisma.checklistTemplate.count();
  const itemCount = await prisma.checklistItem.count();
  console.log(
    `Seeded ${users.length} users, ${tenders.length} tenders, ${templateCount} checklist template(s) with ${itemCount} items.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
