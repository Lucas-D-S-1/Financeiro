# Piloto Open Finance do Agente de Gastos

O agente compartilha o endereço do piloto. O navegador cuida do login e do painel. O widget oficial Pluggy Connect cuida das credenciais bancárias. Cada usuário só acessa o seu espaço.

## Ensaio local

Use Node.js 24, Docker e o Chromium do Playwright. Execute a partir de `piloto/` no worktree. O ID do stack é `pluggy_piloto_mvp`, sem vínculo com projeto hospedado.

```sh
npm ci
npx playwright install chromium
npm run db -- start >/dev/null
npm test
```

A suíte usa Supabase, Mailpit e Chromium reais. A Pluggy da suíte é um simulador em memória, sem tráfego externo. Use o stack apenas em máquina ou rede de desenvolvimento isolada. Confira `docker ps` no seu ambiente. O Supabase CLI pode publicar as portas do Docker além do loopback. O app abre em `http://localhost:56730/` e o Mailpit em `http://127.0.0.1:56724/`.

Para abrir o app fora dos testes, copie `.env.example` para `.env.local` com permissão 0600 e informe um endereço de contato de teste. Rode `node --env-file=.env.local tools/local.mjs`. O script carrega as chaves do stack local sem imprimi-las. Antes de entrar, crie dois usuários sintéticos pelo painel de Auth ou pela API Admin local com `email_confirm=true` e sem senha conhecida. O primeiro acesso é provado pelo magic link, aberto no mesmo navegador em que foi solicitado.

## Ensaio com o Sandbox oficial

