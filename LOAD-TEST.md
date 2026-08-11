# Teste de carga

Este projeto tem um teste simples para simular varias pessoas usando o sistema ao mesmo tempo.

## Uso local recomendado

```bash
npm run load-test
```

Se nao houver servidor local rodando, o teste inicia um automaticamente usando um banco temporario.

## Ajustar intensidade

```bash
LOAD_TEST_USERS=50 LOAD_TEST_ITERATIONS=10 npm run load-test
```

Isso simula 50 usuarios simultaneos, cada um fazendo 10 vendas.

## Testar outra URL

```bash
LOAD_TEST_URL=http://127.0.0.1:3017 npm run load-test
```

Se quiser obrigar o teste a usar um servidor que voce abriu manualmente, rode:

```bash
LOAD_TEST_NO_AUTO_START=1 npm run load-test
```

Para testar producao, use com cuidado:

```bash
LOAD_TEST_ALLOW_PROD=1 LOAD_TEST_URL=https://estoqueoleos.vercel.app LOAD_TEST_USERS=10 LOAD_TEST_ITERATIONS=2 npm run load-test
```

O teste cria usuario, produto e clientes de teste. Evite rodar forte em producao.

## O que o teste verifica

- Se as rotas respondem sem erro.
- Tempo medio, p95 e p99 das requisicoes.
- Se clientes foram criados na quantidade esperada.
- Se o estoque final bate com a quantidade de vendas simuladas.

Se o estoque final nao bater, existe risco de concorrencia quando varias vendas alteram o mesmo item ao mesmo tempo.
