import 'dotenv/config';
import { z } from 'zod';

/**
 * Schema das variáveis de ambiente da aplicação.
 * Qualquer variável obrigatória ausente ou inválida faz a aplicação
 * falhar imediatamente na inicialização, com uma mensagem clara.
 */
/** String opcional: valor vazio (ex.: `S3_BUCKET=` no .env) conta como ausente. */
const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

const NEON_S3_REQUIRED_VARS = [
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
] as const;

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

  CORS_ORIGIN: z
  .string()
  .default('http://localhost:5173')
  .transform((val) => val.split(',').map((o) => o.trim()).filter(Boolean)),

  // Rate limit de POST /auth/login (por IP). Aceita a janela no formato do
  // @fastify/rate-limit: número em ms ("60000") ou texto ("1 minute", "30 seconds").
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  LOGIN_RATE_LIMIT_WINDOW: z
    .string()
    .trim()
    .regex(/^\d+(\s*[a-zA-Z]+)?$/, 'Use um valor como "1 minute", "30 seconds" ou "60000" (ms)')
    .default('1 minute'),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  // Driver de armazenamento de documentos (ver src/shared/storage/).
  //  - local   → disco (desenvolvimento/testes). EFÊMERO em containers como o do Render.
  //  - neon-s3 → Neon Object Storage (API S3-compatible, bucket privado). Use em produção.
  // A escolha é sempre explícita: nada muda de driver "por conta própria" conforme NODE_ENV.
  STORAGE_DRIVER: z.enum(['local', 'neon-s3']).default('local'),

  // Diretório do driver `local`.
  UPLOADS_DIR: z.string().default('./uploads'),

  // Credenciais do driver `neon-s3`. Existem SOMENTE no backend (env vars do Render);
  // são obrigatórias apenas quando STORAGE_DRIVER=neon-s3 (validado no superRefine abaixo).
  S3_ENDPOINT: optionalString,
  S3_REGION: optionalString,
  S3_BUCKET: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  // Endpoints S3-compatible costumam exigir path-style (https://host/bucket/key).
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  // Segredo do job interno (POST /internal/jobs/*), chamado pelo GitHub Actions.
  // Opcional: sem ele o endpoint fica DESABILITADO (404). Gere com:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  CRON_SECRET: optionalString.refine((value) => value === undefined || value.length >= 32, {
    message: 'CRON_SECRET deve ter pelo menos 32 caracteres',
  }),

  // Origem pública do frontend, usada para montar o link de aceite eletrônico
  // (`<PUBLIC_APP_URL>/assinar/<token>`). Nunca é derivada do header Host.
  PUBLIC_APP_URL: optionalString
    .refine((value) => value === undefined || /^https?:\/\/[^\s/]+(:\d+)?$/.test(value.replace(/\/+$/, '')), {
      message: 'PUBLIC_APP_URL deve ser uma origem http(s), ex.: https://app.exemplo.com',
    })
    .transform((value) => (value ? value.replace(/\/+$/, '') : undefined)),

  // Validade do link de aceite eletrônico, em horas (padrão: 72h = 3 dias).
  PUBLIC_SIGNATURE_EXPIRATION_HOURS: z.coerce.number().int().positive().max(24 * 90).default(72),

  // Rate limit (por IP) dos endpoints públicos de aceite: GET e POST do link.
  PUBLIC_SIGNATURE_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  PUBLIC_SIGNATURE_RATE_LIMIT_WINDOW: z
    .string()
    .trim()
    .regex(/^\d+(\s*[a-zA-Z]+)?$/, 'Use um valor como "1 minute", "30 seconds" ou "60000" (ms)')
    .default('1 minute'),

  // Tamanho máximo de upload de um documento, em bytes. Mantido alinhado
  // com o texto já exibido na tela de Documentos ("Máx. 10 MB por arquivo").
  MAX_UPLOAD_SIZE_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
}).superRefine((config, ctx) => {
  if (config.STORAGE_DRIVER !== 'neon-s3') return;

  for (const name of NEON_S3_REQUIRED_VARS) {
    if (!config[name]) {
      ctx.addIssue({
        code: 'custom',
        path: [name],
        message: `${name} é obrigatória quando STORAGE_DRIVER=neon-s3`,
      });
    }
  }
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

if (env.NODE_ENV === 'production' && !env.PUBLIC_APP_URL) {
  // eslint-disable-next-line no-console
  console.warn('⚠️  PUBLIC_APP_URL não definida: a geração de links de aceite eletrônico ficará indisponível.');
}

if (env.NODE_ENV === 'production' && env.STORAGE_DRIVER === 'local') {
  // eslint-disable-next-line no-console
  console.warn(
    '⚠️  STORAGE_DRIVER=local em produção: o disco do container é efêmero e os documentos serão perdidos em deploy/restart. Use STORAGE_DRIVER=neon-s3.',
  );
}
