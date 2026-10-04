import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * O workflow é só um `curl` agendado; estes testes impedem regressões que o quebrariam sem
 * ninguém notar (rota errada, segredo no YAML, dependência do CI). Sem biblioteca de YAML:
 * checagens de texto sobre o arquivo, que é pequeno e de estrutura fixa.
 */
const WORKFLOW_PATH = path.resolve(process.cwd(), '..', '.github', 'workflows', 'contract-renewal-cron.yml');
const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
const ci = readFileSync(path.resolve(process.cwd(), '..', '.github', 'workflows', 'ci.yml'), 'utf8');

describe('.github/workflows/contract-renewal-cron.yml', () => {
  it('estrutura básica: nome, gatilhos, job e step de execução', () => {
    expect(workflow).not.toMatch(/\t/); // YAML não aceita tabulação
    expect(workflow).toMatch(/^name: Contract renewal cron$/m);
    expect(workflow).toMatch(/^on:$/m);
    expect(workflow).toMatch(/^jobs:$/m);
    expect(workflow).toMatch(/^ {2}renewal-alerts:$/m);
    expect(workflow).toMatch(/runs-on: ubuntu-latest/);
    expect(workflow).toMatch(/timeout-minutes: \d+/);
  });

  it('roda diariamente às 11:00 UTC (08:00 BRT) e permite execução manual', () => {
    expect(workflow).toMatch(/schedule:\s*\n(?:\s*#.*\n)*\s*- cron: '0 11 \* \* \*'/);
    expect(workflow).toMatch(/^ {2}workflow_dispatch:/m);
  });

  it('chama o endpoint existente do job, via POST, sem criar outro sistema de cron', () => {
    expect(workflow).toContain('/internal/jobs/contract-renewal-alerts');
    expect(workflow).toMatch(/--request POST/);
    expect(workflow).toContain('${BACKEND_URL%/}/internal/jobs/contract-renewal-alerts');
  });

  it('autentica com Authorization: Bearer $CRON_SECRET', () => {
    expect(workflow).toMatch(/Authorization: Bearer %s/);
    expect(workflow).toMatch(/"\$CRON_SECRET"/);
  });

  it('usa curl com --fail, timeouts e retry; falha o workflow em erro HTTP', () => {
    expect(workflow).toMatch(/--fail(-with-body)?\b/);
    expect(workflow).toMatch(/--connect-timeout \d+/);
    expect(workflow).toMatch(/--max-time \d+/);
    expect(workflow).toMatch(/--retry \d+/);
    expect(workflow).toMatch(/exit 1/);
  });

  it('segredos vêm de GitHub Secrets e nunca ficam no YAML', () => {
    expect(workflow).toContain('BACKEND_URL: ${{ secrets.BACKEND_URL }}');
    expect(workflow).toContain('CRON_SECRET: ${{ secrets.CRON_SECRET }}');

    // Nada de valor literal para as variáveis (só a expressão ${{ secrets.* }}).
    expect(workflow).not.toMatch(/^\s+CRON_SECRET:\s*(?!\$\{\{ secrets\.CRON_SECRET \}\})\S/m);
    expect(workflow).not.toMatch(/^\s+BACKEND_URL:\s*(?!\$\{\{ secrets\.BACKEND_URL \}\})\S/m);
    // Nenhuma sequência hexadecimal longa (cara de segredo) nem URL concreta de backend.
    expect(workflow).not.toMatch(/\b[0-9a-f]{32,}\b/i);
    expect(workflow).not.toMatch(/onrender\.com|pages\.dev/);
  });

  it('nunca imprime o CRON_SECRET nem a URL do backend', () => {
    const lines = workflow.split('\n').filter((line) => !/^\s*#/.test(line));

    // Saída de log (echo) jamais expande o segredo, a URL base ou o endpoint montado.
    for (const line of lines.filter((l) => /^\s*echo\b/.test(l))) {
      expect(line).not.toMatch(/\$\{?(CRON_SECRET|BACKEND_URL|endpoint)\b/);
    }

    // Os únicos printf que tocam o segredo: a higienização da variável e o header enviado ao curl por stdin.
    for (const line of lines.filter((l) => /printf/.test(l) && /CRON_SECRET/.test(l))) {
      expect(line).toMatch(/^\s*CRON_SECRET="\$\(printf '%s'|header = "Authorization: Bearer %s"/);
    }

    expect(workflow).toMatch(/--config -/);
    expect(workflow).not.toMatch(/-H ['"]Authorization/); // o header não vai na linha de comando
    expect(workflow).not.toMatch(/\bset -x\b/);
  });

  it('é independente do CI: sem needs, workflow_run ou gatilhos de push/PR', () => {
    expect(workflow).not.toMatch(/^\s*needs:/m);
    expect(workflow).not.toMatch(/workflow_run/);
    expect(workflow).not.toMatch(/^\s*(push|pull_request):/m);
    expect(workflow).toMatch(/^permissions: \{\}$/m);
  });

  it('não conflita com o CI: grupos de concurrency distintos e CI sem gatilho agendado', () => {
    expect(workflow).toMatch(/group: contract-renewal-cron/);
    expect(ci).not.toMatch(/schedule:/);
    expect(ci).not.toMatch(/contract-renewal-cron/);
  });
});
