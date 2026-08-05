# Deploy na Vercel

Este projeto esta pronto para rodar na Vercel com banco Postgres.

## Antes de publicar

O sistema precisa de banco para salvar usuarios, logins e estoque. Na Vercel, nao use `database.json` para producao, porque funcoes serverless nao mantem arquivo local como banco permanente.

Use uma destas opcoes:

- Vercel Storage/Postgres pelo painel da Vercel.
- Neon Postgres conectado ao projeto.
- Outro Postgres externo.

O projeto aceita uma destas variaveis:

- `DATABASE_URL`
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`

## Passos pela Vercel

1. Envie estes arquivos para o GitHub.
2. Entre em https://vercel.com/dashboard.
3. Clique em **Add New > Project**.
4. Importe o repositorio do GitHub.
5. Em **Framework Preset**, deixe como **Other**.
6. Publique o projeto.
7. No projeto publicado, abra **Storage** e conecte/crie um banco Postgres.
8. Confirme que a Vercel adicionou uma variavel como `POSTGRES_URL`.
9. Faca um novo deploy se a Vercel nao fizer automaticamente.

## Como funciona

- Os arquivos `index.html` e `assets/` sao servidos como site estatico.
- As rotas `/api/...` rodam pela funcao `api/index.js`.
- Localmente, `npm start` continua funcionando com `database.json`.
