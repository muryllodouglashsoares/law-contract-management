import 'dotenv/config';
import { z } from 'zod';

/**
 * Schema das variáveis de ambiente da aplicação.
 * Qualquer variável obrigatória ausente ou inválida faz a aplicação
 * falhar imediatamente na inicialização, com uma mensagem clara.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  PORT: z.coerce.number().int().positive().default(3333),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL é obrigatória')
    .refine((url) => url.startsWith('postgresql://') || url.startsWith('postgres://'), {
      message: 'DATABASE_URL deve ser uma connection string do PostgreSQL',
    }),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET é obrigatória e deve ter pelo menos 16 caracteres'),

  JWT_EXPIRES_IN: z.string().default('1d'),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  // Diretório onde os arquivos de documentos ficam armazenados em disco
  // (desenvolvimento). Ver src/shared/storage/local-file-storage.ts.
  UPLOADS_DIR: z.string().default('./uploads'),

  // Tamanho máximo de upload de um documento, em bytes. Mantido alinhado
  // com o texto já exibido na tela de Documentos ("Máx. 10 MB por arquivo").
  MAX_UPLOAD_SIZE_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('❌ Configuração de ambiente inválida. Verifique seu arquivo .env:\n');
    for (const issue of parsed.error.issues) {
      // eslint-disable-next-line no-console
      console.error(`  • ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();
