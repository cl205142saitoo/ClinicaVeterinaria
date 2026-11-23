# Plano de complementos — PetHealthPD

Fonte: PDF `Projeto DAD - PetHealthPD.pdf` (respostas do Will) e README do projeto.

Ordem obrigatória pedida pelo usuário:

1. **Fase 1 — requisitos pendentes antes do financeiro**
   - Alerta de estoque configurável por produto (flag + mínimo).
   - Aviso de vacina: alerta no sistema + e-mail ao tutor.
   - Cotação do dólar do dia para cálculo de custo.
   - Carga de dados fictícios em todo o sistema e relatórios (inclui volume de clientes).
2. **Fase 2 — por último**
   - Controle de preços.
   - Orçamentos.
   - Financeiro.

---

## Fase 1 — contratos

### Constantes novas (`src/shared/constants.ts`)

```ts
export const ESTOQUE_ALERTA_PADRAO = true;
export const VACINA_ALERTA_DIAS = 30;
export const RELATORIO_PERIODO_MAXIMO_MESES = 24;
export const COTACAO_DOLAR_CACHE_MINUTOS = 60;
export const SMTP_ASSUNTO_PREFIXO = '[PetHealthPD]';
```

### Canais IPC novos (`src/shared/ipc-channels.ts`)

```ts
VACINAS_ALERTAS: 'vacinas:alertas',
VACINAS_ENVIAR_AVISOS: 'vacinas:enviarAvisos',
API_COTACAO_DOLAR: 'api:cotacaoDolar',
RELATORIOS_GERAR: 'relatorios:gerar',
RELATORIOS_EXPORTAR_CSV: 'relatorios:exportarCsv',
```

### Tipos novos (`src/shared/types.ts`)

```ts
export type NivelAlertaVacina = 'VENCIDA' | 'PROXIMA' | 'SEM_DATA';

export interface AlertaVacina {
  registroVacinaId: number;
  petId: number;
  petNome: string;
  tutorNome: string;
  tutorEmail: string | null;
  vacina: string;
  dose: string;
  proximaDose: string | null; // YYYY-MM-DD
  diasParaProximaDose: number | null; // negativo = atrasada
  nivel: NivelAlertaVacina;
  ultimoAvisoEm: string | null;
}

export interface ResultadoEnvioAvisos {
  destinatarios: number;
  enviados: number;
  ignorados: number;
  falhas: number;
  mensagens: string[];
}

export interface CotacaoDolar {
  valor: number; // BRL por USD, 4 casas
  dataReferencia: string; // YYYY-MM-DD
  fonte: string;
  consultadoEm: string;
}

export interface FiltroRelatorio {
  de: string; // YYYY-MM-DD
  ate: string; // YYYY-MM-DD
}

export interface SerieMensal {
  mes: string; // YYYY-MM
  clientesNovos: number;
  consultas: number;
  vacinas: number;
  faturamento: number; // preenchido na Fase 2; 0 na Fase 1
}

export interface ContadorGrupo {
  rotulo: string;
  total: number;
}

export interface RelatorioDados {
  periodo: FiltroRelatorio;
  geradoEm: string;
  kpis: {
    clientesAtivos: number;
    clientesNovosPeriodo: number;
    petsAtivos: number;
    consultasPeriodo: number;
    consultasConcluidas: number;
    consultasCanceladas: number;
    vacinasPeriodo: number;
    alertasVacina: number;
    alertasEstoque: number;
    faturamento: number; // 0 na Fase 1, integrado na Fase 2
    despesas: number; // 0 na Fase 1
    saldo: number; // 0 na Fase 1
    ticketMedio: number; // 0 na Fase 1
  };
  serie: SerieMensal[];
  statusConsultas: ContadorGrupo[];
  clientesPorCidade: ContadorGrupo[];
  consultasPorVeterinario: ContadorGrupo[];
  produtosMaisUsados: ContadorGrupo[];
  alertasEstoque: Array<{
    produtoId: number;
    produtoNome: string;
    quantidade: number;
    estoqueMinimo: number;
    alertaHabilitado: boolean;
    motivos: string[];
  }>;
  alertasVacinas: AlertaVacina[];
}
```