1. Use uma aplicação exclusiva com acesso somente a Sandbox e duas identidades sintéticas no app. No Dashboard Pluggy, a titular gera o Client ID, o Client Secret e o segredo de assinatura do webhook. Preencha `.env.local` pelo editor ou cofre local. Use chave aleatória de pelo menos 32 caracteres para `PILOT_WORKER_KEY`.
2. Aponte um endereço HTTPS temporário autorizado somente para `127.0.0.1:56731`. Quando souber a URL, preencha `PILOT_WEBHOOK_URL` com o caminho `/functions/v1/pilot/webhook` e mantenha `PILOT_MODE=sandbox`. Use `PILOT_WEBHOOK_ONLY=1 node --env-file=.env.local tools/local.mjs` no receptor e `node --env-file=.env.local tools/local.mjs` no app. O receptor recusa outros caminhos. O app local roda a fila automaticamente com a chave configurada.
3. Abra o app e faça login por Mailpit em dois contextos de navegador. Aceite o aviso e conecte duas variantes distintas de Pluggy Bank, por exemplo `user-ok` e `user-ok-two-checking-accounts`. Consulte a documentação da Pluggy para a senha de teste e o código MFA. Digite-os no widget. Confira que cada painel exibe apenas o próprio Item e os dados retornados.
4. Use os casos de [Sandbox oficial](https://docs.pluggy.ai/en/docs/guides/sandbox) para credencial inválida, conta bloqueada, provedor indisponível, parcial, MFA incorreto, ação exigida e autorização pendente. Teste a reconexão do pendente depois do tempo indicado. Registre estado e contagens, sem payload ou valores financeiros. Valide `/bills` pelo cartão retornado, pois a disponibilidade dos dados depende do conector.
5. Desconecte o primeiro usuário, espere o estado **Desconectado** e confira que o segundo ainda tem seus dados. Ao fim, remova os Items de teste, desligue o túnel e os dois processos locais e execute `npm run db -- stop`.

## Hospedagem separada

O front estático usa Cloudflare Workers Static Assets. Gere a variante de espera com `PILOT_PUBLIC_PAUSED=1` no `npm run build` e publique com `npx wrangler deploy`. Se o Supabase exclusivo já existir, inclua sua origem em `PILOT_PUBLIC_URL` para configurar o cabeçalho de conexão da versão de espera. Ela não carrega o cliente Supabase, não precisa de chave e não abre o login. Antes de ligar a emissão de tokens, mantenha `PILOT_CONNECT_ENABLED=0` no backend e conclua a configuração abaixo.

1. Configure o projeto Supabase escolhido por Lucas. No Auth, desative o signup público. Em **URL Configuration**, coloque a origem pública com `/` como Site URL e adicione a URL exata com `/?auth=1` aos Redirect URLs. Configure SMTP autorizado para o endereço externo e desabilite o rastreamento de links do remetente. Cadastre apenas a titular convidada em Auth → Users, com confirmação administrativa e magic link para o acesso.
2. Confira o identificador do projeto no Dashboard. Aplique a migration em `supabase/migrations/` e faça o deploy da função `pilot` explicitamente para aquele projeto. A função tem `verify_jwt=false` no gateway para receber webhook. Ela própria valida cada sessão com o Supabase Auth, verifica titularidade e verifica o HMAC/segredo de worker nas rotas respectivas.
3. Preencha as variáveis de `.env.example` em Edge Functions → Secrets. Defina `PILOT_WEB_URL` com a origem estática, `PILOT_WEBHOOK_URL` com a URL HTTPS da função terminada em `/pilot/webhook`, `PILOT_OWNER_ID` com o UUID da titular cadastrada e `PILOT_PRIVACY_CONTACT` com o contato aprovado. Use `PILOT_MODE=live` somente após validar o Sandbox separado, confirmar a aprovação dos conectores Open Finance e conferir a frequência de auto-sync que a Pluggy liberou. As credenciais live são da aplicação dedicada na conta dela. A sandbox não pode usar a mesma aplicação quando esta tiver acesso real.
4. No Vault desse projeto, adicione `pilot_worker_url` com a URL da função terminada em `/pilot/worker` e `pilot_worker_key` igual ao segredo de worker. Aplique `tools/cron.sql` nesse projeto. O fallback diário lê o estado atual da Pluggy e enfileira atualizações. A coleta no banco depende do auto-sync oferecido pela Pluggy e do consentimento ainda válido.
5. Defina no build `PILOT_WEB_URL`, `PILOT_PUBLIC_URL` com a origem do Supabase exclusivo e `PILOT_PUBLIC_KEY` com a chave publicável, nunca uma chave administrativa. Gere `npm run build` sem `PILOT_PUBLIC_PAUSED` e rode `npx wrangler deploy`. Confira o magic link e o retorno `/?connect=1` com o endereço aprovado.

A convidada usa a própria conta no [Dashboard Pluggy](https://dashboard.pluggy.ai/). Lucas e ela acertam quem registra os segredos diretamente no cofre do piloto. Para dados reais, a Pluggy precisa liberar os conectores. Confirme a disponibilidade de auto-sync no trial e combine o encerramento até o término dele. O aviso registra aceite de 15 dias a partir do aceite do app. Agende o término também pela data efetiva do trial, se for anterior. [Trial e conectores](https://v2.docs.pluggy.ai/pt/docs/get-started/contact) · [SMTP Supabase](https://supabase.com/docs/guides/auth/auth-smtp) · [Custos dos assets estáticos](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)

## Desligamento

1. No backend, defina `PILOT_CONNECT_ENABLED=0` para fechar a emissão de tokens e mantenha o worker e as credenciais ativos para concluir as remoções. A titular usa **Encerrar piloto e apagar dados**. O app remove as cópias e enfileira a revogação dos Items conhecidos.
2. Confirme o estado **Desconectado** e confira se sobrou algum Item na aplicação dela, inclusive um que ainda estava abrindo via widget. A titular remove pelo Dashboard qualquer Item restante e revoga a autorização no banco quando aplicável. Confirme de novo após a janela de 30 minutos de um token Connect já emitido.
3. Remova o acesso no Auth e, no projeto isolado, desagende `pluggy-piloto-worker` e `pluggy-piloto-reconciliacao` com `cron.unschedule`. Revogue os segredos da aplicação dedicada e retire os do Supabase/Vault. Encerre ou pause o projeto isolado de acordo com a decisão sobre retenção. Desabilite a rota workers.dev do Worker `piloto-open-finance-gastos` ou republique a versão pausada.
