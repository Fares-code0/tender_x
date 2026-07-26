import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';

/**
 * M5.1 — طبقة تجريد للتخزين (StorageService).
 * الحالي: قرص محلي. لاحقًا يمكن استبداله بـS3 دون تغيير مستدعياته.
 */
export interface StorageService {
  save(key: string, data: Buffer): Promise<void>;
  /** H4.5 — ينقل ملفًا مرفوعًا من مسار مؤقّت بلا تحميله في الذاكرة */
  saveFromFile(key: string, sourcePath: string): Promise<void>;
  read(key: string): Promise<Buffer>;
  /** H4.5 — تدفّق للقراءة (تنزيل بلا تحميل الملف كاملًا في الـheap) */
  createReadStream(key: string): Readable;
  delete(key: string): Promise<void>;
}

class LocalDiskStorage implements StorageService {
  constructor(private readonly baseDir: string) {}

  private resolveKey(key: string): string {
    // منع الهروب من مجلد التخزين عبر المسارات النسبية
    const full = path.resolve(this.baseDir, key);
    if (!full.startsWith(path.resolve(this.baseDir))) {
      throw new Error('Invalid storage key');
    }
    return full;
  }

  async save(key: string, data: Buffer): Promise<void> {
    const full = this.resolveKey(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }

  /**
   * H4.5 — ينقل الملف المؤقّت إلى مكانه النهائي. `rename` فوري بلا نسخ عندما
   * يكون الطرفان على نفس القرص؛ وإلا نعود إلى نسخ متدفّق (لا قراءة كاملة للذاكرة).
   */
  async saveFromFile(key: string, sourcePath: string): Promise<void> {
    const full = this.resolveKey(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    try {
      await fs.rename(sourcePath, full);
    } catch {
      // أقراص/أقسام مختلفة (EXDEV) — انسخ ثم احذف المصدر
      await fs.copyFile(sourcePath, full);
      await fs.rm(sourcePath, { force: true });
    }
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(this.resolveKey(key));
  }

  createReadStream(key: string): Readable {
    return createReadStream(this.resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolveKey(key), { force: true });
  }
}

const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(process.cwd(), 'uploads');

export const storage: StorageService = new LocalDiskStorage(uploadsDir);