`Produto` e `DadosProduto` ganham `alertaEstoque: boolean`.

`Api` ganha:

```ts
vacinasAlertas(): Promise<AlertaVacina[]>;
vacinasEnviarAvisos(): Promise<ResultadoEnvioAvisos>;
cotacaoDolar(): Promise<CotacaoDolar>;
relatorioGerar(filtro: FiltroRelatorio): Promise<RelatorioDados>;
relatorioExportarCsv(filtro: FiltroRelatorio): Promise<{ caminho: string; linhas: number } | null>;
```

### Banco (Fase 1)

Nova migration `prisma/migrations/20261124000000_alertas_cotacao/` (não editar as antigas):

- `Produto.alertaEstoque Boolean @default(true)` — `ALTER TABLE Produto ADD COLUMN alertaEstoque BOOLEAN NOT NULL DEFAULT TRUE;`
- `RegistroVacina.ultimoAvisoEm DateTime? @db.DateTime(6)`
- `RegistroVacina.ultimoAvisoProximaDose DateTime? @db.Date`
- Novo modelo `CotacaoDolar`:
  - `id`, `dataReferencia DateTime @db.Date @unique`, `valor Decimal @db.Decimal(10,4)`, `fonte VarChar(80)`, `consultadoEm DateTime @db.DateTime(6)`
- Novos índices: `RegistroVacina(proximaDose, estornado)` e `Produto(alertaEstoque)`.
- Nenhuma CHECK antiga deve ser removida. A migration só adiciona colunas/tabela/índices.

### Comportamento esperado

- **Estoque**: `alertaEstoque = false` desativa somente o alerta de quantidade mínima; alertas de validade continuam. ASituação do produto deve mostrar "Alerta desativado" quando aplicável. Admin altera pelo checkbox `#esAlertaEstoque`.
- **Vacinas**: `vacinasAlertas()` considera registros não estornados com `proximaDose` informada. `diasParaProximaDose = (proximaDose - hojeCivil)`. `VENCIDA` quando negativo, `PROXIMA` quando `0..VACINA_ALERTA_DIAS`, `SEM_DATA` quando sem próxima dose (não entra na lista de alertas). A service filtra por perfil: ADMIN vê todos; VET vê só os próprios.
- **E-mail**: `vacinasEnviarAvisos()` usa `nodemailer` com `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `PHD_CLAREZA_EMAIL` (opcional) do `.env`. Se SMTP não estiver configurado, deve devolver `falhas` com mensagem clara, sem quebrar o app. Só envia para alertas `VENCIDA`/`PROXIMA` com e-mail do tutor; atualiza `ultimoAvisoEm`/`ultimoAvisoProximaDose` e evita reenvio no mesmo dia para a mesma próxima dose.
- **Dólar**: `cotacaoDolar()` consulta `https://economia.awesomeapi.com.br/last/USD-BRL`, valida resposta, converte para `number`, persiste em `CotacaoDolar` por data de referência e devolve cache do dia em chamadas seguintes. Em falha de rede, devolve a última cotação salva; se não houver, erro amigável em pt-BR.
- **Relatórios**: `relatorioGerar()` agrega direto no Prisma sem os `take: 200` das listagens. Período máximo 24 meses, validado no backend. `relatorioExportarCsv()` usa `dialog.showSaveDialog` + `fs.writeFile` no main, BOM UTF-8, `;`, CRLF e prefixo `'` em células que começam com `= + - @` para evitar injeção de fórmula.

### IDs HTML (Fase 1)

