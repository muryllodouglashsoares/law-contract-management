import 'dotenv/config';
import { z } from 'zod';

import { parseEncryptionKey } from '../shared/security/two-factor';

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

const VAPID_VARS = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const;

/** Booleano vindo de variável de ambiente ("true"/"false"). */
const booleanEnv = (defaultValue: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(defaultValue)
    .transform((value) => value === 'true');

const EMAILJS_VARS = ['EMAILJS_SERVICE_ID', 'EMAILJS_TEMPLATE_ID', 'EMAILJS_PUBLIC_KEY', 'EMAILJS_PRIVATE_KEY'] as const;

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

  // Web Push (VAPID). Opcionais: sem elas o Web Push fica DESATIVADO (as notificações internas
  // continuam normais). Se uma for informada, as três são obrigatórias. Gere o par de chaves com:
  //   npx web-push generate-vapid-keys --json
  // A chave PRIVADA existe somente no backend; a pública é entregue ao frontend por
  // GET /notifications/push/status.
  VAPID_PUBLIC_KEY: optionalString,
  VAPID_PRIVATE_KEY: optionalString,
  // Contato do remetente exigido pelo padrão: `mailto:alguem@dominio` ou uma URL https.
  VAPID_SUBJECT: optionalString.refine(
    (value) => value === undefined || /^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(value),
    { message: 'VAPID_SUBJECT deve ser "mailto:email@dominio" ou uma URL https' },
  ),

  // Alertas automáticos (jobs diários chamados pelo GitHub Actions; ver internal-jobs).
  PAYMENT_ALERT_ENABLED: booleanEnv('true'),
  SIGNATURE_ALERT_ENABLED: booleanEnv('true'),
  // Link enviado e nunca aberto há mais de N horas.
  SIGNATURE_ALERT_NEVER_OPENED_HOURS: z.coerce.number().int().positive().max(24 * 30).default(24),
  // Link que expira em até N horas.
  SIGNATURE_ALERT_EXPIRING_HOURS: z.coerce.number().int().positive().max(24 * 30).default(24),

  // E-mail automático (opcional; nenhum serviço pago é obrigatório). Com EMAIL_ENABLED=false ou
  // EMAIL_PROVIDER=none o sistema continua funcional: apenas não envia e-mails.
  //   none    → nenhum envio (padrão)
  //   log     → NÃO envia; só registra no log que enviaria (desenvolvimento)
  //   emailjs → API REST do EmailJS (exige as 4 variáveis EMAILJS_*)
  EMAIL_ENABLED: booleanEnv('false'),
  EMAIL_PROVIDER: z.enum(['none', 'log', 'emailjs']).default('none'),
  EMAILJS_SERVICE_ID: optionalString,
  EMAILJS_TEMPLATE_ID: optionalString,
  EMAILJS_PUBLIC_KEY: optionalString,
  // Chave PRIVADA (accessToken) do EmailJS: somente no backend, nunca no frontend nem no Git.
  EMAILJS_PRIVATE_KEY: optionalString,

  // 2FA (TOTP). Chave de 32 bytes (hex de 64 caracteres ou base64) que criptografa os segredos
  // TOTP em repouso. Gere com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  // Em PRODUÇÃO, sem esta variável o 2FA fica INDISPONÍVEL (não há chave implícita). Trocar a chave
  // invalida os 2FA já configurados.
  TWO_FACTOR_ENCRYPTION_KEY: optionalString.refine((value) => value === undefined || parseEncryptionKey(value) !== null, {
    message: 'TWO_FACTOR_ENCRYPTION_KEY deve ter 32 bytes em hexadecimal (64 caracteres) ou base64',
  }),
  // Nome exibido no aplicativo autenticador.
  TWO_FACTOR_ISSUER: z.string().trim().min(1).max(60).default('LexContract'),

  // Tamanho máximo de upload de um documento, em bytes. Mantido alinhado
  // com o texto já exibido na tela de Documentos ("Máx. 10 MB por arquivo").
  MAX_UPLOAD_SIZE_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),

  // Sentry (somente captura de erros). Opcional: sem DSN o Sentry fica DESATIVADO e nada é enviado.
  // SENTRY_ENVIRONMENT assume NODE_ENV quando ausente (ver transform ao final do schema).
  SENTRY_DSN: optionalString,
  SENTRY_ENVIRONMENT: optionalString,
}).superRefine((config, ctx) => {
  if (config.STORAGE_DRIVER === 'neon-s3') {
    for (const name of NEON_S3_REQUIRED_VARS) {
      if (!config[name]) {
        ctx.addIssue({
          code: 'custom',
          path: [name],
          message: `${name} é obrigatória quando STORAGE_DRIVER=neon-s3`,
        });
      }
    }
  }

  // EmailJS é tudo-ou-nada: provider ativo sem credenciais falharia só no primeiro envio.
  if (config.EMAIL_PROVIDER === 'emailjs') {
    for (const name of EMAILJS_VARS) {
      if (!config[name]) {
        ctx.addIssue({ code: 'custom', path: [name], message: `${name} é obrigatória quando EMAIL_PROVIDER=emailjs` });
      }
    }
  }

  // Web Push é tudo-ou-nada: configuração parcial falharia só no primeiro envio.
  if (VAPID_VARS.some((name) => config[name])) {
    for (const name of VAPID_VARS) {
      if (!config[name]) {
        ctx.addIssue({
          code: 'custom',
          path: [name],
          message: `${name} é obrigatória quando o Web Push (VAPID) está configurado`,
        });
      }
    }
  }
}).transform((config) => ({
  ...config,
  SENTRY_ENVIRONMENT: config.SENTRY_ENVIRONMENT ?? config.NODE_ENV,
}));

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

if (env.NODE_ENV === 'production' && !env.VAPID_PUBLIC_KEY) {
  // eslint-disable-next-line no-console
  console.warn('⚠️  VAPID_* não definidas: o Web Push ficará desativado (notificações internas não são afetadas).');
}

if (env.NODE_ENV === 'production' && !env.TWO_FACTOR_ENCRYPTION_KEY) {
  // eslint-disable-next-line no-console
  console.warn('⚠️  TWO_FACTOR_ENCRYPTION_KEY não definida: o 2FA ficará INDISPONÍVEL (o login normal não é afetado).');
}

if (env.EMAIL_ENABLED && env.EMAIL_PROVIDER === 'none') {
  // eslint-disable-next-line no-console
  console.warn('⚠️  EMAIL_ENABLED=true com EMAIL_PROVIDER=none: nenhum e-mail automático será enviado.');
}
