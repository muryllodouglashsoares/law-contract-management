/** Validação de CPF/CNPJ (dígitos verificadores). Código próprio, sem dependências. */

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function allSame(digits: string): boolean {
  return /^(\d)\1+$/.test(digits);
}

export function isValidCpf(input: string): boolean {
  const cpf = onlyDigits(input);
  if (cpf.length !== 11 || allSame(cpf)) return false;

  const check = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return check(9) === Number(cpf[9]) && check(10) === Number(cpf[10]);
}

export function isValidCnpj(input: string): boolean {
  const cnpj = onlyDigits(input);
  if (cnpj.length !== 14 || allSame(cnpj)) return false;

  const check = (length: number): number => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cnpj[i]) * (weights[i] ?? 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  return check(12) === Number(cnpj[12]) && check(13) === Number(cnpj[13]);
}

export function isValidCpfOrCnpj(input: string): boolean {
  return isValidCpf(input) || isValidCnpj(input);
}

/** Mascara um documento para exibição interna: só os 2 últimos dígitos ficam visíveis. */
export function maskDocument(digits: string): string {
  if (digits.length <= 2) return digits;
  return `${'*'.repeat(digits.length - 2)}${digits.slice(-2)}`;
}
