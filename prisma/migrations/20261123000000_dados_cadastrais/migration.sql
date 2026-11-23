-- Complemento da especificação do PetHealthPD (dados cadastrais e prescrição).
-- Aplica-se sobre 20261119163348_init_mysql e 20261120120000_crud_logico.
--
-- Campos acrescentados:
--   Cliente.rg              -> RG do tutor (VARCHAR(30), opcional no banco e
--                              obrigatório na validação da aplicação, para não
--                              impedir a migração de bases com linhas antigas);
--   Cliente.dataNascimento  -> DATE civil (YYYY-MM-DD), mesma convenção das
--                              demais colunas @db.Date do projeto;
--   Pet.idade               -> idade do animal em anos, inteira e não negativa;
--   Consulta.prescricao     -> texto clínico com o que foi receitado, mantido
--                              separado da conduta para facilitar a leitura do
--                              histórico.
--
-- `idade` entra com DEFAULT 0 apenas para que a ALTER funcione mesmo se a
-- tabela já tiver linhas; o DEFAULT é removido em seguida. Nenhuma linha é
-- apagada e nenhuma FK é alterada. Requer MySQL 8.0.16+ para o CHECK.
--
-- CHECK manual (o Prisma Migrate não gera CHECK): Pet_idade_valida_chk.

ALTER TABLE `Cliente`
  ADD COLUMN `rg` VARCHAR(30) NULL,
  ADD COLUMN `dataNascimento` DATE NULL;

ALTER TABLE `Pet`
  ADD COLUMN `idade` INTEGER NOT NULL DEFAULT 0;

ALTER TABLE `Pet`
  ADD CONSTRAINT `Pet_idade_valida_chk` CHECK (`idade` >= 0 AND `idade` <= 100);

ALTER TABLE `Pet`
  ALTER COLUMN `idade` DROP DEFAULT;

ALTER TABLE `Consulta`
  ADD COLUMN `prescricao` TEXT NULL;
