-- CRUD completo com exclusão lógica auditável (Etapa 10).
-- Nenhuma linha clínica é apagada: "Delete" passa a ser inativação/estorno
-- com motivo, responsável e data. Aplica-se sobre 20261119163348_init_mysql.

-- Usuario: inativação de contas ( Mantém a responsabilidade técnica ).
ALTER TABLE `Usuario`
  ADD COLUMN `inativadoPorId` INT NULL,
  ADD COLUMN `inativadoEm` DATETIME(6) NULL,
  ADD COLUMN `motivoInativacao` VARCHAR(500) NULL;

ALTER TABLE `Usuario`
  ADD CONSTRAINT `Usuario_inativadoPorId_fkey`
  FOREIGN KEY (`inativadoPorId`) REFERENCES `Usuario`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Cliente: bloqueio de novos agendamentos sem apagar histórico clínico.
ALTER TABLE `Cliente`
  ADD COLUMN `ativo` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `inativadoPorId` INT NULL,
  ADD COLUMN `inativadoEm` DATETIME(6) NULL,
  ADD COLUMN `motivoInativacao` VARCHAR(500) NULL;

ALTER TABLE `Cliente`
  ADD CONSTRAINT `Cliente_inativadoPorId_fkey`
  FOREIGN KEY (`inativadoPorId`) REFERENCES `Usuario`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `Cliente_ativo_idx` ON `Cliente`(`ativo`);

-- Pet: baixa lógica por óbito, doação ou extravio preserva o prontuário.
ALTER TABLE `Pet`
  ADD COLUMN `ativo` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `inativadoPorId` INT NULL,
  ADD COLUMN `inativadoEm` DATETIME(6) NULL,
  ADD COLUMN `motivoInativacao` VARCHAR(500) NULL;

ALTER TABLE `Pet`
  ADD CONSTRAINT `Pet_inativadoPorId_fkey`
  FOREIGN KEY (`inativadoPorId`) REFERENCES `Usuario`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `Pet_ativo_idx` ON `Pet`(`ativo`);

-- Produto: descontinuação rastreável.
ALTER TABLE `Produto`
  ADD COLUMN `ativo` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `inativadoPorId` INT NULL,
  ADD COLUMN `inativadoEm` DATETIME(6) NULL,
  ADD COLUMN `motivoInativacao` VARCHAR(500) NULL;

ALTER TABLE `Produto`
  ADD CONSTRAINT `Produto_inativadoPorId_fkey`
  FOREIGN KEY (`inativadoPorId`) REFERENCES `Usuario`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `Produto_ativo_idx` ON `Produto`(`ativo`);

-- Lote: baixa lógica (vencido/devolvido/descarte/erro) nunca faz a
-- quantidade desaparecer silenciosamente.
ALTER TABLE `Lote`
  ADD COLUMN `ativo` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `baixadoPorId` INT NULL,
  ADD COLUMN `baixadoEm` DATETIME(6) NULL,
  ADD COLUMN `motivoBaixa` VARCHAR(500) NULL;

ALTER TABLE `Lote`
  ADD CONSTRAINT `Lote_baixadoPorId_fkey`
  FOREIGN KEY (`baixadoPorId`) REFERENCES `Usuario`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `Lote_ativo_idx` ON `Lote`(`ativo`);

-- RegistroVacina: estorno lógico mantém a prova sanitária original.
ALTER TABLE `RegistroVacina`
  ADD COLUMN `estornado` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `estornadoPorId` INT NULL,
  ADD COLUMN `estornadoEm` DATETIME(6) NULL,
  ADD COLUMN `motivoEstorno` VARCHAR(500) NULL;

ALTER TABLE `RegistroVacina`
  ADD CONSTRAINT `RegistroVacina_estornadoPorId_fkey`
  FOREIGN KEY (`estornadoPorId`) REFERENCES `Usuario`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `RegistroVacina_estornado_idx` ON `RegistroVacina`(`estornado`);
