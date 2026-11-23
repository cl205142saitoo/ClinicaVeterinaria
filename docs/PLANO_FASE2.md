# Fase 2 — preços, orçamentos e financeiro

Implementar **depois** da Fase 1 (já concluída, commit `8a5df84`). Schema e migration já aplicados:
`prisma/migrations/20261125000000_precos_orcamentos_financeiro`.

## Contratos já adicionados em `src/shared/**`

- Constantes: `ORCAMENTO_STATUS`, `MOVIMENTACAO_STATUS`, `MOVIMENTACAO_TIPOS`, `PRECO_ITEM_TIPOS`, `ORIGEM_HISTORICO_PRECO`, `ITEM_QUANTIDADE_MAXIMA`, `FORMA_PAGAMENTO_MAXIMA`.
- Tipos: `TabelaPreco`, `DadosTabelaPreco`, `DadosAtualizacaoTabelaPreco`, `HistoricoPreco`, `ItemOrcamento`, `DadosItemOrcamento`, `Orcamento`, `DadosOrcamento`, `DadosAtualizacaoOrcamento`, `DadosStatusOrcamento`, `MovimentacaoFinanceira`, `DadosMovimentacao`, `DadosAtualizacaoMovimentacao`, `DadosBaixaMovimentacao`, `ResumoFinanceiro`.
- Canais IPC: `PRECOS_*`, `ORCAMENTOS_*`, `FINANCEIRO_*`.
- `RelatorioDados.kpis.inadimplencia` e `SerieMensal.despesas` passam a ser preenchidos com dados reais.

## Canais IPC

```text
PRECOS_TABELA_LISTAR / CRIAR / ATUALIZAR / INATIVAR
PRECOS_HISTORICO_LISTAR
ORCAMENTOS_LISTAR / CRIAR / ATUALIZAR / DEFINIR_STATUS / CANCELAR
FINANCEIRO_LISTAR / CRIAR / ATUALIZAR / BAIXAR / CANCELAR / RESUMO
```

## Regras de negócio

- **Preços**: ADMIN cria/edita/inativa tabelas de preço e altera `Produto.precoBrl`; VET e ATENDENTE só leem. Toda alteração de preço (produto ou tabela) grava `HistoricoPreco` com origem, id, valor anterior, novo, responsável e motivo. Código da tabela é único.
- **Orçamentos**: número sequencial único (`ORC-YYYYMM-####`). ADMIN e VET criam/editam/definem status/cancelam; ATENDENTE só lê. Status: `PENDENTE`, `APROVADO`, `REPROVADO`, `CANCELADO`. Itens podem ser `PRODUTO` (usa `Produto`) ou `SERVICO` (usa `TabelaPreco`); `precoUnitario` é sugerido pela UI mas validado no backend; `subtotal = quantidade * precoUnitario`. `desconto` é valor em BRL, não percentual, e não pode exceder o total dos itens. `total = subtotal itens - desconto`.
- **Financeiro**: ADMIN e VET criam/editam/baixam/cancelam; ATENDENTE só lê. `RECEITA` ou `DESPESA`, status `PENDENTE`, `PAGO` ou `CANCELADO`. Baixa define `pagamento` (data civil), `baixadoPorId` e `baixadoEm`. Cancelamento exige motivo. `valor > 0`.
- **Relatórios**: Fase 2 integra receitas pagas (`faturamento`), despesas pagas, saldo, ticket médio (receitas pagas / consultas concluídas no período) e inadimplência (receitas pendentes vencidas / total de receitas vencidas). `SerieMensal.faturamento` e `.despesas` vêm de `MovimentacaoFinanceira` com `status = PAGO`. ATENDENTE continua sem acesso.

## IDs HTML novos

- Abas: `#abaPrecos-tab` / `#abaPrecos`, `#abaOrcamentos-tab` / `#abaOrcamentos`, `#abaFinanceiro-tab` / `#abaFinanceiro` — todas filhas diretas de `#conteudoAbas`; itens de nav com id `-item`.
- Preços: `#formTabelaPreco`, `#tpCodigo`, `#tpDescricao`, `#tpCategoria`, `#tpPreco`, `#btnSalvarTabela`, `#btnCancelarTabela`, `#tbTabelasPreco`, `#tbHistoricoPreco`, `#tpResumo`.
- Orçamentos: `#formOrcamento`, `#orCliente`, `#orPet`, `#orValidade`, `#orDesconto`, `#orObservacoes`, `#orItemTipo`, `#orItemProduto`, `#orItemServico`, `#orItemQuantidade`, `#orItemPreco`, `#btnAdicionarItem`, `#tbItensOrcamento`, `#orTotal`, `#btnSalvarOrcamento`, `#tbOrcamentos`, `#orResumo`.
- Financeiro: `#formMovimentacao`, `#fnTipo`, `#fnCategoria`, `#fnDescricao`, `#fnValor`, `#fnVencimento`, `#fnPagamento`, `#fnStatus`, `#fnFormaPagamento`, `#fnOrcamento`, `#btnSalvarMovimentacao`, `#tbMovimentacoes`, `#fnResumo`, `#fnReceitas`, `#fnDespesas`, `#fnSaldo`, `#fnInadimplencia`.
- Relatórios: `#tbRelatorioFinanceiro` (Mês | Receitas | Despesas | Saldo).

## Seed complementar

`scripts/seed-financeiro.ts`, idempotente por código reservado de tabela de preço, adicionando dados às tabelas novas sem apagar nada. Script npm: `seed:financeiro`.
