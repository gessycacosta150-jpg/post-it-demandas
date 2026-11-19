# Post-it Demandas

Post-it de demandas e checklist semanal para a área de trabalho do Windows.
Janela sempre por cima, abas de segunda a sábado, categorias, cronômetro opcional e atualização automática pelo GitHub.

## Como atualizar o programa

1. Altere o que quiser (por exemplo `index.html`). Pelo site: abra o arquivo, clique no lápis e depois em **Commit changes**.
2. Aumente o número da linha `"version"` no `package.json` (exemplo: `1.0.0` para `1.0.1`).
3. Crie uma nova versão em **Releases > Draft a new release**: em **Choose a tag** digite `v1.0.1` (o mesmo número, com `v` na frente), clique em **Create new tag** e depois em **Publish release**.

O GitHub (aba **Actions**) gera o instalador sozinho em 3 a 5 minutos e anexa na versão. O programa instalado confere o GitHub ao abrir (e a cada 4 horas), baixa a atualização e mostra o botão **Reiniciar e atualizar**.

A tag precisa ser igual à versão do `package.json`; se não for, o robô para e explica o motivo na aba Actions.

## Onde editar o que é pessoal

No começo do `<script>` do `index.html`: `USUARIA` e `AREA` (saudação) e `CATS` (categorias e cores).

## Avisos

- O instalador não é assinado digitalmente; o Windows pode mostrar o aviso do SmartScreen (Mais informações > Executar assim mesmo).
- Redes corporativas podem bloquear o GitHub; nesse caso a atualização não chega, mas o programa continua funcionando.
- Testar no computador (opcional, precisa do Node.js): `npm install` e `npm start`.
