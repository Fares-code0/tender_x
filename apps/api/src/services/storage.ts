import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * M5.1 — طبقة تجريد للتخزين (StorageService).
 * الحالي: قرص محلي. لاحقًا يمكن استبداله بـS3 دون تغيير مستدعياته.
 */
export interface StorageService {
  save(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
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

  async read(key: string): Promise<Buffer> {
    return fs.readFile(this.resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolveKey(key), { force: true });
  }
}

const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(process.cwd(), 'uploads');

export const storage: StorageService = new LocalDiskStorage(uploadsDir);
