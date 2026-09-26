import type { Office, PrismaClient } from '@prisma/client';

import { NotFoundError } from '../../shared/errors';
import type { UpdateOfficeBody } from './office.schemas';

export class OfficeService {
  constructor(private readonly prisma: Pick<PrismaClient, 'office'>) {}

  async getById(officeId: string): Promise<Office> {
    const office = await this.prisma.office.findUnique({ where: { id: officeId } });

    if (!office) {
      throw new NotFoundError('Escritório não encontrado');
    }

    return office;
  }

  /** Apenas ADMIN pode editar os dados do escritório (verificado na rota via requireRole). */
  async update(officeId: string, data: UpdateOfficeBody): Promise<Office> {
    await this.getById(officeId);

    return this.prisma.office.update({ where: { id: officeId }, data });
  }
}
