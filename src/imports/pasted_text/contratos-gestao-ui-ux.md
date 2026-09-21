# DESIGN UI/UX — SISTEMA DE GESTÃO DE CONTRATOS JURÍDICOS

Crie no Figma a arquitetura visual completa de um sistema SaaS profissional para **gestão de contratos de prestação de serviços jurídicos**, voltado para advogados autônomos e pequenos escritórios.

IMPORTANTE:

Este trabalho é exclusivamente de **UX/UI, arquitetura visual e prototipação**.

NÃO implemente backend, banco de dados, API ou lógica de programação.

O objetivo é produzir um **modelo visual completo e consistente do produto**, que posteriormente será implementado em React/TypeScript e integrado a uma API própria.

---

# 1. CONCEITO DO PRODUTO

O sistema deve resolver um problema real de operação de advogados:

Centralizar clientes, modelos de contrato, criação de contratos, documentos, pagamentos, prazos, status e histórico em um único ambiente.

O sistema não deve parecer um simples CRUD.

Deve transmitir a sensação de um **software SaaS profissional utilizado diariamente por um advogado**.

A experiência deve transmitir:

* confiança;
* organização;
* segurança;
* profissionalismo;
* clareza;
* eficiência;
* sofisticação;
* controle.

Evite excesso de elementos decorativos.

Priorize informação, hierarquia visual e produtividade.

---

# 2. DIREÇÃO VISUAL

Crie uma interface:

* moderna;
* premium;
* minimalista;
* profissional;
* sofisticada;
* limpa;
* orientada à produtividade.

Referência conceitual:

**SaaS B2B premium + software jurídico moderno.**

Evite:

* aparência de template genérico;
* excesso de gradientes;
* excesso de glassmorphism;
* cores muito vibrantes;
* estética excessivamente corporativa;
* excesso de cards;
* interfaces visualmente carregadas.

A interface deve parecer um produto que poderia ser comercializado.

---

# 3. PALETA

Utilize uma paleta sóbria.

Base:

* branco;
* off-white;
* cinza muito claro;
* cinza médio;
* grafite;
* azul-marinho ou azul profundo como cor principal.

Utilize cores semânticas apenas quando necessário:

* verde → sucesso/ativo/pago;
* amarelo → atenção/pendente;
* vermelho → erro/atrasado/cancelado;
* azul → informação/em andamento.

Não transforme a interface em um arco-íris.

---

# 4. TIPOGRAFIA

Utilize uma família tipográfica moderna e altamente legível.

Priorize:

* excelente legibilidade;
* hierarquia clara;
* números fáceis de visualizar;
* tabelas fáceis de escanear.

Defina:

* Display;
* H1;
* H2;
* H3;
* Body;
* Small;
* Caption;
* Label.

Mantenha uma escala tipográfica consistente em todo o produto.

---

# 5. LAYOUT PRINCIPAL

O sistema deve utilizar uma estrutura de aplicação SaaS.

Desktop:

```text
┌──────────────────────────────────────────────────────┐
│                     TOPBAR                           │
├───────────────┬──────────────────────────────────────┤
│               │                                      │
│   SIDEBAR     │              CONTENT                 │
│               │                                      │
│               │                                      │
│               │                                      │
└───────────────┴──────────────────────────────────────┘
```

Sidebar contendo:

### Principal

* Dashboard
* Clientes
* Contratos
* Modelos
* Documentos
* Pagamentos

### Gestão

* Notificações
* Histórico

### Sistema

* Configurações

Na parte inferior:

* perfil do usuário;
* nome;
* função;
* menu de conta;
* logout.

---

# 6. DASHBOARD

Criar uma dashboard profissional.

A dashboard deve responder rapidamente:

**“Como está a operação do escritório?”**

Criar:

### Métricas principais

* Clientes
* Contratos ativos
* Contratos aguardando ação
* Pagamentos pendentes

### Visão dos contratos

Gráfico ou visualização mostrando contratos por status:

* Rascunho
* Enviado
* Em revisão
* Assinado
* Ativo
* Encerrado

