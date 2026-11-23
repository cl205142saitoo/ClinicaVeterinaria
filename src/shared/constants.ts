/** Parâmetros de segurança compartilhados entre o app e os scripts de manutenção. */

/** Custo do bcrypt usado tanto no cadastro quanto no bootstrap do primeiro ADMIN. */
export const CUSTO_HASH_SENHA = 10;

/**
 * Finalidade registrada junto ao consentimento LGPD no cadastro de clientes.
 * Alterar este valor implica nova manifestação de consentimento (ver Etapa 5).
 */
export const LGPD_FINALIDADE_CADASTRO = 'cadastro e atendimento veterinário';

/** Versão do termo de consentimento aceito no cadastro de clientes. */
export const LGPD_VERSAO_TERMO = '1.0';

/** Status ASCII usados em banco, backend e renderer. */
export const STATUS_CONSULTA = ['AGENDADA', 'CONFIRMADA', 'CONCLUIDA', 'CANCELADA'] as const;
export const STATUS_CANCELAVEIS = ['AGENDADA', 'CONFIRMADA'] as const;
export const STATUS_CONCLUIVEIS = ['AGENDADA', 'CONFIRMADA'] as const;

/** Duração padrão de uma consulta; o banco também aplica este valor como default. */
export const DURACAO_PADRAO_CONSULTA_MINUTOS = 60;

/** Teto simples de registros devolvidos pela agenda em uma listagem. */
export const LIMITE_LISTAGEM_CONSULTAS = 200;

/** Limites dos dados cadastrais exigidos pela especificação do sistema. */
export const CLIENTE_RG_MAXIMO = 30;
export const CLIENTE_NASCIMENTO_ANO_MINIMO = 1900;
export const PET_IDADE_MAXIMA_ANOS = 100;

/** Limites dos campos textuais do prontuário (persistidos em `@db.Text`). */
export const PRONTUARIO_TEXTO_MINIMO = 3;
export const PRONTUARIO_TEXTO_MAXIMO = 2000;

/** Faixa clínica aceita para a temperatura aferida, em graus Celsius. */
export const PRONTUARIO_TEMPERATURA_MINIMA_C = 30;
export const PRONTUARIO_TEMPERATURA_MAXIMA_C = 45;

/** Limites dos campos da carteira de vacinação. */
export const VACINA_NOME_MAXIMO = 120;
export const VACINA_FABRICANTE_MAXIMO = 120;
export const VACINA_LOTE_MAXIMO = 64;
export const VACINA_DOSE_MAXIMO = 60;
export const VACINA_REACAO_MAXIMO = 500;
export const VACINA_OBSERVACOES_MAXIMO = 2000;

/** Teto de registros devolvidos na carteira de um pet. */
export const LIMITE_LISTAGEM_VACINAS = 200;

/**
 * Janela extra usada na busca indexada de conflitos: consultas que começam
 * antes do novo horário podem terminar depois dele. O corte exato é feito no
 * service com o `duracaoMinutos` de cada consulta; consultas acima de 24h
 * exigiriam ampliar esta janela.
 */
export const JANELA_BUSCA_CONFLITOS_HORAS = 24;

/** Limites dos campos de produtos e lotes do estoque. */
export const ESTOQUE_NOME_MAXIMO = 120;
export const ESTOQUE_CATEGORIA_MAXIMO = 80;
export const ESTOQUE_CODIGO_LOTE_MAXIMO = 64;
export const ESTOQUE_PRECO_MAXIMO = 99999999.99;

/** Tetos de listagem e janela de alerta exibida na interface. */
export const LIMITE_LISTAGEM_ESTOQUE = 200;
export const ESTOQUE_ALERTA_VALIDADE_DIAS = 90;

/** Limites textuais dos anexos clínicos (campos VARCHAR do banco). */
export const ANEXO_DESCRICAO_MINIMO = 3;
export const ANEXO_DESCRICAO_MAXIMO = 200;
export const ANEXO_MOTIVO_MAXIMO = 500;
export const ANEXO_NOME_ORIGINAL_MAXIMO = 255;

/** 10 MiB; o frontend usa o mesmo teto para evitar seleções descnecessárias. */
export const ANEXO_TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024;

/** Teto de anexos devolvidos por pet; protege o IPC de respostas gigantes. */
export const LIMITE_LISTAGEM_ANEXOS = 200;

/** Validade do token de staging: arquivos não confirmados são removidos depois disso. */
export const ANEXO_STAGING_TTL_MINUTOS = 30;

/** Alerta de quantidade mínima ligado por padrão para produtos novos. */
export const ESTOQUE_ALERTA_PADRAO = true;

/** Dias de antecedência para avisar tutores sobre a próxima dose informada. */
export const VACINA_ALERTA_DIAS = 30;

/** Maior intervalo aceito pelos filtros de relatório (em meses). */
export const RELATORIO_PERIODO_MAXIMO_MESES = 24;

/** Tempo de cache da cotação do dólar consultada na API externa. */
export const COTACAO_DOLAR_CACHE_MINUTOS = 60;

/** Prefixo do assunto dos e-mails automáticos da clínica. */
export const SMTP_ASSUNTO_PREFIXO = '[PetHealthPD]';

/** Categorias clínicas aceitas; ordem estável para exibição no formulário. */
export const ANEXO_CATEGORIAS = [
  'EXAME_LABORATORIAL',
  'IMAGEM',
  'DOCUMENTO',
  'PRESCRICAO',
  'OUTRO',
] as const;

/** MIMEs aceitos; a assinatura binária é conferida no processo principal. */
export const ANEXO_MIMES_ACEITOS = ['application/pdf', 'image/jpeg', 'image/png'] as const;

/* ---------------- Fase 2: preços, orçamentos e financeiro ---------------- */

/** Situações possíveis de um orçamento. */
export const ORCAMENTO_STATUS = ['PENDENTE', 'APROVADO', 'REPROVADO', 'CANCELADO'] as const;

/** Situações possíveis de uma movimentação financeira. */
export const MOVIMENTACAO_STATUS = ['PENDENTE', 'PAGO', 'CANCELADO'] as const;

/** Tipos de movimentação financeira. */
export const MOVIMENTACAO_TIPOS = ['RECEITA', 'DESPESA'] as const;

/** Tipos de item de orçamento. */
export const PRECO_ITEM_TIPOS = ['PRODUTO', 'SERVICO'] as const;

/** Origens auditáveis do histórico de preço. */
export const ORIGEM_HISTORICO_PRECO = ['PRODUTO', 'TABELA_PRECO'] as const;

/** Quantidade máxima por item de orçamento. */
export const ITEM_QUANTIDADE_MAXIMA = 100_000;

/** Tamanho máximo do campo de forma de pagamento. */
export const FORMA_PAGAMENTO_MAXIMA = 40;
