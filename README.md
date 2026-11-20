# PetHealthPD

Sistema de gestão para clínica veterinária (Electron + Prisma).

## Status da migração para MySQL — Etapa 4 + complementos das Etapas 5 a 7 + Etapas 8 e 9

> **A migração foi preparada/regenerada e validada offline, mas NÃO foi aplicada
> a nenhum banco de dados.** Não havia MySQL, `DATABASE_URL`, `.env` ou cliente
> `mysql` neste ambiente. O arquivo `prisma/dev.db` permanece vazio (0 bytes) e
> intacto. Nenhuma migração foi aplicada até aqui.
>
> **Complemento da Etapa 5:** o modelo `Consulta` passou a persistir duração e
> auditoria de cancelamento/conclusão, com índices compostos para a agenda. Como
> a migração inicial ainda não tinha sido aplicada, o `migration.sql` daquela
> mesma pasta foi **regenerado** com `prisma migrate diff --from-empty
> --to-schema-datamodel prisma/schema.prisma --script` e os CHECKs manuais foram
> reaplicados no cabeçalho/rodapé do arquivo.
>
> **Complemento da Etapa 6:** o modelo `Consulta` passou a persistir o prontuário
> textual (exame clínico, diagnóstico e conduta) e as medições de peso e
> temperatura aferidas na consulta. Como a migração inicial ainda não foi
> aplicada, o `migration.sql` foi **regenerado novamente** com o mesmo comando
> `prisma migrate diff`, e os CHECKs manuais — inclusive os dois novos — foram
> reaplicados no cabeçalho/rodapé. Nenhuma tabela nova foi criada.
>
> **Complemento da Etapa 7:** foi acrescentado o modelo `RegistroVacina` (pet,
> aplicador, consulta opcional, lote, validade, dose e próxima dose informada).
> A migração inicial foi **regenerada mais uma vez** — continua sendo apenas um
> arquivo versionado, nunca aplicado — e agora contém 8 tabelas e 13 CHECKs
> manuais (os 10 anteriores + 3 da vacinação). O Prisma Client foi gerado
> novamente apenas com uma `DATABASE_URL` fictícia na sessão do comando; nenhum
> banco foi contatado.
>
> **Etapa 8:** o estoque reaproveitou os modelos `Produto` e `Lote`, que já
> existiam desde a Etapa 4. Uma revisão específica confirmou que **nenhuma
> alteração de schema, migração ou Prisma Client foi necessária**: índices,
> CHECKs e tipos nativos atendem ao escopo aprovado (cadastro e listagem).
>
> **Etapa 9:** o stub `Anexo` (usado apenas como barreira de exclusão do pet)
> foi evoluído para `AnexoClinico`, com responsável, consulta opcional,
> metadados do arquivo, auditoria e inativação lógica. A migração inicial foi
> **regenerada novamente** — continua única e nunca aplicada — e agora contém
> 8 tabelas e 19 CHECKs. O Prisma Client foi gerado com `DATABASE_URL` fictícia
> apenas na sessão do comando; nenhum banco foi contatado.

Artefatos preparados:

- `prisma/schema.prisma` — provider `mysql`, 8 modelos, tipos nativos, integridade e auditoria.
- `prisma/migrations/20261119163348_init_mysql/migration.sql` — migração inicial versionada (19 CHECKs manuais).
- `.env.example` — modelo de configuração (sem segredo real).
- `src/shared/` — contratos `Api`, canais IPC, constantes, validadores e erros em pt-BR.
- `src/main/repositories/` — projeções explícitas (`ClientePet`, `Consulta`, `Usuario`, `Vacina`, `Estoque`, `Anexo`).
- `src/main/services/` — autorização por perfil e regras de domínio (`Auth`, `Sessao`, `ClientePet`, `Consulta`, `Vacina`, `Estoque`, `Anexo`, `AnexoArquivo`).
- `src/main/ipc/` — whitelist de canais, handlers tipados e helper `invocar`.
- `src/main/preload.ts` — superfície `Api` exposta ao renderer via `contextBridge`.
- `src/renderer/` — módulos Bootstrap 5 locais: agenda, clientes, pets, prontuário, vacinação, estoque e anexos.

## Pré-requisitos

- MySQL **8.0.16 ou superior** (necessário para `CHECK` constraints aplicadas).
- Node.js e as dependências instaladas (`npm install`).

## 1. Configurar `DATABASE_URL`

Escolhemos `.env.example` **na raiz do projeto** (e não em `prisma/`) porque o
Prisma CLI carrega automaticamente o `.env` da raiz, e o script `seed:admin`
também é executado a partir da raiz. Assim há uma única fonte de configuração.

```powershell
Copy-Item .env.example .env
# Edite .env e substitua usuario/senha/pethealthpd pelos valores reais.
```

O processo principal carrega o `.env` explicitamente em
`src/main/config/carregarEnv.ts`: o Prisma CLI lê o arquivo sozinho, mas o
Prisma Client (usado pelo Electron e pelo `seed:admin`) **não**. Sem esse
carregamento, o cadastro falha mesmo com o `.env` correto. Variáveis já
definidas no shell têm precedência sobre o arquivo.

Exemplo de valor (somente ilustração):

```text
DATABASE_URL="mysql://pethealthpd:<senha-forte>@localhost:3306/pethealthpd"
```

Regras:

- `.env` é ignorado pelo Git (entrada `.env` no `.gitignore`); nunca commite.
- A senha do banco **nunca** deve chegar ao renderer/preload nem a logs.
- Convenção de fuso horário: todo `DATETIME` é gravado em **UTC** pela
  aplicação; a formatação pt-BR acontece apenas na interface. Datas civis
  (`YYYY-MM-DD`, sem hora) são derivadas de `America/Sao_Paulo` em
  `src/shared/datas.ts`; colunas `@db.Date` continuam ancoradas em UTC para
  preservar o dia civil no banco.

## 2. Preparar o banco no MySQL (uma vez)

