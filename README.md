# Serra Cred — Controle de Empréstimos

## Rodar local
```
npm install
npm run dev
```

## Publicar no GitHub Pages (deploy automático a cada push)

1. Crie um repositório no GitHub (pode ser público, já que os dados ficam salvos no navegador de cada pessoa, não no servidor).
2. Abra `vite.config.js` e troque `base: '/serra-cred/'` pelo nome EXATO do seu repositório, ex: `base: '/nome-do-repo/'`.
3. Suba o código:
   ```
   git init
   git add .
   git commit -m "primeira versão"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/NOME-DO-REPO.git
   git push -u origin main
   ```
4. No GitHub, vá em **Settings → Pages** e em "Source" escolha **GitHub Actions**.
5. Aguarde alguns minutos — veja o progresso em **Actions**. Quando terminar, o site estará em:
   `https://SEU-USUARIO.github.io/NOME-DO-REPO/`
6. A cada `git push` na branch `main`, o site atualiza sozinho.

## Adicionar à tela de início do iPhone

1. Abra a URL publicada no Safari (precisa ser Safari, não outro navegador)
2. Toque em Compartilhar → Adicionar à Tela de Início
3. O ícone e o nome "Serra Cred" já aparecem configurados

## Backup

Na aba Painel → "Backup dos dados" é possível baixar um arquivo local ou sincronizar com uma planilha do Google Sheets (veja `google-apps-script.gs` para configurar a planilha).