### Próximos eventos

Lista de:

* vencimentos;
* pagamentos;
* contratos aguardando assinatura;
* documentos pendentes.

### Atividade recente

Exemplo:

```text
Contrato #102 foi criado
João Silva foi cadastrado
Contrato #98 foi assinado
Pagamento #45 foi registrado
```

Criar estados:

* carregando;
* vazio;
* erro;
* dados preenchidos.

---

# 7. CLIENTES

Criar página:

```text
Clientes
```

Com:

* título;
* descrição;
* botão “Novo cliente”;
* pesquisa;
* filtros;
* tabela/lista.

Colunas:

* Cliente;
* CPF/CNPJ;
* contato;
* contratos;
* status;
* última atividade;
* ações.

Criar:

### Modal/página Novo cliente

Campos:

* Nome completo/Razão social;
* CPF/CNPJ;
* Email;
* Telefone;
* Endereço;
* Observações.

Criar também uma **página individual do cliente**.

Ela deve mostrar:

```text
Cliente
├── Informações
├── Contratos
├── Documentos
├── Pagamentos
└── Histórico
```

---

# 8. MODELOS DE CONTRATO

Criar página:

```text
Modelos de contrato
```

Mostrar modelos em uma tabela ou lista organizada.

Exemplos:

* Prestação de Serviços Jurídicos;
* Consultoria Jurídica;
* Assessoria Jurídica;
* Contrato personalizado.

Cada modelo deve apresentar:

* nome;
* descrição;
* quantidade de utilizações;
* última atualização;
* status;
* ações.

Criar botão:

**Novo modelo**

---

# 9. EDITOR DE MODELO

Criar uma experiência visual para criação/edição de modelos.

O advogado deverá conseguir visualizar o conteúdo do contrato e utilizar variáveis.

Exemplo:

```text
CONTRATO DE PRESTAÇÃO DE SERVIÇOS JURÍDICOS

CONTRATANTE:
{{cliente.nome}}

CPF/CNPJ:
{{cliente.cpf}}

VALOR:
{{contrato.valor}}

DATA DE INÍCIO:
{{contrato.data_inicio}}
```

Criar uma área lateral com:

**Variáveis disponíveis**

```text
Cliente
{{cliente.nome}}
{{cliente.cpf}}
{{cliente.email}}

Contrato
{{contrato.valor}}
{{contrato.data_inicio}}
{{contrato.objeto}}

Advogado
{{advogado.nome}}
{{advogado.oab}}
```

O design deve deixar claro que as variáveis serão preenchidas automaticamente posteriormente.

---

# 10. CONTRATOS

Criar página:

```text
Contratos
```

Com:

* pesquisa;
* filtros;
* status;
* cliente;
* período;
* valor.

Tabela:

```text
Contrato
Cliente
Modelo
Status
Valor
Criado em
Atualizado em
Ações
```

Utilizar badges de status visualmente claros.

---

# 11. CRIAÇÃO DE CONTRATO

Criar um fluxo guiado.

Não fazer uma página gigantesca.

Utilizar um wizard/stepper:

```text
1. Cliente
   ↓
2. Modelo
   ↓
3. Informações
   ↓
4. Revisão
   ↓
5. Finalização
```

### Etapa 1

Selecionar cliente.

### Etapa 2

Selecionar modelo.

### Etapa 3

Preencher variáveis:

* valor;
* objeto;
* data de início;
* prazo;
* condições específicas.

### Etapa 4

Mostrar preview do contrato.

### Etapa 5

Mostrar resumo e ações:

* salvar rascunho;
* gerar contrato;
* gerar PDF.

---

# 12. DETALHES DO CONTRATO

Criar uma página individual extremamente bem estruturada.

Exemplo:

```text
Contrato #102

Prestação de Serviços Jurídicos
João da Silva

[Status: Ativo]
```

Criar áreas:

### Resumo

* cliente;
* valor;
* início;
* vencimento;
* modelo;
* responsável.

### Documento

Preview do PDF/documento.

