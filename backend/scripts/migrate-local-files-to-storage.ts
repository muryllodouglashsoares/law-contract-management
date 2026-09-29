/**
 * Copia os arquivos do disco local (UPLOADS_DIR) para o storage configurado
 * (STORAGE_DRIVER=neon-s3), PRESERVANDO as chaves gravadas em Document.storagePath.
 *
 * - Não destrutivo: nada é apagado do disco nem alterado no banco.
 * - Idempotente: objetos que já existem no destino são pulados; pode rodar de novo.
 * - Só faz sentido se você ainda tem os arquivos antigos (ex.: rodando local ou com
 *   disco persistente). Arquivos já perdidos no disco efêmero do Render não voltam;
 *   PDFs de contrato, porém, são regenerados sozinhos ao pedir "gerar PDF" de novo.
 *
 * Uso (na pasta backend, com as variáveis do storage de destino exportadas):
 *   npm run storage:migrate-local -- --dry-run
 *   npm run storage:migrate-local
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';

import { env } from '../src/config/env';
import { createStorageDriver } from '../src/shared/storage';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  if (env.STORAGE_DRIVER === 'local') {
    throw new Error('Defina STORAGE_DRIVER=neon-s3 (e as variáveis S3_*) para escolher o destino da migração.');
  }

  const target = createStorageDriver(env);
  const localRoot = path.resolve(env.UPLOADS_DIR);
  const prisma = new PrismaClient();
  const totals = { migrated: 0, alreadyThere: 0, missingLocally: 0, failed: 0 };

  try {
    const documents = await prisma.document.findMany({
      select: { id: true, storagePath: true, mimeType: true },
      orderBy: { createdAt: 'asc' },
    });

    for (const doc of documents) {
      try {
        if (await target.exists(doc.storagePath)) {
          totals.alreadyThere += 1;
          continue;
        }

        const localFile = path.resolve(localRoot, doc.storagePath);
        if (!localFile.startsWith(localRoot + path.sep) || !(await stat(localFile).catch(() => null))?.isFile()) {
          totals.missingLocally += 1;
          console.warn(`- sem arquivo local: ${doc.storagePath} (documento ${doc.id})`);
          continue;
        }

        if (!dryRun) {
          const body = await readFile(localFile);
          await target.save({ officeId: doc.storagePath.split('/')[0] ?? '', fileName: doc.storagePath, contentType: doc.mimeType, body, key: doc.storagePath });
        }
        totals.migrated += 1;
        console.log(`${dryRun ? '[dry-run] ' : ''}copiado: ${doc.storagePath}`);
      } catch (error) {
        totals.failed += 1;
        console.error(`! falhou: ${doc.storagePath} — ${String(error)}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\nResumo${dryRun ? ' (dry-run)' : ''}:`, totals);
  if (totals.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
