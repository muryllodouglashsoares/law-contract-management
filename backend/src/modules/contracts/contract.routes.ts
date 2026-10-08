import type { FastifyInstance } from 'fastify';

import { authenticate } from '../../shared/auth/authenticate';
import { requireContractAuthor } from '../../shared/auth/require-contract-author';
import { requireRole } from '../../shared/auth/require-role';
import { validate } from '../../shared/http/validate';
import { contractSignatureController, signedPdfService } from '../contract-signatures/contract-signature.controller';
import { createSignatureLinkBodySchema, type CreateSignatureLinkBody } from '../contract-signatures/contract-signature.schemas';
import { contractController } from './contract.controller';
import {
  contractIdParamsSchema,
  createContractBodySchema,
  generateContractPdfBodySchema,
  listContractsQuerySchema,
  rejectContractBodySchema,
  renewContractBodySchema,
  type RejectContractBody,
  type RenewContractBody,
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
      preHandler: [authenticate, requireContractAuthor, validate({ body: createContractBodySchema })],
    },
    contractController.create,
  );

  app.patch<{ Params: ContractIdParams; Body: UpdateContractBody }>(
    '/:id',
    {
      preHandler: [
        authenticate,
        requireContractAuthor,
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

  // Renovação em um clique: ADMIN/LAWYER. Cria nova versão e reinicia o ciclo de alertas.
  app.post<{ Params: ContractIdParams; Body: RenewContractBody }>(
    '/:id/renew',
    {
      preHandler: [
        authenticate,
        requireRole('ADMIN', 'LAWYER'),
        validate({ params: contractIdParamsSchema, body: renewContractBodySchema }),
      ],
    },
    contractController.renew,
  );

  // Revisão interna. submit-review: ADMIN/LAWYER/ASSISTANT (o service exige a aprovação habilitada e,
  // para ASSISTANT, ser o responsável). approve/reject: somente ADMIN/LAWYER.
  app.post<{ Params: ContractIdParams }>(
    '/:id/submit-review',
    { preHandler: [authenticate, validate({ params: contractIdParamsSchema })] },
    contractController.submitReview,
  );

  app.post<{ Params: ContractIdParams }>(
    '/:id/approve',
    { preHandler: [authenticate, requireRole('ADMIN', 'LAWYER'), validate({ params: contractIdParamsSchema })] },
    contractController.approve,
  );

  app.post<{ Params: ContractIdParams; Body: RejectContractBody }>(
    '/:id/reject',
    {
      preHandler: [
        authenticate,
        requireRole('ADMIN', 'LAWYER'),
        validate({ params: contractIdParamsSchema, body: rejectContractBodySchema }),
      ],
    },
    contractController.reject,
  );

  // Aceite eletrônico por link público de uso único. Gerar o link equivale a "enviar" o contrato
  // para assinatura — mesmo nível de permissão de mudar o status: ADMIN/LAWYER.
  app.post<{ Params: ContractIdParams; Body: CreateSignatureLinkBody | undefined }>(
    '/:id/signature-links',
    {
      preHandler: [
        authenticate,
        requireRole('ADMIN', 'LAWYER'),
        validate({ params: contractIdParamsSchema, body: createSignatureLinkBodySchema }),
      ],
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

  // PDF FINAL com o comprovante de aceite eletrônico (gerado sob demanda se ainda não existir).
  // Mesmo nível de acesso dos demais documentos do contrato: qualquer usuário do escritório.
  app.get<{ Params: ContractIdParams }>(
    '/:id/signed-pdf',
    { preHandler: [authenticate, validate({ params: contractIdParamsSchema })] },
    async (request, reply) => {
      const file = await signedPdfService.getSignedPdfForDownload(request.user.officeId, request.params.id, request.user.userId);
      reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`);
      reply.header('Cache-Control', 'private, no-store');
      reply.header('X-Content-Type-Options', 'nosniff');
      return reply.type(file.mimeType).send(file.stream);
    },
  );
}
