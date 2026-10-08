import type { Payment } from '@prisma/client';

import { PAYMENT_METHOD_TO_API, derivePaymentDisplayStatus } from '../domain/status-map';
import { toMoneyNumber } from './money';

export type PaymentWithRelations = Payment & {
  contract: { id: string; number: number; client: { id: string; name: string } };
};

export interface PublicPayment {
  id: string;
  installmentNumber: number;
  installmentTotal: number;
  value: number;
  dueDate: string;
  status: string;
  method: string | null;
  paidAt: string | null;
  notes: string | null;
  /** Pix copia e cola. Exibir/copiar NÃO baixa a parcela: a confirmação é sempre manual. */
  pixCode: string | null;
  pixKey: string | null;
  pixInstructions: string | null;
  contract: { id: string; number: number; client: { id: string; name: string } };
  createdAt: string;
}

export function toPublicPayment(payment: PaymentWithRelations, now = new Date()): PublicPayment {
  return {
    id: payment.id,
    installmentNumber: payment.installmentNumber,
    installmentTotal: payment.installmentTotal,
    value: toMoneyNumber(payment.value),
    dueDate: payment.dueDate.toISOString(),
    status: derivePaymentDisplayStatus(payment.status, payment.dueDate, now),
    method: payment.method ? PAYMENT_METHOD_TO_API(payment.method) : null,
    paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
    notes: payment.notes,
    pixCode: payment.pixCode,
    pixKey: payment.pixKey,
    pixInstructions: payment.pixInstructions,
    contract: payment.contract,
    createdAt: payment.createdAt.toISOString(),
  };
}