### Status

Mostrar timeline:

```text
Criado
  ↓
Enviado
  ↓
Visualizado
  ↓
Assinado
  ↓
Ativo
```

### Pagamentos

Mostrar:

* valor total;
* pago;
* pendente;
* próximas parcelas.

### Histórico

Mostrar timeline de eventos.

---

# 13. PDF

Criar uma experiência para geração/visualização do PDF.

A interface deve permitir:

* visualizar;
* gerar;
* baixar;
* compartilhar/enviar posteriormente.

Criar estados para:

* gerando PDF;
* PDF pronto;
* erro de geração.

Não implementar a geração real.

Apenas criar a interface.

---

# 14. STATUS DO CONTRATO

Criar um sistema visual consistente para status.

Estados:

```text
Rascunho
Pronto para envio
Enviado
Em revisão
Assinado
Ativo
Encerrado
Cancelado
```

Utilizar:

* badges;
* timeline;
* indicadores;
* mensagens contextuais.

Não utilizar somente cores.

O status deve ser compreensível também por texto.

---

# 15. PAGAMENTOS

Criar página:

```text
Pagamentos
```

Mostrar:

* total recebido;
* total pendente;
* pagamentos atrasados;
* próximos vencimentos.

Tabela:

```text
Cliente
Contrato
Parcela
Valor
Vencimento
Status
Ações
```

Criar página/modal:

**Registrar pagamento**

Campos:

* valor;
* data;
* método;
* observação.

---

# 16. DOCUMENTOS

Criar uma área de documentos.

Mostrar:

* nome;
* tipo;
* cliente;
* contrato;
* tamanho;
* data;
* ações.

Permitir visualmente:

* upload;
* preview;
* download;
* exclusão.

Criar estados de:

* upload;
* sucesso;
* erro;
* arquivo inválido.

---

# 17. NOTIFICAÇÕES

Criar centro de notificações.

Exemplos:

```text
Contrato aguardando assinatura

Pagamento vence amanhã

Contrato vence em 30 dias

Novo documento adicionado
```

Criar:

* não lida;
* lida;
* prioridade;
* data.

---

# 18. HISTÓRICO / AUDITORIA

Criar uma experiência de timeline.

Exemplo:

```text
21/09/2026 — 14:32

Muryllo criou o contrato #102

21/09/2026 — 14:40

Contrato enviado ao cliente

22/09/2026 — 09:12

Cliente visualizou o contrato

22/09/2026 — 10:02

Contrato assinado
```

O histórico deve transmitir rastreabilidade.

---

# 19. CONFIGURAÇÕES

Criar página:

```text
Configurações
```

Seções:

### Perfil

* nome;
* email;
* telefone;
* foto.

### Escritório

* nome;
* CPF/CNPJ;
* endereço;
* informações profissionais;
* OAB.

### Segurança

* alterar senha;
* sessões;
* autenticação.

### Preferências

* notificações;
* aparência;
* idioma.

---

# 20. AUTENTICAÇÃO

Criar as telas:

### Login

* email;
* senha;
* lembrar acesso;
* recuperar senha.

### Recuperação

Fluxo de recuperação de senha.

### Primeiro acesso

Criar uma experiência inicial simples.

---

# 21. RESPONSIVIDADE

O design deve ser pensado desde o início para:

### Desktop

Experiência principal.

### Tablet

Sidebar adaptável.

### Mobile

Transformar a sidebar em menu/drawer.

Tabelas devem se adaptar para:

* cards;
* listas;
* scroll horizontal quando necessário.

Não simplesmente diminuir elementos.

Redesenhe a hierarquia para telas pequenas.

---

# 22. ESTADOS DA INTERFACE

Para cada tela importante, criar:

### Normal

Dados preenchidos.

### Loading

Skeletons adequados.

### Empty

Mensagem explicativa + ação principal.

### Error

Mensagem clara + possibilidade de tentar novamente.

### Success

Feedback visual.

### Disabled

Elementos indisponíveis.

Isso é obrigatório.

