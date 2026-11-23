-- Migração inicial do PetHealthPD para MySQL 8 (preparada offline; NÃO aplicada).
-- Regenerada em 20/11/2026 com o complemento da Etapa 9 (anexos clínicos):
--   prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
-- (DATABASE_URL dummy informada apenas na sessão do comando; nada gravado em arquivo.)
--
-- Ajustes MANUAIS aplicados abaixo do SQL gerado (recursos que o Prisma não emite):
--   * ENGINE=InnoDB explícito em todas as tabelas (o MySQL 8 já usa InnoDB como padrão),
--     inclusive em RegistroVacina (Etapa 7) e AnexoClinico (Etapa 9);
--   * DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci em todas as CREATE TABLE;
--   * CHECK constraints de domínio, coerência do consentimento LGPD, da agenda,
--     do prontuário, da carteira de vacinação e agora dos anexos clínicos.
--
-- CHECK constraints MANUAIS presentes no rodapé (o Prisma Migrate NÃO gera e NÃO
-- gerencia CHECK; ao gerar migrações futuras, confira e reaplique esta seção):
--   Pet_peso_positivo_chk
--   Produto_preco_nao_negativo_chk
--   Produto_estoque_minimo_nao_negativo_chk
--   Lote_quantidade_nao_negativa_chk
--   Cliente_lgpd_coerente_chk
--   Consulta_duracao_positiva_chk
--   Consulta_status_valido_chk
--   Consulta_cancelamento_coerente_chk
--   Consulta_peso_aferido_positivo_chk (Etapa 6)
--   Consulta_temperatura_faixa_chk     (Etapa 6)
--   RegistroVacina_campos_obrigatorios_chk      (Etapa 7)
--   RegistroVacina_validade_coerente_chk        (Etapa 7)
--   RegistroVacina_proxima_dose_coerente_chk    (Etapa 7)
--   AnexoClinico_tamanho_valido_chk             (Etapa 9)
--   AnexoClinico_categoria_valida_chk           (Etapa 9)
--   AnexoClinico_mime_valido_chk                (Etapa 9)
--   AnexoClinico_nome_original_valido_chk       (Etapa 9)
--   AnexoClinico_nome_arquivo_valido_chk        (Etapa 9)
--   AnexoClinico_inativacao_coerente_chk        (Etapa 9)
--
-- IMPORTANTE: requer MySQL 8.0.16 ou superior para CHECK constraints enforced.
-- Em versões anteriores a sintaxe é aceita, mas a constraint é ignorada.
--
-- Convenções: `BOOLEAN` do Prisma vira TINYINT(1) no MySQL; todo DATETIME(6) é
-- gravado em UTC pela aplicação (formatação pt-BR apenas no renderer);
-- charset/collation utf8mb4 / utf8mb4_unicode_ci preserva acentos pt-BR.
-- Status de Consulta: AGENDADA | CONFIRMADA | CONCLUIDA | CANCELADA (ASCII, sem acento).
-- RegistroVacina.validade e RegistroVacina.proximaDose são DATE (sem hora),
-- enviadas pela aplicação no formato YYYY-MM-DD; aplicadaEm e registradoEm
-- são DATETIME(6) em UTC. Nenhuma regra de calendário vacinal é imposta aqui:
-- a tabela apenas rastreia o que foi aplicado.
-- AnexoClinico.dataDocumento também é DATE civil (YYYY-MM-DD). A regra
-- "não pode ser futura" fica no service: NOW() não é determinístico e
-- quebraria o `prisma migrate diff`. Categoria em tokens ASCII
-- (EXAME_LABORATORIAL | IMAGEM | DOCUMENTO | PRESCRICAO | OUTRO), MIME em
-- whitelist (application/pdf | image/jpeg | image/png) e tamanho até 10 MiB.

