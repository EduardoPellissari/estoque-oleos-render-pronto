# Deploy no Render

Este projeto esta pronto para hospedar no Render com banco Postgres.

## O que foi preparado

- O sistema usa `DATABASE_URL` quando estiver no Render.
- O Render cria um banco Postgres pelo arquivo `render.yaml`.
- Localmente, sem `DATABASE_URL`, o sistema continua usando `database.json`.
- O arquivo `database.json` fica fora do Git para evitar enviar dados de usuarios.

## Passos

1. Crie um repositorio no GitHub.
2. Envie esta pasta para o repositorio.
3. Entre em https://dashboard.render.com.
4. Clique em **New +** e escolha **Blueprint**.
5. Conecte o repositorio do GitHub.
6. Confirme o arquivo `render.yaml`.
7. O Render deve criar:
   - Web service `estoque-doterra`
   - Banco Postgres `estoque-doterra-db`
8. Aguarde o deploy terminar.

## Link final

Depois do deploy, o Render gera um link parecido com:

`https://estoque-doterra.onrender.com`

Se quiser dominio personalizado, adicione em:

**Render > estoque-doterra > Settings > Custom Domains**

Depois aponte o DNS do seu dominio conforme as instrucoes que o Render mostrar.
