# Sistema de Gestão - Clínica Veterinária (MVP)

Aplicação desktop desenvolvida em **Electron + TypeScript + Prisma (SQLite)** com arquitetura orientada a objetos (Classes).

## Equipe
- **Laura:** Autenticação, Roles e LGPD
- **Eloah:** CRUD de Clientes e Pets + API ViaCEP
- **Júlia:** CRUD de Consultas e Validação de Horários
- **Ariely:** Controle de Estoque/Lotes + APIs Externas (Dólar, E-mail, Dog API)

## Como rodar o projeto
1. Instale as dependências: `npm install`
2. Gere o banco de dados: `npx prisma generate && npx prisma db push`
3. Inicie a aplicação: `npm start`