Use um usuário administrador apenas para criar o schema; a aplicação deve usar
um usuário com **menor privilégio** (somente DML):

```sql
CREATE DATABASE pethealthpd
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER 'pethealthpd_app'@'localhost' IDENTIFIED BY '<senha-forte>';
GRANT SELECT, INSERT, UPDATE, DELETE ON pethealthpd.* TO 'pethealthpd_app'@'localhost';
FLUSH PRIVILEGES;
```

> O `ENGINE=InnoDB` e o charset `utf8mb4 / utf8mb4_unicode_ci` já estão
> explícitos na migração. O collation escolhido preserva corretamente acentos
> e caixa em português do Brasil.

## 3. Aplicar a migração (quando houver MySQL)

```powershell
npx prisma migrate status
npx prisma migrate deploy
npx prisma generate
```

`migrate deploy` aplica apenas migrações versionadas e não cria migrações
novas. Não use `prisma migrate dev` em produção (ele pode criar migrações e
recriar o banco).

Para inspecionar o SQL sem aplicar:

```powershell
$env:DATABASE_URL = 'mysql://usuario:senha@localhost:3306/pethealthpd'
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

## 4. Criar o primeiro administrador

```powershell
$env:PHD_ADMIN_NOME = 'Administrador da Clínica'
$env:PHD_ADMIN_EMAIL = 'admin@clinica.local'
$env:PHD_ADMIN_SENHA = '<senha-forte-definida-pelo-administrador>'
npm run seed:admin
```

As três variáveis também podem ser preenchidas no `.env` local — o script
carrega o arquivo antes de criar o `PrismaClient`. Não existe senha padrão. Se o
e-mail já estiver cadastrado, a conta é promovida a `ADMIN` e reativada,
mantendo a senha anterior.

> **Não confunda os cadastros:** o formulário da tela inicial cria apenas
> `ATENDENTE`. Para entrar como administrador, use a conta do `seed:admin`.

## 5. Build e validação offline

```powershell
$env:DATABASE_URL = 'mysql://user:pass@localhost:3306/pethealthpd'  # somente no comando
npx prisma validate
npx prisma generate
npx tsc --noEmit
npm run build
```

## Decisões de modelo de dados

| Tema | Decisão | Motivo |
| --- | --- | --- |
| Charset | `utf8mb4` + `utf8mb4_unicode_ci` | Acentos pt-BR e comparação estável de e-mails/nomes |
| Engine | `InnoDB` explícito | Transações e suporte a FK |
| `Produto.precoBrl` | `DECIMAL(10,2)` | Nunca usar `FLOAT` para dinheiro |
| `Pet.peso` | `Float` (gera `DOUBLE`) | Evita conversão desnecessária nesta etapa; não é valor monetário |
| `DateTime` | `DATETIME(6)` | Precisão de microssegundos para auditoria/agendamento |
| Exclusão de prontuário | `ON DELETE RESTRICT` em `Pet→Cliente`, `Consulta→Pet`, `Anexo→Pet` e `Lote→Produto` | Impede apagar histórico clínico e de estoque por cascata |
| `Lote.produto` | `RESTRICT` | Preserva o histórico de lotes/validade mesmo que o produto seja desativado |
| LGPD | `aceiteLgpd` começa `false`; quando aceito, grava `lgpdAceiteEm`, `lgpdFinalidade` e `lgpdVersaoTermo` | Consentimento rastreável; cadastro sem aceite é rejeitado no service |
| `criadoPorId` | Relações nomeadas `CriadorCliente` / `CriadorPet`, `ON DELETE SET NULL` | Mantém o registro mesmo se o usuário for removido |
| Auditoria da agenda | `Consulta.criadoEm`, `atualizadoEm`, `criadoPorId`, `canceladoPorId`, `canceladoEm`, `motivoCancelamento`, `concluidaPorId`, `concluidaEm` | Rastreia criação, cancelamento e conclusão sem apagar a consulta |
| Relações `Usuario ↔ Consulta` | Quatro relações nomeadas: `VeterinarioConsultas` (mantém o campo inverso `consultas`), `CriadorConsulta`, `CanceladorConsulta`, `ConcluidorConsulta` | O Prisma exige nomes distintos quando há mais de uma relação entre os mesmos modelos; as três de auditoria usam `SET NULL`/`CASCADE` para não perder a consulta se o usuário sair |
| `Consulta.duracaoMinutos` | `Int @default(60)` | Base persistida para o cálculo de sobreposição da agenda |
| `Consulta.diagnostico` / `exameClinico` / `conduta` | `TEXT NULL` | Prontuário textual com acentos pt-BR; `TEXT` evita o limite de tamanho do `VARCHAR` para a evolução clínica |
| `Consulta.pesoAferido` / `temperaturaC` | `Float?` → `DOUBLE NULL` | Medições clínicas opcionais, consistentes com `Pet.peso`; não são valores monetários (preço continua `DECIMAL(10,2)`) |
| CHECKs do prontuário | `pesoAferido > 0` e `30 <= temperaturaC <= 45` quando preenchidos | Barra medições impossíveis sem obrigar o preenchimento |
| Índices da agenda | `(dataHora,status)`, `(veterinarioId,dataHora,status)` e `(petId,dataHora,status)` em Consulta | Suporte a consultas por período + status e ao bloqueio de sobreposição por veterinário/pet; os índices isolados em `veterinarioId`/`petId` foram removidos por serem redundantes (prefixo esquerdo) |
| Outros índices | `petId` em Pet/Anexo; `produtoId`/`validade` em Lote | Filtros de prontuário e validade de estoque |
| Unicidade | `Usuario.email`, `Cliente.cpf`, `Lote.codigo` | Identidade de acesso, CPF e rastreabilidade de lote |
| `role` | `String` com default `ATENDENTE` | A tipagem `Role` continua no TypeScript |
| `RegistroVacina.validade` / `proximaDose` | `DateTime @db.Date` (`YYYY-MM-DD`) | Datas civis sem fuso; evita erro de interpretar meia-noite UTC como hora local |
| `RegistroVacina.aplicadaEm` / `registradoEm` | `DATETIME(6)` em UTC | Instante do ato e da auditoria, consistente com as demais tabelas |
| `RegistroVacina.consultaId` | `ON DELETE SET NULL` | A consulta pode ser removida sem apagar o ato clínico; o vínculo some, o registro permanece |
| `RegistroVacina` → Pet/Veterinário/Registrador | `ON DELETE RESTRICT` | Nunca apagar por cascata um ato de vacinação |
| Próxima dose | Campo informado, sem cálculo | Calendários e exigências variam por município/estado; o sistema não inventa regra |

**Observação:** `Cliente.email` permanece sem `UNIQUE`. O enunciado da etapa
menciona que "cpf e email já são únicos", mas no schema original apenas
`Usuario.email` e `Cliente.cpf` são únicos. Adicionar unicidade a e-mail de
cliente mudaria regra de negócio (ex.: familiares compartilhando contato) e
deve ser validado com `clinica-veterinaria` antes de qualquer alteração.

**CHECK constraints:** o Prisma Migrate não gera nem gerencia `CHECK`. Estão
acrescentados manualmente ao SQL inicial (19 no total):

- `Pet_peso_positivo_chk` (`peso > 0`);
- `Produto_preco_nao_negativo_chk` e `Produto_estoque_minimo_nao_negativo_chk`;
- `Lote_quantidade_nao_negativa_chk`;
- `Cliente_lgpd_coerente_chk` (aceite x metadados de consentimento);
- `Consulta_duracao_positiva_chk` (`duracaoMinutos > 0`);
- `Consulta_status_valido_chk` (`status IN ('AGENDADA','CONFIRMADA','CONCLUIDA','CANCELADA')`);
- `Consulta_cancelamento_coerente_chk` (se `status = 'CANCELADA'`, exigir
  `canceladoEm` e `motivoCancelamento` não vazio);
- `Consulta_peso_aferido_positivo_chk` (`pesoAferido IS NULL OR pesoAferido > 0`);
- `Consulta_temperatura_faixa_chk` (`temperaturaC IS NULL OR
  (temperaturaC >= 30 AND temperaturaC <= 45)`).
- `RegistroVacina_campos_obrigatorios_chk` (vacina, fabricante, lote e dose não
  vazios);
- `RegistroVacina_validade_coerente_chk` (`validade >= DATE(aplicadaEm)`);
- `RegistroVacina_proxima_dose_coerente_chk` (`proximaDose IS NULL OR
  proximaDose >= DATE(aplicadaEm)`).
- `AnexoClinico_tamanho_valido_chk` (`0 < tamanhoBytes <= 10485760`);
- `AnexoClinico_categoria_valida_chk` (categoria nos 5 tokens permitidos);
- `AnexoClinico_mime_valido_chk` (`application/pdf`, `image/jpeg`, `image/png`);
- `AnexoClinico_nome_original_valido_chk` (`TRIM(nomeOriginal)` não vazio);
- `AnexoClinico_nome_arquivo_valido_chk` (UUID v4 + extensão curta);
- `AnexoClinico_inativacao_coerente_chk` (inativo exige data e motivo, e ativo
  exige os três campos de inativação nulos).

O cabeçalho do `migration.sql` deixa isso explícito. Ao gerar migrações futuras,
confirme que a seção de CHECKs foi preservada. Isso pode aparecer como *drift*
em `migrate status` se o Prisma não as conhecer. Requer MySQL 8.0.16+.

## Impacto no código TypeScript

- `Produto.precoBrl` é `Prisma.Decimal`. `EstoqueRepository` grava com
  `new Prisma.Decimal(valor)` e `EstoqueService` devolve ao IPC com
  `.toNumber()`; nenhum objeto `Decimal` cruza a ponte.
- `Usuario.crmv`, `Usuario.rg`, `atualizadoEm`, `criadoEm` e os campos de
  auditoria de `Cliente`/`Pet`/`Lote` são preenchidos automaticamente pelo
  Prisma Client (`@default(now())` / `@updatedAt`) — nenhuma chamada existente
  precisou ser alterada para fornecê-los.
- `criarCliente` e `criarPet` passaram a gravar explicitamente os metadados de
  LGPD e `criadoPorId: null` (ver pendência abaixo).
- Repositórios usam `select` explícito. As Etapas 5 e 6 ampliaram os DTOs e os
  canais IPC sem quebrar os métodos existentes; a Etapa 7 acrescentou dois
  métodos e dois canais novos para vacinação (ver seção própria abaixo).
- Os campos da Etapa 6 aparecem no Prisma Client como `string | null`
  (`exameClinico`, `conduta`, além do `diagnostico` existente) e `number | null`
  (`pesoAferido`, `temperaturaC`). Por serem `Float`/`DOUBLE` — e não `Decimal` —,
  não exigem `.toNumber()`; services futuros de prontuário devem validar unidade
  e faixa antes de gravar. Nada disso alterou services, handlers ou renderer.
- **Máscaras:** o renderer envia CPF/telefone/CEP formatados (ex.:
  `123.456.789-09`). Como o MySQL usa `VARCHAR(11)`/`VARCHAR(11)`/`VARCHAR(8)`,
  o repositório agora remove a pontuação antes de gravar. O validador já
  aceitava ambos os formatos; apenas a persistência mudou.

## Agenda (Etapa 5) — auditoria, status e limitações

### Campos persistidos em `Consulta`

| Campo | Finalidade |
| --- | --- |
| `duracaoMinutos` (`Int`, default `60`) | Duração padrão de 60 min usada como base do cálculo de sobreposição |
| `criadoEm` / `atualizadoEm` (`DATETIME(6)`) | Criação e última alteração; `@updatedAt` é mantido pelo Prisma |
| `criadoPorId` → `Usuario` (`SET NULL`) | Quem agendou |
| `canceladoPorId` / `canceladoEm` / `motivoCancelamento` | Quem cancelou, quando e por quê |
| `concluidaPorId` / `concluidaEm` | Quem concluiu e quando |

As quatro relações com `Usuario` são nomeadas de forma distinta no Prisma —
`VeterinarioConsultas` (com o campo inverso `consultas`, preservado),
`CriadorConsulta`, `CanceladorConsulta` e `ConcluidorConsulta` — porque o Prisma
não aceita mais de uma relação entre os mesmos modelos sem nomes explícitos.
As relações de auditoria usam `ON DELETE SET NULL` / `ON UPDATE CASCADE`, para
que a exclusão de um usuário não apague o histórico da consulta; a relação do
veterinário continua `RESTRICT`.

### Convenção de status (ASCII, sem acento)

Os valores válidos são **`AGENDADA`, `CONFIRMADA`, `CONCLUIDA`, `CANCELADA`**
(sem acento em `CONCLUIDA`). Essa escolha evita divergência entre a collation
`utf8mb4_unicode_ci`, comparadores em JavaScript, logs e contratos IPC; o CHECK
`Consulta_status_valido_chk` barra qualquer outro valor. A exibição com acento
(`Concluída`) é feita somente na interface, se desejada.

### Bloqueio de sobreposição e limitação conhecida

- O banco **não** implementa exclusão de intervalos (não existe `CHECK` ou
  constraint que impeça sobreposição em MySQL). O bloqueio é feito no service,
  consultando as consultas do **mesmo veterinário** e do **mesmo pet** cujo
  intervalo `[dataHora, dataHora + duracaoMinutos)` intersecta o pretendido,
  e só depois gravando. Os índices `(veterinarioId,dataHora,status)` e
  `(petId,dataHora,status)` dão suporte à busca; use `select` explícito,
  `take`/limite e parâmetros (`?`), nunca concatenação.
- **Concorrência:** após a revisão final, checagem e `create` passaram a ocorrer
  na mesma transação, com `SELECT ... FOR UPDATE` nas linhas de pet e
  veterinário (sempre nessa ordem, para evitar deadlock). Ainda assim, o
  comportamento deve ser confirmado com MySQL real e duas criações simultâneas
  quando a migração for aplicada.
- **Limitação conhecida:** cirurgias e exames ainda **não** bloqueiam a agenda.
  Hoje o bloqueio ocorre apenas entre consultas do mesmo veterinário e do mesmo
  pet. Integrar esses outros tipos de evento exigiria nova tabela/modelo e
  validação de regra com `clinica-veterinaria`.
- `status = 'CANCELADA'` exige `canceladoEm` e `motivoCancelamento` preenchidos
  (CHECK). `concluidaEm`/`concluidaPorId` são preenchidos na conclusão, sem
  constraint de obrigatoriedade para não alterar regras de negócio.

Nenhum service, handler ou renderer foi alterado por este complemento; os
campos já estão disponíveis no Prisma Client após `npx prisma generate`.

## Prontuário clínico (Etapa 6)

### Campos acrescentados em `Consulta`

| Campo | Tipo MySQL | Finalidade |
| --- | --- | --- |
| `exameClinico` | `TEXT NULL` | Descrição do exame físico e dos achados observados na consulta |
| `diagnostico` | `TEXT NULL` | Campo já existente, mantido para o registro diagnóstico |
| `conduta` | `TEXT NULL` | Conduta terapêutica e orientações registradas pelo veterinário |
| `pesoAferido` | `DOUBLE NULL` | Peso medido na consulta (kg), distinto do `Pet.peso` cadastrado |
| `temperaturaC` | `DOUBLE NULL` | Temperatura aferida na consulta, em graus Celsius |

Todos são **opcionais** no banco. Os CHECKs manuais garantem que, quando
informados, `pesoAferido > 0` e `30 <= temperaturaC <= 45`. Nenhuma tabela nova
foi criada: anexos e vacinas ficam para etapas futuras.

### Preenchimento, conclusão e LGPD

- **Preencher o prontuário NÃO conclui a consulta automaticamente.** `status`,
  `concluidaEm` e `concluidaPorId` continuam sendo alterados somente pela ação
  explícita de conclusão da agenda (Etapa 5). Esta etapa apenas persiste os
  dados clínicos: não há gatilho, procedimento, `DEFAULT` ou CHECK que mude o
  status da consulta em razão do prontuário.
- O prontuário é **dado sensível (LGPD)**. Exame clínico, diagnóstico, conduta e
  medições têm a finalidade de assistência e registro clínico; o acesso é
  **filtrado no backend**, na camada de repositório/service, pelo usuário
  autenticado e pelo vínculo com o pet/cliente. Nenhum dado clínico é liberado
  diretamente ao renderer sem essa filtragem, e nenhuma credencial do banco é
  exposta ao frontend.
- A leitura deve usar `select` explícito com os campos acima apenas para perfis
  autorizados. A auditoria já existente (`criadoEm`, `atualizadoEm`) continua
  servindo para rastrear a emissão e a última alteração do registro.
- Unidades e formatação pt-BR (ex.: `38,5 °C`) são aplicadas somente na
  interface. O banco guarda números em `DOUBLE` e continua gravando todo
  `DATETIME(6)` em UTC.

Na Etapa 6 propriamente dita nenhum canal novo foi criado: os campos foram
acrescentados ao fluxo de prontuário existente. A Etapa 7, descrita a seguir,
sim acrescentou service, repositório, handlers, contrato IPC e tela própria.

## Carteira de vacinação (Etapa 7)

### Modelo `RegistroVacina`

| Campo | Tipo MySQL | Finalidade |
| --- | --- | --- |
| `petId` / `veterinarioId` | `INTEGER`, `ON DELETE RESTRICT` | Pet vacinado e veterinário responsável pela aplicação |
| `consultaId` | `INTEGER NULL`, `ON DELETE SET NULL` | Vinculo opcional com a consulta em que o ato ocorreu |
| `vacina`, `fabricante`, `lote` | `VARCHAR(120)`, `VARCHAR(120)`, `VARCHAR(64)` | Identificação do imunizante e do lote |
| `validade` | `DATE` | Validade do lote, enviada como `YYYY-MM-DD` |
| `aplicadaEm` | `DATETIME(6)` | Instante da aplicação em UTC, enviado como ISO 8601 |
| `dose` | `VARCHAR(60)` | Sequência da dose (1ª dose, reforço, dose única…) |
| `proximaDose` | `DATE NULL` | Data informada pelo veterinário; **nunca calculada** pelo sistema |
| `reacao`, `observacoes` | `VARCHAR(500) NULL`, `TEXT NULL` | Dados clínicos sensíveis, protegidos como prontuário |
| `registradoPorId`, `registradoEm`, `atualizadoEm` | `INTEGER`, `DATETIME(6)` | Auditoria de quem registrou e quando |

CHECKs manuais acrescentados: `RegistroVacina_campos_obrigatorios_chk`,
`RegistroVacina_validade_coerente_chk` (`validade >= DATE(aplicadaEm)`) e
`RegistroVacina_proxima_dose_coerente_chk` (`proximaDose` não pode ser anterior
à aplicação). Índices: `(petId, aplicadaEm)`, `veterinarioId` e `consultaId`.

### Regras de acesso e de registro

- **Somente VETERINÁRIO responsável e ADMIN** leem e registram. ATENDENTE recebe
  erro no backend tanto na leitura quanto na escrita — esconder o botão na tela
  é apenas usabilidade, não segurança.
- VETERINÁRIO vê somente os registros que aplicou; ADMIN vê a carteira completa.
- No registro, o aplicador é inferido da sessão para VET. ADMIN deve informar um
  veterinário ativo. Quando há consulta vinculada, ela deve ser do mesmo pet,
  não cancelada e pertencer ao mesmo aplicador.
- Não existe cálculo de calendário, obrigatoriedade, status “em dia/atrasado”
  nem alerta de atraso. A próxima dose é preenchida somente se o veterinário
  informar. Prazos e campanhas variam por município/estado e devem ser
  confirmados com o profissional e a vigilância sanitária local.

Aviso exibido no formulário:

> Este registro é informativo: o sistema não calcula calendário vacinal, não
> define obrigatoriedade e não emite alerta de atraso. A próxima dose é
> preenchida apenas se o veterinário informar. Prazos e exigências — como
> antirrábica e campanhas municipais — variam por município/estado e devem ser
> confirmados com o veterinário responsável e com a vigilância sanitária local.

### Contrato IPC

| Método do preload | Canal | Descrição |
| --- | --- | --- |
| `vacinasListarPet(petId)` | `vacinas:listarPet` | Carteira do pet, filtrada pelo usuário autenticado |
| `vacinasRegistrar(dados)` | `vacinas:registrar` | Registro auditado, com validação de lote/datas/consulta |

**Fora do escopo desta etapa:** catálogo de vacinas, lembretes automáticos,
vínculo com `Lote` do estoque, volume administrado, via/local de aplicação,
reação estruturada e retificação auditada. Essas evoluções precisam de decisão
explícita — especialmente o vínculo com o estoque da Etapa 8.

## Estoque e lotes (Etapa 8)

### Escopo aprovado

- **ADMIN** cadastra produtos e lotes. **ADMIN, VETERINÁRIO e ATENDENTE** podem
  listar. A autoridade é o backend; esconder formulários na tela é apenas
  usabilidade.
- Produto: nome, categoria, estoque mínimo e preço em BRL. Lote: código único,
  validade e quantidade, sempre associado a um produto.
- Alertas são **apenas visuais**, calculados no renderer:
  - lote com `validade < hoje` → **Vencido**;
  - lote com `validade <= hoje + 90 dias` → **Vence em breve**;
  - produto cuja soma de quantidades é `<= estoqueMinimo` → **Estoque mínimo
    atingido**.
- O limite de 90 dias está em `ESTOQUE_ALERTA_VALIDADE_DIAS`; é uma convenção de
  interface, não uma regra clínica nem fiscal.

### Decisões de persistência

- `Produto.precoBrl` continua `DECIMAL(10,2)`. O repositório usa
  `new Prisma.Decimal(valor)` para gravar e `.toNumber()` para devolver; nenhum
  objeto `Decimal` atravessa o IPC.
- `Lote.validade` permanece `DATETIME(6)`. O valor do campo de data é ancorado
  em `T00:00:00.000Z` e lido com `toISOString().slice(0, 10)`, preservando o dia
  civil sem deslocamento de fuso. Migrar para `@db.Date` foi avaliado e
  considerado desnecessário nesta etapa.
- Código de lote duplicado é barrado antes da gravação, com mensagem pt-BR, além
  do `UNIQUE` no banco. A checagem usa a collation `utf8mb4_unicode_ci`, que é
  case-insensitive.
- Não há movimentações de entrada/saída, baixa automática por consulta ou
  vacina, vínculo com `RegistroVacina`, edição/exclusão, campo `ativo` nem
  novos índices. Essas evoluções exigem decisão e, se houver mudança de coluna,
  uma nova migração.

### Contrato IPC

| Método do preload | Canal | Perfis |
| --- | --- | --- |
| `estoqueProdutosListar()` | `estoque:produtosListar` | ADMIN, VET, ATENDENTE |
| `estoqueProdutosCriar(dados)` | `estoque:produtosCriar` | ADMIN |
| `estoqueLotesListar()` | `estoque:lotesListar` | ADMIN, VET, ATENDENTE |
| `estoqueLotesCriar(dados)` | `estoque:lotesCriar` | ADMIN |

## Anexos clínicos (Etapa 9)

### Escopo aprovado

- O stub `Anexo` foi **evoluído** para `AnexoClinico`: não há duas tabelas
  concorrentes e a contagem que bloqueia a exclusão do pet continua válida.
  Anexos **inativos também** impedem a exclusão, enquanto o arquivo existir.
- **ADMIN** anexa informando um veterinário ativo como responsável técnico e vê
  todos os anexos. **VETERINÁRIO** anexa e vê somente os próprios. **ATENDENTE**
  é negado no service inclusive para listar metadados.
- `petId` é obrigatório; `consultaId` é opcional e, quando informado, deve ser
  do mesmo pet, não cancelada e do mesmo responsável. Se a consulta for
  removida, o vínculo vira `nulo` e o anexo permanece.
- Não existe exclusão física nesta etapa: **inativação lógica com motivo**
  obrigatório, `inativadoPorId`/`inativadoEm` auditados. Um anexo inativo sai
  da listagem e não pode ser aberto.
- Arquivos aceitos: **JPG, PNG e PDF**, até **10 MiB**. A validação usa a
  **assinatura de bytes** no processo principal — extensão e MIME declarado
  precisam concordar com o conteúdo; divergência gera erro em pt-BR.

### Armazenamento e privacidade

- O arquivo fica no diretório de dados do app, com nome interno UUID. O campo
  `caminhoLocal` do antigo stub foi removido: **nenhum caminho de arquivo
  atravessa o IPC**. O renderer recebe apenas metadados.
- Fluxo em duas etapas: escolher/validar o arquivo no main → confirmar os
  metadados no formulário → gravar registro. Se a confirmação falhar, o arquivo
  temporário é descartado. A abertura usa o aplicativo padrão do sistema,
  também no main.
- `nomeOriginal` é sanitizado para basename (sem barras, sem `..`);
  `checksumSha256` registra integridade. Logs e auditoria referem-se ao ID do
  anexo, nunca ao nome do arquivo.
- Dados sensíveis: conteúdo, descrição, categoria, data e nome do arquivo são
  tratados como dados de saúde. A base não é "o tutor cadastrou": é a
  finalidade/obligação da atividade veterinária (LGPD, arts. 6º e 7º).
  Eliminação depende de política de retenção definida pelo veterinário e pela
  vigilância sanitária local — não existe prazo único inventado pelo sistema.

Aviso exibido na tela:

> Anexos clínicos são dados sensíveis. O acesso é permitido somente ao
> veterinário responsável e ao administrador. Inclusões e inativações ficam
> registradas para auditoria. Não compartilhe estes arquivos fora da clínica.

### Contrato IPC

| Método do preload | Canal | Finalidade |
| --- | --- | --- |
| `anexosListarPet(petId)` | `anexos:listarPet` | Metadados do pet, filtrados pelo usuário autenticado |
| `anexosEscolherArquivo()` | `anexos:escolherArquivo` | Diálogo + validação no main; devolve metadados e um token |
| `anexosRegistrar(dados)` | `anexos:registrar` | Grava o registro usando o arquivo já validado |
| `anexosAbrir(id)` | `anexos:abrir` | Abre o arquivo no aplicativo padrão, sem expor o caminho |
| `anexosInativar(id, motivo)` | `anexos:inativar` | Inativação lógica auditada |
| `anexosCancelar(token)` | `anexos:cancelar` | Descarta o arquivo pendente quando o registro é cancelado |

**Fora do escopo:** assinatura digital, carimbo do tempo, OCR, busca por
conteúdo, preview de imagem/PDF embutido, download pelo tutor, portal/e-mail,
exclusão programada, retenção automática, versionamento/retificação, envio
múltiplo, sincronização em nuvem e criptografia em repouso adicional.

## Plano de validação (executar quando houver MySQL disponível)

1. **Migração:** `npx prisma migrate status` antes (esperado: nenhuma migração
   aplicada) e `npx prisma migrate deploy` depois (esperado:
   `Applying migration 20261119163348_init_mysql ... Done`). Em seguida,
   `npx prisma migrate status` deve indicar schema atualizado.
2. **Estrutura:** `SHOW CREATE TABLE Cliente;` e `SHOW CREATE TABLE Consulta;`
   — esperado: `ENGINE=InnoDB`, `DEFAULT CHARSET=utf8mb4`,
   `COLLATE=utf8mb4_unicode_ci`, colunas `lgpd*` e `atualizadoEm DATETIME(6)`;
   em `Consulta`: `duracaoMinutos INT DEFAULT 60`, `criadoEm`, `atualizadoEm`,
   `criadoPorId`, `canceladoPorId`, `canceladoEm`, `motivoCancelamento`,
   `concluidaPorId`, `concluidaEm`; FKs de auditoria com `ON DELETE SET NULL` e
   a de veterinário com `ON DELETE RESTRICT`; índices
   `Consulta_dataHora_status_idx`, `Consulta_veterinarioId_dataHora_status_idx` e
   `Consulta_petId_dataHora_status_idx`.
3. **Massa de dados mínima:** 1 ADMIN (`npm run seed:admin`), 1 cliente e 1 pet
   pela interface, 1 consulta e 1 anexo vinculados ao pet. Use sempre
   parâmetros (`?`) em qualquer SQL manual — nunca concatene valores.
4. **Integridade (RESTRICT):** com um pet que possui consulta/anexo, executar
   `DELETE FROM Pet WHERE id = ?;` — esperado: falha com erro 1451
   (`Cannot delete or update a parent row`). A barreira do service também deve
   continuar exibindo a mensagem pt-BR da Etapa 3.
5. **LGPD (CHECK):** tentar inserir cliente com `aceiteLgpd = 1` e
   `lgpdAceiteEm`/`lgpdFinalidade`/`lgpdVersaoTermo` nulos — esperado: erro de
   CHECK (3819). Tentar cadastro sem aceite pela interface — esperado:
   rejeição no service.
6. **Agenda (CHECKs manuais):** (a) `duracaoMinutos = 0` — esperado: erro 3819;
   (b) `status = 'CONCLUIDA'` (com acento) — esperado: erro 3819, use `CONCLUIDA`;
   (c) `status = 'CANCELADA'` sem `canceladoEm`/`motivoCancelamento` — esperado:
   erro 3819; (d) cancelamento com motivo preenchido — esperado: sucesso e
   `criadoEm`/`atualizadoEm` coerentes (UTC).
7. **Performance:** com a massa acima (amplie para centenas de linhas se
   possível), rodar
   `EXPLAIN SELECT id, status FROM Consulta WHERE dataHora >= ? AND dataHora < ? AND status = ? ORDER BY dataHora DESC LIMIT 50;`
   — esperado: uso de `Consulta_dataHora_status_idx` e ausência de `type = ALL`.
   Para a sobreposição, rodar
   `EXPLAIN SELECT id FROM Consulta WHERE veterinarioId = ? AND dataHora >= ? AND dataHora < ? AND status IN (?, ?) LIMIT 50;`
   — esperado: `Consulta_veterinarioId_dataHora_status_idx` (e equivalente com
   `petId`). Repetir o equivalente por pet.
8. **Prontuário (Etapa 6):** `SHOW CREATE TABLE Consulta;` — esperado:
   `exameClinico`, `conduta` e `diagnostico` como `TEXT NULL`, `pesoAferido` e
   `temperaturaC` como `DOUBLE NULL`, além dos CHECKs
   `Consulta_peso_aferido_positivo_chk` e `Consulta_temperatura_faixa_chk`. Com
   SQL sempre parametrizado (`?`): (a) `pesoAferido = 0` ou `-1` — esperado erro
   3819; `NULL` e `12.5` — sucesso; (b) `temperaturaC = 29.9` ou `45.1` — erro
   3819; `30`, `38.5`, `45` e `NULL` — sucesso; (c) gravar prontuário em consulta
   `AGENDADA` e reler `status`/`concluidaEm` — esperado: `AGENDADA`/`NULL`, sem
   conclusão automática.
9. **LGPD no acesso:** confirmar que a leitura do prontuário passa pelo
   repositório/service com `select` explícito e filtro do usuário autenticado;
   nenhum canal IPC deve devolver o prontuário sem essa filtragem.
10. **Vacinação (Etapa 7):** `SHOW CREATE TABLE RegistroVacina;` — esperado:
    `ENGINE=InnoDB`, `utf8mb4`, `validade`/`proximaDose` como `DATE`,
    `aplicadaEm`/`registradoEm` como `DATETIME(6)`, FKs com `RESTRICT` (pet,
    aplicador, registrador) e `SET NULL` (consulta), além dos três CHECKs
    `RegistroVacina_*`. Via IPC, testar: (a) ATENDENTE recebe erro em
    `vacinas:listarPet` e `vacinas:registrar`; (b) aplicação futura, lote vencido
    e próxima dose anterior à aplicação são rejeitados; (c) consulta vinculada
    de outro pet, cancelada ou de outro veterinário é rejeitada; (d) VET vê
    apenas seus registros e ADMIN vê todos; (e) o aviso de não cálculo de
    calendário aparece no formulário e nada exibe “em dia/atrasado/obrigatória”.
11. **Estoque (Etapa 8):** via IPC, confirmar que ATENDENTE e VET conseguem
    listar produtos/lotes, mas recebem erro ao tentar criar; ADMIN cria um
    produto com preço `12,34` e um lote com validade futura — esperado: preço
    exibido como `R$ 12,34` e situação `Válido`. Criar lote com o mesmo código
    (inclusive mudando apenas caixa) — esperado: erro pt-BR de duplicidade.
    Com um lote vencido e outro a menos de 90 dias — esperado: `Vencido` e
    `Vence em breve`. Com `estoqueMinimo = 10` e quantidade total `<= 10` —
    esperado: `Estoque mínimo atingido`. Nenhuma baixa de estoque deve ocorrer
    ao registrar consulta ou vacina.
12. **Anexos (Etapa 9):** `SHOW CREATE TABLE AnexoClinico;` — esperado: 8
    tabelas no total, FKs `RESTRICT` (pet, responsável, registrador) e `SET NULL`
    (consulta e inativador), seis CHECKs `AnexoClinico_*`. Via IPC: (a) ATENDENTE
    recebe erro em todos os canais, inclusive `anexos:listarPet`; (b) VET vê só
    os próprios e ADMIN vê todos; (c) arquivo renomeado com extensão `.png` mas
    assinatura divergente é rejeitado, e acima de 10 MiB também; (d) não aparece
    nenhum caminho de arquivo na resposta; (e) inativação exige motivo, o anexo
    sai da listagem e não abre, mas continua impedindo a exclusão do pet.
13. **Regressão:** `npx tsc --noEmit`, `npm run build` e um smoke test das
    telas de clientes/pets/prontuário/vacinação/estoque/anexos — esperado:
    listagens e cadastros inalterados.

## Revisão final das Etapas 1–9 e correções aprovadas

A auditoria foi executada em modo somente leitura por três especialistas
(usabilidade, domínio clínico/LGPD e segurança de backend). O usuário aprovou
**todos os 5 achados** e as correções abaixo foram implementadas em seguida.
Nenhuma migração foi alterada.

### Validações executadas após as correções

| Verificação | Resultado |
| --- | --- |
| `npx tsc --noEmit` | OK |
| `npm run build` | OK (`dist/renderer/app.js`, assets copiados) |
| `npx prisma validate` (com `DATABASE_URL` fictícia na sessão) | OK |
| Auditoria do renderer (`onclick`, `innerHTML`, `alert`, `prompt`, `confirm`, `any`) | 0 ocorrências |
| `agenda.ts`: campos clínicos no contrato da agenda | 0 ocorrências |
| Foco em modal | `shown.bs.modal` em agenda, prontuário, exclusão e anexos |
| Data civil às 21h em `America/Sao_Paulo` | `2026-11-21T00:30Z` → `2026-11-20` |
| HTML: IDs duplicados e referências `for`/`aria-describedby` quebradas | 0 |
| Whitelist IPC | 29 canais, 29 handlers, `Record<IpcChannel, HandlerIpc>` exaustivo |
| Migração | 8 tabelas, 19 CHECKs, ainda não aplicada |
| Ambiente | sem `.env`; `prisma/dev.db` com 0 bytes; nenhum commit nesta sessão |

O único `any` no repositório é uma ocorrência pré-existente em comentário de
`src/main/ipc/invocar.ts`; o cast real fica isolado naquele helper.

### Correções aplicadas

1. **Vazamento de prontuário encerrado.** `ConsultaRepository` passou a ter
   duas projeções: `selecaoAgenda` (sem colunas clínicas) e `selecaoConsulta`
   (completa, só para prontuário/checagens internas). Os contratos
   `ConsultaAgenda` e `ConsultaProntuario` separam o IPC da agenda do IPC
   clínico. `consultas:listar`, `:criar`, `:cancelar` e `:concluir` devolvem
   apenas a agenda; `prontuario:*` continua completo para ADMIN/VET. ATENDENTE
   não recebe mais nenhum campo de prontuário.
2. **Data civil no fuso da clínica.** Novo helper `src/shared/datas.ts` com
   `FUSO_CLINICA = 'America/Sao_Paulo'` e `dataCivilClinica()`. Service de
   vacinação, service de anexos, estoque, vacinas e anexos no renderer não
   usam mais `toISOString().slice(0, 10)` para "hoje"/data de aplicação.
   Colunas `@db.Date` seguem ancoradas em UTC na leitura/escrita.
3. **Agendamento atomizado.** `ConsultaService.criar()` executa validação de
   pet/veterinário, checagem de sobreposição e `create` em uma transação
   interativa do Prisma, com `SELECT ... FOR UPDATE` em `Pet` e `Usuario` na
   mesma ordem. As duas dimensões (veterinário e pet) continuam sendo
   verificadas com a janela `[inicio, fim)`.
4. **Foco acessível.** `.focus()` dos modais foi movido para
   `shown.bs.modal` em cancelamento/conclusão da agenda, conclusão do
   prontuário, confirmação de exclusão e inativação de anexo. Após o login,
   `auth.ts` move o foco para o primeiro controle visível do app autenticado.
5. **Anexos endurecidos.** `anexos:cancelar` agora exige perfil clínico; o
   handler valida o perfil **antes** de mover o arquivo do staging; tokens
   expiram em 30 minutos (`ANEXO_STAGING_TTL_MINUTOS`) com limpeza no
   `escolher()`, no `obter()`/`confirmar()` e no startup (`iniciar()`); o
   arquivo é validado e lido por um único descritor (stat, assinatura e copia
   para staging), fechando a janela TOCTOU.

### Atenções registradas (fora das cinco correções aprovadas)

- Sessão não revalida `usuario.ativo`; um perfil desativado continua operando
  até relogar.
- Mensagens de login distinguem “usuário inexistente/desativado” de “senha
  incorreta” (enumeração de contas). Cadastro público como ATENDENTE é decisão
  deliberada da Etapa 3, não um defeito.
- `console.error` no main pode registrar detalhes de query/caminho no console
  local (não cruza o IPC).
- CPF completo trafega no IPC embora a tela mostre só os dois últimos dígitos;
  finalidade/versão do termo de consentimento não são exibidas ao titular no
  ato do aceite.
- `criadoPorId` ainda é `null` em cliente/pet; tetos de 200 registros sem
  paginação; prontuário obrigatório na conclusão da consulta ainda sem decisão
  formal; lote de vacina digitado, sem vínculo com o estoque.
- Rótulos e pequenas inconsistências de interface: role ASCII na barra do
  usuário, “Status” vs. “Situação”, peso com ponto decimal, mensagens
  `AAAA-MM-DD` em campos `date`, ausência de `aria-busy` nas tabelas de
  clientes/pets, avisos dinâmicos com `role="note"` em vez de `role="status"`.

Os itens acima permanecem como pendências registradas: não foram incluídos
nas cinco correções aprovadas e não foram alterados nesta rodada.

## Pendências (fora do escopo deste complemento)

1. **Aplicar** a migração em MySQL real com `npx prisma migrate deploy` e rodar
   `npm run seed:admin`.
2. **Rastreabilidade:** propagar o `Usuario` da `SessaoService` até o service
   para preencher `criadoPorId` (hoje gravamos `null` para não alterar contratos
   IPC nesta etapa).
3. **Paginação:** introduzir `take`/`skip` ou cursor nas listagens com contrato
   de IPC revisado (não feito aqui para não quebrar o renderer).
4. **Performance:** rodar `EXPLAIN` nas consultas de agenda/prontuário/estoque
   com massa de dados real e ajustar índices compostos se necessário.
5. **Regras de negócio:** validar com `clinica-veterinaria` a eventual unicidade
   de `Cliente.email`, a exclusão lógica de prontuários e a política de retenção
   LGPD (inclusive alteração de versão do termo).
6. **Dados legados:** se existir um `dev.db` com dados em outro ambiente,
   planejar exportação/conversão (SQLite → MySQL) antes de descartá-lo. Aqui o
   arquivo está vazio e foi preservado.
7. **Etapas futuras:** vacinação (Etapa 7), estoque (Etapa 8) e anexos clínicos
   (Etapa 9) foram implementados; demais evoluções (catálogo/lembretes de
   vacinas, vínculo com `Lote`, movimentações de entrada/saída, volume,
   via/local de aplicação e retificação auditada) continuam em etapas separadas.
8. **Regras do prontuário:** validar com `clinica-veterinaria` se
   `exameClinico`/`conduta` serão obrigatórios no ato da conclusão e qual a
   política de retenção/alteração do prontuário (LGPD). Nada disso foi assumido
   nesta etapa.
9. **Retenção e limpeza de anexos:** definir com o veterinário responsável e a
   vigilância sanitária a política de prazos antes de autorizar exclusão
   física; até lá, apenas inativação lógica. Varredura de arquivos órfãos deve
   mover para quarentena, nunca apagar automaticamente.
