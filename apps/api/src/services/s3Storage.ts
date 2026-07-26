import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import type { StorageService } from './storage';

/**
 * الحد الأدنى من واجهة عميل S3 الذي نحتاجه — يسمح بحقن عميل بديل في الاختبارات
 * دون الاعتماد على شبكة أو خدمة حقيقية.
 */
export interface S3Like {
  send(command: unknown): Promise<unknown>;
}

/**
 * H5.1 — محوّل تخزين كائني على Amazon S3 خلف نفس `StorageService`.
 *
 * لماذا S3: التخزين المحلي يجعل النسخ ذات حالة — مرفق رُفع على النسخة A لا تراه
 * النسخة B. مع S3 تصير كل النسخ تقرأ وتكتب على تخزين مشترك واحد.
 *
 * **الاعتماديات:** لا تُمرَّر مفاتيح في الكود إطلاقًا. العميل يستخدم سلسلة
 * الاعتماد الافتراضية لـAWS SDK: دور IAM للمهمة/الخادم (المفضّل في الإنتاج)،
 * أو متغيرات البيئة `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` محليًا.
 */
export class S3Storage implements StorageService {
  constructor(
    private readonly bucket: string,
    private readonly client: S3Like,
    /** بادئة اختيارية داخل الحاوية (مثل `attachments/`) */
    private readonly prefix = '',
  ) {}

  private objectKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async save(key: string, data: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key), Body: data }),
    );
  }

  /**
   * H4.5 + H5.1 — يرفع الملف **متدفّقًا** من المسار المؤقّت بلا تحميله في الذاكرة.
   *
   * نستخدم `PutObjectCommand` بجسم متدفّق مع `ContentLength` من `stat` بدل
   * `lib-storage/Upload`: حجم المرفق مسقوف بـ20MB (أقل بكثير من حد الـ5GB لطلب
   * PUT واحد)، فلا حاجة إلى multipart وتبقى التبعيات والاختبار أبسط.
   */
  async saveFromFile(key: string, sourcePath: string): Promise<void> {
    const { size } = await stat(sourcePath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.objectKey(key),
        Body: createReadStream(sourcePath),
        ContentLength: size,
      }),
    );
  }

  async read(key: string): Promise<Buffer> {
    const stream = this.createReadStream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  /**
   * التنزيل تدفّقًا: `GetObject` يعيد جسمًا قابلًا للبثّ فنمرّره كما هو إلى الاستجابة.
   * العملية غير متزامنة بطبيعتها، فنغلّفها في `PassThrough` لتطابق التوقيع المتزامن.
   */
  createReadStream(key: string): Readable {
    const out = new Readable({ read() {} });
    this.client
      .send(new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }))
      .then((res) => {
        const body = (res as { Body?: unknown }).Body;
        if (!body) {
          out.destroy(new Error(`S3 object has no body: ${key}`));
          return;
        }
        const source = body as Readable;
        source.on('data', (c) => out.push(c));
        source.on('end', () => out.push(null));
        source.on('error', (err: Error) => out.destroy(err));
      })
      .catch((err: Error) => out.destroy(err));
    return out;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }),
    );
  }
}
