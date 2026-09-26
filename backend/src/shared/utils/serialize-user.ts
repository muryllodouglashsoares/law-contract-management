import type { User } from '@prisma/client';

/**
 * Formato público do usuário, retornado pela API.
 * IMPORTANTE: nunca inclua passwordHash aqui.
 */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  oabNumber: string | null;
  role: User['role'];
  status: User['status'];
  officeId: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    oabNumber: user.oabNumber,
    role: user.role,
    status: user.status,
    officeId: user.officeId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
