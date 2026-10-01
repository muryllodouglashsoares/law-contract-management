import { defineConfig } from 'vitest/config';

/**
 * Estratégia de testes:
 *  - Testes unitários (tests/unit) não tocam o banco: services recebem
 *    um PrismaClient "fake" por injeção de dependência.
 *  - Testes de integração (tests/integration) sobem a aplicação via
 *    app.inject() (sem porta TCP real) e usam um banco de TESTE dedicado
 *    (nunca o banco de desenvolvimento/produção). Veja o README para
 *    instruções de como criar e migrar `lexcontract_test` localmente.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
    // Roda os arquivos de teste sequencialmente: os testes de integração
    // compartilham o mesmo banco de teste e limpam tabelas entre execuções,
    // então paralelizar arquivos poderia causar condição de corrida.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      PORT: '3334',
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/lexcontract_test?schema=public',
      JWT_SECRET: 'test-only-secret-please-do-not-use-in-any-real-environment',
      JWT_EXPIRES_IN: '1h',
      CORS_ORIGIN: 'http://localhost:5173',
      LOG_LEVEL: 'silent',
      // Alto o bastante para os testes de integração (que fazem muitos logins do mesmo IP)
      // não esbarrarem no limite; o teste de rate limit usa buildApp({ loginRateLimit }).
      LOGIN_RATE_LIMIT_MAX: '1000',
      LOGIN_RATE_LIMIT_WINDOW: '1 minute',
      // Aceite eletrônico: origem pública fixa nos testes + rate limit alto (muitas requisições do mesmo IP);
      // os testes de rate limit usam buildApp({ publicSignatureRateLimit }).
      PUBLIC_APP_URL: 'https://app.lexcontract.test',
      PUBLIC_SIGNATURE_EXPIRATION_HOURS: '72',
      PUBLIC_SIGNATURE_RATE_LIMIT_MAX: '1000',
      PUBLIC_SIGNATURE_RATE_LIMIT_WINDOW: '1 minute',
      // Testes sempre usam o driver local (nunca um bucket real); arquivos ficam fora de ./uploads.
      STORAGE_DRIVER: 'local',
      UPLOADS_DIR: './uploads-test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
    },
  },
});
