-- PetHealthPD: alerta de estoque configurável, auditoria de avisos de vacina
-- e cotação do dólar. Esta migration apenas ADICIONA objetos: nenhuma CHECK
-- existente é alterada ou removida.

ALTER TABLE `Produto`
  ADD COLUMN `alertaEstoque` BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE `RegistroVacina`
  ADD COLUMN `ultimoAvisoEm` DATETIME(6) NULL,
  ADD COLUMN `ultimoAvisoProximaDose` DATE NULL;

CREATE TABLE `CotacaoDolar` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `dataReferencia` DATE NOT NULL,
  `valor` DECIMAL(10, 4) NOT NULL,
  `fonte` VARCHAR(80) NOT NULL,
  `consultadoEm` DATETIME(6) NOT NULL,
  UNIQUE INDEX `CotacaoDolar_dataReferencia_key` (`dataReferencia`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Produto_alertaEstoque_idx` ON `Produto`(`alertaEstoque`);
CREATE INDEX `RegistroVacina_proximaDose_estornado_idx` ON `RegistroVacina`(`proximaDose`, `estornado`);