-- CreateTable
CREATE TABLE `Usuario` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(120) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `senhaHash` VARCHAR(255) NOT NULL,
    `role` VARCHAR(30) NOT NULL DEFAULT 'ATENDENTE',
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `crmv` VARCHAR(30) NULL,
    `rg` VARCHAR(30) NULL,
    `criadoEm` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `atualizadoEm` DATETIME(6) NOT NULL,

    UNIQUE INDEX `Usuario_email_key`(`email`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Cliente` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(120) NOT NULL,
    `cpf` VARCHAR(11) NOT NULL,
    `telefone` VARCHAR(11) NOT NULL,
    `email` VARCHAR(254) NULL,
    `cep` VARCHAR(8) NOT NULL,
    `logradouro` VARCHAR(200) NOT NULL,
    `bairro` VARCHAR(120) NOT NULL,
    `cidade` VARCHAR(120) NOT NULL,
    `uf` VARCHAR(2) NOT NULL,
    `aceiteLgpd` BOOLEAN NOT NULL DEFAULT false,
    `lgpdAceiteEm` DATETIME(6) NULL,
    `lgpdFinalidade` VARCHAR(255) NULL,
    `lgpdVersaoTermo` VARCHAR(20) NULL,
    `criadoEm` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `atualizadoEm` DATETIME(6) NOT NULL,
    `criadoPorId` INTEGER NULL,

    UNIQUE INDEX `Cliente_cpf_key`(`cpf`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Pet` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(120) NOT NULL,
    `especie` VARCHAR(80) NOT NULL,
    `raca` VARCHAR(120) NOT NULL,
    `peso` DOUBLE NOT NULL,
    `nascimento` VARCHAR(20) NULL,
    `clienteId` INTEGER NOT NULL,
    `criadoEm` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `atualizadoEm` DATETIME(6) NOT NULL,
    `criadoPorId` INTEGER NULL,

    INDEX `Pet_clienteId_idx`(`clienteId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Consulta` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dataHora` DATETIME(6) NOT NULL,
    `duracaoMinutos` INTEGER NOT NULL DEFAULT 60,
    `motivo` TEXT NOT NULL,
    `diagnostico` TEXT NULL,
    `exameClinico` TEXT NULL,
    `conduta` TEXT NULL,
    `pesoAferido` DOUBLE NULL,
    `temperaturaC` DOUBLE NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'AGENDADA',
    `petId` INTEGER NOT NULL,
    `veterinarioId` INTEGER NOT NULL,
    `criadoEm` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `atualizadoEm` DATETIME(6) NOT NULL,
    `criadoPorId` INTEGER NULL,
    `canceladoPorId` INTEGER NULL,
    `canceladoEm` DATETIME(6) NULL,
    `motivoCancelamento` TEXT NULL,
    `concluidaPorId` INTEGER NULL,
    `concluidaEm` DATETIME(6) NULL,

    INDEX `Consulta_dataHora_status_idx`(`dataHora`, `status`),
    INDEX `Consulta_veterinarioId_dataHora_status_idx`(`veterinarioId`, `dataHora`, `status`),
    INDEX `Consulta_petId_dataHora_status_idx`(`petId`, `dataHora`, `status`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Produto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(120) NOT NULL,
    `categoria` VARCHAR(80) NOT NULL,
    `estoqueMinimo` INTEGER NOT NULL DEFAULT 5,
    `precoBrl` DECIMAL(10, 2) NOT NULL,

    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Lote` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(64) NOT NULL,
    `validade` DATETIME(6) NOT NULL,
    `quantidade` INTEGER NOT NULL,
    `produtoId` INTEGER NOT NULL,
    `criadoEm` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `atualizadoEm` DATETIME(6) NOT NULL,

    UNIQUE INDEX `Lote_codigo_key`(`codigo`),
    INDEX `Lote_produtoId_idx`(`produtoId`),
    INDEX `Lote_validade_idx`(`validade`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable (Etapa 9 — anexos clínicos; evolução do stub `Anexo`)
CREATE TABLE `AnexoClinico` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `petId` INTEGER NOT NULL,
    `consultaId` INTEGER NULL,
    `responsavelId` INTEGER NOT NULL,
    `descricao` VARCHAR(200) NOT NULL,
    `categoria` VARCHAR(40) NOT NULL,
    `dataDocumento` DATE NOT NULL,
    `nomeOriginal` VARCHAR(255) NOT NULL,
    `nomeArquivoGerado` VARCHAR(64) NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `tamanhoBytes` INTEGER NOT NULL,
    `checksumSha256` VARCHAR(64) NOT NULL,
    `registradoPorId` INTEGER NOT NULL,
    `registradoEm` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `atualizadoEm` DATETIME(6) NOT NULL,
    `inativo` BOOLEAN NOT NULL DEFAULT false,
    `inativadoPorId` INTEGER NULL,
    `inativadoEm` DATETIME(6) NULL,
    `motivoInativacao` VARCHAR(500) NULL,

    UNIQUE INDEX `AnexoClinico_nomeArquivoGerado_key`(`nomeArquivoGerado`),
    INDEX `AnexoClinico_petId_inativo_registradoEm_idx`(`petId`, `inativo`, `registradoEm`),
    INDEX `AnexoClinico_consultaId_inativo_registradoEm_idx`(`consultaId`, `inativo`, `registradoEm`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable (Etapa 7 — carteira de vacinação)
CREATE TABLE `RegistroVacina` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `petId` INTEGER NOT NULL,
    `veterinarioId` INTEGER NOT NULL,
    `consultaId` INTEGER NULL,
    `vacina` VARCHAR(120) NOT NULL,
    `fabricante` VARCHAR(120) NOT NULL,
    `lote` VARCHAR(64) NOT NULL,
    `validade` DATE NOT NULL,
    `aplicadaEm` DATETIME(6) NOT NULL,
    `dose` VARCHAR(60) NOT NULL,
    `proximaDose` DATE NULL,
    `reacao` VARCHAR(500) NULL,
    `observacoes` TEXT NULL,
    `registradoPorId` INTEGER NOT NULL,
    `registradoEm` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `atualizadoEm` DATETIME(6) NOT NULL,

    INDEX `RegistroVacina_petId_aplicadaEm_idx`(`petId`, `aplicadaEm`),
    INDEX `RegistroVacina_veterinarioId_idx`(`veterinarioId`),
    INDEX `RegistroVacina_consultaId_idx`(`consultaId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Cliente` ADD CONSTRAINT `Cliente_criadoPorId_fkey` FOREIGN KEY (`criadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Pet` ADD CONSTRAINT `Pet_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `Cliente`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Pet` ADD CONSTRAINT `Pet_criadoPorId_fkey` FOREIGN KEY (`criadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Consulta` ADD CONSTRAINT `Consulta_petId_fkey` FOREIGN KEY (`petId`) REFERENCES `Pet`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Consulta` ADD CONSTRAINT `Consulta_veterinarioId_fkey` FOREIGN KEY (`veterinarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Consulta` ADD CONSTRAINT `Consulta_criadoPorId_fkey` FOREIGN KEY (`criadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Consulta` ADD CONSTRAINT `Consulta_canceladoPorId_fkey` FOREIGN KEY (`canceladoPorId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Consulta` ADD CONSTRAINT `Consulta_concluidaPorId_fkey` FOREIGN KEY (`concluidaPorId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lote` ADD CONSTRAINT `Lote_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `Produto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (Etapa 9) — prontuário: RESTRICT para não perder o anexo.
ALTER TABLE `AnexoClinico` ADD CONSTRAINT `AnexoClinico_petId_fkey` FOREIGN KEY (`petId`) REFERENCES `Pet`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (Etapa 9) — consulta é opcional; exclusão da consulta preserva o anexo.
ALTER TABLE `AnexoClinico` ADD CONSTRAINT `AnexoClinico_consultaId_fkey` FOREIGN KEY (`consultaId`) REFERENCES `Consulta`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (Etapa 9) — responsável técnico.
ALTER TABLE `AnexoClinico` ADD CONSTRAINT `AnexoClinico_responsavelId_fkey` FOREIGN KEY (`responsavelId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (Etapa 9) — quem registrou o anexo.
ALTER TABLE `AnexoClinico` ADD CONSTRAINT `AnexoClinico_registradoPorId_fkey` FOREIGN KEY (`registradoPorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (Etapa 9) — quem inativou (opcional; SET NULL preserva a auditoria).
ALTER TABLE `AnexoClinico` ADD CONSTRAINT `AnexoClinico_inativadoPorId_fkey` FOREIGN KEY (`inativadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (Etapa 7)
ALTER TABLE `RegistroVacina` ADD CONSTRAINT `RegistroVacina_petId_fkey` FOREIGN KEY (`petId`) REFERENCES `Pet`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (Etapa 7)
ALTER TABLE `RegistroVacina` ADD CONSTRAINT `RegistroVacina_veterinarioId_fkey` FOREIGN KEY (`veterinarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (Etapa 7) — consulta é opcional; exclusão da consulta preserva o registro.
ALTER TABLE `RegistroVacina` ADD CONSTRAINT `RegistroVacina_consultaId_fkey` FOREIGN KEY (`consultaId`) REFERENCES `Consulta`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (Etapa 7)
ALTER TABLE `RegistroVacina` ADD CONSTRAINT `RegistroVacina_registradoPorId_fkey` FOREIGN KEY (`registradoPorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Check constraints (MANUAIS — NÃO gerenciadas pelo Prisma Migrate)
-- ---------------------------------------------------------------------------
-- Domínio / integridade geral
ALTER TABLE `Pet` ADD CONSTRAINT `Pet_peso_positivo_chk` CHECK (`peso` > 0);
ALTER TABLE `Produto` ADD CONSTRAINT `Produto_preco_nao_negativo_chk` CHECK (`precoBrl` >= 0);
ALTER TABLE `Produto` ADD CONSTRAINT `Produto_estoque_minimo_nao_negativo_chk` CHECK (`estoqueMinimo` >= 0);
ALTER TABLE `Lote` ADD CONSTRAINT `Lote_quantidade_nao_negativa_chk` CHECK (`quantidade` >= 0);

-- Consentimento: sem aceite não pode haver metadados de LGPD; com aceite, todos são obrigatórios.
ALTER TABLE `Cliente` ADD CONSTRAINT `Cliente_lgpd_coerente_chk` CHECK (
    (`aceiteLgpd` = false AND `lgpdAceiteEm` IS NULL AND `lgpdFinalidade` IS NULL AND `lgpdVersaoTermo` IS NULL)
    OR
    (`aceiteLgpd` = true AND `lgpdAceiteEm` IS NOT NULL AND `lgpdFinalidade` IS NOT NULL AND `lgpdVersaoTermo` IS NOT NULL)
);

-- Agenda (Etapa 5)
-- Base persistida do cálculo de sobreposição: duração sempre positiva.
ALTER TABLE `Consulta` ADD CONSTRAINT `Consulta_duracao_positiva_chk` CHECK (`duracaoMinutos` > 0);

-- Status ASCII sem acento; evita divergência entre collation, JS e logs.
ALTER TABLE `Consulta` ADD CONSTRAINT `Consulta_status_valido_chk`
    CHECK (`status` IN ('AGENDADA', 'CONFIRMADA', 'CONCLUIDA', 'CANCELADA'));

-- Uma consulta CANCELADA precisa registrar quem/quando e o motivo (rastreabilidade).
-- Observação: canceladoPorId é preenchido pelo service quando disponível; a
-- obrigatoriedade de usuário não é imposta aqui para não alterar regras de negócio.
ALTER TABLE `Consulta` ADD CONSTRAINT `Consulta_cancelamento_coerente_chk` CHECK (
    (`status` <> 'CANCELADA')
    OR (
        `canceladoEm` IS NOT NULL
        AND `motivoCancelamento` IS NOT NULL
        AND TRIM(`motivoCancelamento`) <> ''
    )
);

-- Prontuário textual (Etapa 6)
-- As medições são opcionais; quando informadas, peso deve ser > 0 e temperatura
-- deve ficar entre 30 e 45 °C (faixa clínica plausível para animais atendidos).
-- O preenchimento do prontuário NÃO altera `status` nem `concluidaEm`: a conclusão
-- continua sendo uma ação explícita, fora do escopo desta migração.
ALTER TABLE `Consulta` ADD CONSTRAINT `Consulta_peso_aferido_positivo_chk`
    CHECK (`pesoAferido` IS NULL OR `pesoAferido` > 0);

ALTER TABLE `Consulta` ADD CONSTRAINT `Consulta_temperatura_faixa_chk`
    CHECK (`temperaturaC` IS NULL OR (`temperaturaC` >= 30 AND `temperaturaC` <= 45));

-- Carteira de vacinação (Etapa 7)
-- Campos de rastreabilidade não podem ser enviados em branco; a validade do lote
-- e a próxima dose não podem ser anteriores ao dia da aplicação.
-- Não há CHECK de calendário/intervalo vacinal: isso seria regra clínica.
ALTER TABLE `RegistroVacina` ADD CONSTRAINT `RegistroVacina_campos_obrigatorios_chk` CHECK (
    CHAR_LENGTH(TRIM(`vacina`)) > 0
    AND CHAR_LENGTH(TRIM(`fabricante`)) > 0
    AND CHAR_LENGTH(TRIM(`lote`)) > 0
    AND CHAR_LENGTH(TRIM(`dose`)) > 0
);

ALTER TABLE `RegistroVacina` ADD CONSTRAINT `RegistroVacina_validade_coerente_chk`
    CHECK (`validade` >= DATE(`aplicadaEm`));

ALTER TABLE `RegistroVacina` ADD CONSTRAINT `RegistroVacina_proxima_dose_coerente_chk`
    CHECK (`proximaDose` IS NULL OR `proximaDose` >= DATE(`aplicadaEm`));

-- Anexos clínicos (Etapa 9)
-- Limite aprovado: 10 MiB = 10485760 bytes.
ALTER TABLE `AnexoClinico` ADD CONSTRAINT `AnexoClinico_tamanho_valido_chk`
    CHECK (`tamanhoBytes` > 0 AND `tamanhoBytes` <= 10485760);

-- Tokens ASCII (sem acento) para não depender da collation.
ALTER TABLE `AnexoClinico` ADD CONSTRAINT `AnexoClinico_categoria_valida_chk`
    CHECK (`categoria` IN ('EXAME_LABORATORIAL', 'IMAGEM', 'DOCUMENTO', 'PRESCRICAO', 'OUTRO'));

-- Whitelist de MIME types aceitos no storage local.
ALTER TABLE `AnexoClinico` ADD CONSTRAINT `AnexoClinico_mime_valido_chk`
    CHECK (`mimeType` IN ('application/pdf', 'image/jpeg', 'image/png'));

-- Basename sanitizado: não pode ser vazio nem conter apenas espaços.
ALTER TABLE `AnexoClinico` ADD CONSTRAINT `AnexoClinico_nome_original_valido_chk`
    CHECK (CHAR_LENGTH(TRIM(`nomeOriginal`)) > 0);

-- UUID v4 (versão 4, variante 8/9/a/b) seguido de extensão opcional de 1 a 5
-- caracteres alfanuméricos minúsculos. `[.]` evita escaping de backslash no SQL.
ALTER TABLE `AnexoClinico` ADD CONSTRAINT `AnexoClinico_nome_arquivo_valido_chk`
    CHECK (`nomeArquivoGerado` REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}([.][a-z0-9]{1,5})?$');

-- Exclusão lógica coerente: inativo=false exige os 3 campos nulos; inativo=true
-- exige data e motivo não vazio. `IS NOT NULL` explícito evita o buraco do
-- CHECK do MySQL, que considera UNKNOWN (NULL) como satisfeito.
ALTER TABLE `AnexoClinico` ADD CONSTRAINT `AnexoClinico_inativacao_coerente_chk` CHECK (
    (`inativo` = false AND `inativadoPorId` IS NULL AND `inativadoEm` IS NULL AND `motivoInativacao` IS NULL)
    OR
    (`inativo` = true AND `inativadoEm` IS NOT NULL AND `motivoInativacao` IS NOT NULL AND CHAR_LENGTH(TRIM(`motivoInativacao`)) > 0)
);
