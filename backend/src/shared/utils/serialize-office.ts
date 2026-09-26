import type { Office } from '@prisma/client';

export interface PublicOffice {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  document: string;
  address: string | null;
  specialties: string | null;
}

export function toPublicOffice(office: Office): PublicOffice {
  return {
    id: office.id,
    name: office.name,
    email: office.email,
    phone: office.phone,
    document: office.document,
    address: office.address,
    specialties: office.specialties,
  };
}
