import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { crudRouter } from './crud';
import { reviewRouter } from './review';
import { workflowRouter } from './workflow';
import { tenderAttachmentsRouter } from './attachments';

/**
 * H6.2 — كان `tenders.ts` ملفًا واحدًا بـ17 معالجًا (720 سطرًا).
 * قُسِّم إلى أربع وحدات بمسؤولية واحدة لكل منها، مع بقاء المسارات كما هي
 * (لا تغيير في أي URL — التقسيم تنظيم داخلي فقط).
 *
 * المسارات ذات المقطع الواحد (`/:id`) لا تتعارض مع `/:id/...` في الوحدات الأخرى
 * لأن Express يطابق المقاطع تمامًا.
 */
export const tendersRouter = Router();

tendersRouter.use(requireAuth);

tendersRouter.use('/', crudRouter);
tendersRouter.use('/', reviewRouter);
tendersRouter.use('/', workflowRouter);
tendersRouter.use('/', tenderAttachmentsRouter);