---

# 23. DESIGN SYSTEM

Crie uma página específica no Figma chamada:

```text
Design System
```

Defina:

### Cores

* Primary
* Secondary
* Background
* Surface
* Border
* Text
* Muted
* Success
* Warning
* Error
* Info

### Tipografia

Todos os níveis hierárquicos.

### Componentes

* Button
* Input
* Select
* Checkbox
* Radio
* Textarea
* Badge
* Card
* Table
* Modal
* Drawer
* Dropdown
* Tooltip
* Toast
* Alert
* Tabs
* Pagination
* Breadcrumb
* Avatar
* Skeleton
* Empty State

Utilize componentes reutilizáveis e variantes.

---

# 24. ACESSIBILIDADE

A interface deve ser projetada considerando:

* contraste adequado;
* foco visível;
* tamanho adequado dos elementos;
* navegação por teclado;
* labels claros;
* mensagens de erro compreensíveis;
* não depender exclusivamente de cores;
* hierarquia semântica.

---

# 25. MICROINTERAÇÕES

Utilizar animações discretas.

Exemplos:

* hover;
* abertura de modal;
* mudança de status;
* toast;
* loading;
* transição de páginas;
* confirmação de ações.

Evite animações exageradas.

O sistema deve parecer rápido e profissional.

---

# 26. PROTÓTIPO

Crie protótipo navegável entre as principais telas.

Fluxo principal:

```text
Login
 ↓
Dashboard
 ↓
Clientes
 ↓
Cliente
 ↓
Contratos
 ↓
Novo contrato
 ↓
Selecionar cliente
 ↓
Selecionar modelo
 ↓
Preencher informações
 ↓
Revisão
 ↓
Contrato criado
 ↓
Detalhes do contrato
 ↓
PDF
 ↓
Status
 ↓
Histórico
```

Crie também fluxos secundários:

```text
Dashboard
 ↓
Pagamentos

Dashboard
 ↓
Notificações

Clientes
 ↓
Documentos

Contratos
 ↓
Histórico
```

---

# 27. NAVEGAÇÃO

A navegação deve ser consistente.

O usuário deve sempre saber:

* onde está;
* como chegou ali;
* qual é a próxima ação;
* como voltar.

Utilize breadcrumbs quando fizer sentido.

---

# 28. PRINCÍPIO DE UX

Priorize as ações mais importantes do advogado.

O sistema deve reduzir:

* cliques desnecessários;
* procura por informações;
* formulários excessivamente longos;
* duplicação de informações.

Quando um dado já existir no sistema, a interface deve sugerir/reutilizar esse dado.

Exemplo:

Ao criar um contrato para João Silva, os dados do cliente devem ser automaticamente utilizados no preenchimento do contrato.

---

# 29. RESULTADO ESPERADO

Ao finalizar, quero um arquivo Figma que funcione como o **blueprint visual completo do produto**.

Ele deve conter:

```text
Design System
        ↓
Componentes
        ↓
Layouts
        ↓
Telas
        ↓
Estados
        ↓
Fluxos
        ↓
Protótipo navegável
```

O resultado deve parecer um produto SaaS real, comercializável e pronto para ser implementado.

Não crie apenas telas isoladas.

Crie um **sistema visual consistente**.

---

# 30. IMPORTANTE SOBRE IMPLEMENTAÇÃO FUTURA

A implementação posterior será feita separando:

```text
FRONTEND
React + TypeScript
        ↓
API
        ↓
BACKEND
Node + Fastify + TypeScript
        ↓
PostgreSQL + Prisma
```

Portanto, o design deve ser estruturado de maneira que cada tela possua:

* estados previsíveis;
* formulários bem definidos;
* dados claramente identificáveis;
* ações claras;
* componentes reutilizáveis.

Não invente dados de negócio complexos apenas para preencher a interface.

Utilize dados fictícios apenas como conteúdo visual de demonstração.

O foco desta etapa é construir a **experiência e arquitetura visual do produto**, deixando a implementação técnica para uma etapa posterior.