- Estoque: `#esAlertaEstoque`, `#esAlertaEstoqueFeedback`, `#esCotacaoDolar`, `#btnAtualizarCotacao`, `#inValorUsd`, `#inValorBrlCalculado`, `#inCotacaoStatus`.
- Vacinas: `#vcAlertas`, `#tbAlertasVacinas`, `#btnEnviarAvisosVacina`, `#vcStatusAvisos`, `#vcResumoAlertas`.
- Nova aba: botão `#abaRelatorios-tab` em `#navAbas` (antes de Usuários); painel `#abaRelatorios` como filho direto de `#conteudoAbas`.
- Relatórios: `#formRelatorio`, `#relDe`, `#relAte`, `#relDeFeedback`, `#relAteFeedback`, `#btnGerarRelatorio`, `#btnExportarRelatorio`, `#btnImprimirRelatorio`, `#relStatus`, `#relKpis`, `#relGraficoClientes`, `#relGraficoConsultas`, `#relGraficoStatus`, `#tbRelatorioClientes`, `#tbRelatorioServicos`, `#tbRelatorioAlertasEstoque`, `#tbRelatorioAlertasVacinas`.

### Seed (`scripts/seed-dados.ts`)

- Usar `carregarEnv(['DATABASE_URL', 'PHD_ADMIN_EMAIL', 'PHD_ADMIN_SENHA', 'PHD_ANEXOS_DIR'])`; adicionar essas chaves em `carregarEnv.ts`.
- Criar/upsertar admin `admin@pethealthpd.local` / `PetHealth@2026!`.
- 4 veterinários, 3 atendentes, 180 clientes, 240 pets, 600 consultas (statuses variados, datas nos últimos 18 meses), 400 vacinas (com `proximaDose` passada/futura), 50 produtos, 150 lotes (alguns vencidos/próximos), 100 anexos com arquivos físicos (PDF/PNG mínimos, assinatura correta, checksum), 30 cotações diárias.
- Idempotente: se já houver cliente com CPF do seed, encerrar com aviso. Respeitar CHECKs e FKs.
- `PHD_ANEXOS_DIR` deve apontar para o mesmo diretório usado por `AnexoArquivoService` (ele também aceitará esse override).

---

## Fase 2 — financeiro (executar depois da Fase 1)

### Novos modelos

- `TabelaPreco` (código único, descrição, categoria, preço, ativo + auditoria).
- `HistoricoPreco` (origem `PRODUTO|TABELA_PRECO`, origemId, anterior, novo, responsável, motivo).
- `Orcamento` (número único, cliente, pet opcional, status `PENDENTE|APROVADO|REPROVADO|CANCELADO`, validade, desconto, observações, auditoria).
- `OrcamentoItem` (tipo `PRODUTO|SERVICO`, produto/tabela opcionais, descrição, quantidade, preço unitário, subtotal).
- `MovimentacaoFinanceira` (tipo `RECEITA|DESPESA`, categoria, descrição, valor, vencimento, pagamento, status `PENDENTE|PAGO|CANCELADO`, forma de pagamento, orçamento opcional, auditoria).

### Canais IPC

```ts
PRECOS_TABELA_LISTAR / PRECOS_TABELA_CRIAR / PRECOS_TABELA_ATUALIZAR / PRECOS_TABELA_INATIVAR
PRECOS_HISTORICO_LISTAR
ORCAMENTOS_LISTAR / ORCAMENTOS_CRIAR / ORCAMENTOS_ATUALIZAR / ORCAMENTOS_CANCELAR
FINANCEIRO_LISTAR / FINANCEIRO_CRIAR / FINANCEIRO_ATUALIZAR / FINANCEIRO_BAIXAR / FINANCEIRO_CANCELAR
```

### Abas

`#abaPrecos`, `#abaOrcamentos`, `#abaFinanceiro` — todas filhas diretas de `#conteudoAbas`. Relatórios passa a exibir faturamento, despesas, saldo, ticket médio e inadimplência com os dados reais.
