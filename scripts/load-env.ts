/* Muat .env ke process.env untuk skrip CLI (tsx tidak memuat .env otomatis). */
import { readFileSync } from 'node:fs';
import path from 'node:path';

for (const name of ['.env.local', '.env']) {
  try {
    const txt = readFileSync(path.join(process.cwd(), name), 'utf8');
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* file tidak ada — lewati */
  }
}
