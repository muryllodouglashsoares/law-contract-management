import type { FastifyInstance } from 'fastify';

import { authenticate } from '../../shared/auth/authenticate';
import { requireRole } from '../../shared/auth/require-role';
import { validate } from '../../shared/http/validate';
import { contractSignatureController } from '../contract-signatures/contract-signature.controller';
import { contractController } from './contract.controller';
import {
  contractIdParamsSchema,
  createContractBodySchema,
  generateContractPdfBodySchema,
  listContractsQuerySchema,
  updateContractBodySchema,
  updateContractStatusBodySchema,
  type ContractIdParams,
  type CreateContractBody,
  type GenerateContractPdfBody,
  type ListContractsQuery,
  type UpdateContractBody,
  type UpdateContractStatusBody,
} from './contract.schemas';

export async function contractRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: ListContractsQuery }>(
    '/',
    { preHandler: [authenticate, validate({ querystring: listContractsQuerySchema })] },
    contractController.list,
  );

  app.get<{ Params: ContractIdParams }>(
    '/:id',
    { preHandler: [authenticate, validate({ params: contractIdParamsSchema })] },
    contractController.getById,
  );

  app.get<{ Params: ContractIdParams }>(
    '/:id/versions',
    { preHandler: [authenticate, validate({ params: contractIdParamsSchema })] },
    contractController.listVersions,
  );

  // Gerar o PDF não altera o contrato (só materializa uma versão já existente),
  // então segue a mesma regra do upload de documentos: qualquer usuário
  // autenticado do escritório. O isolamento por officeId é feito no service.
  app.post<{ Params: ContractIdParams; Body: GenerateContractPdfBody }>(
    '/:id/pdf',
    {
      preHandler: [
        authenticate,
        validate({ params: contractIdParamsSchema, body: generateContractPdfBodySchema }),
      ],
    },
    contractController.generatePdf,
  );

  // Criar, editar e mudar o status de um contrato (enviar, assinar, ativar,
  // encerrar...) é o núcleo do trabalho jurídico — restrito a ADMIN/LAWYER.
  // ASSISTANT mantém leitura (list/getById/versions) acima, necessária para
  // acompanhar o andamento dos contratos no fluxo do escritório.
  app.post<{ Body: CreateContractBody }>(
    '/',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'LAWYER'), validate({ body: createContractBodySchema })],
    },
    contractController.create,
  );

  app.patch<{ Params: ContractIdParams; Body: UpdateContractBody }>(
    '/:id',
    {
      preHandler: [
        authenticate,
        requireRole('ADMIN', 'LAWYER'),
        validate({ params: contractIdParamsSchema, body: updateContractBodySchema }),
      ],
    },
    contractController.update,
  );

  app.patch<{ Params: ContractIdParams; Body: UpdateContractStatusBody }>(
    '/:id/status',
    {
      preHandler: [
        authenticate,
        requireRole('ADMIN', 'LAWYER'),
        validate({ params: contractIdParamsSchema, body: updateContractStatusBodySchema }),
      ],
    },
    contractController.updateStatus,
  );

  // Aceite eletrônico por link público de uso único. Gerar o link equivale a "enviar" o contrato
  // para assinatura — mesmo nível de permissão de mudar o status: ADMIN/LAWYER.
  app.post<{ Params: ContractIdParams }>(
    '/:id/signature-links',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'LAWYER'), validate({ params: contractIdParamsSchema })],
    },
    contractSignatureController.createLink,
  );

  // Histórico dos links/aceites (inclui IP do signatário) — também restrito a ADMIN/LAWYER.
  app.get<{ Params: ContractIdParams }>(
    '/:id/signatures',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'LAWYER'), validate({ params: contractIdParamsSchema })],
    },
    contractSignatureController.list,
  );
}
