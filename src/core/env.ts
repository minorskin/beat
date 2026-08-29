/** .env'i yalnızca yerelde yükler; CI'da değişkenler zaten ortamda. */
import { config } from 'dotenv';
config();

export function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Ortam değişkeni eksik: ${name}`);
  return v;
}
