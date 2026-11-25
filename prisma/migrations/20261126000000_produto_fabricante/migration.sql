-- PetHealthPD: fabricante do produto, usado no preenchimento automático
-- dos campos de fabricante/lote/validade na carteira de vacinação.
ALTER TABLE `Produto`
  ADD COLUMN `fabricante` VARCHAR(120) NULL;
