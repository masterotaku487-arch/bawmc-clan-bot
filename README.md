# 🤖 Kira Bot

Bot IA para Discord usando **Groq (LLaMA 3)** + **Cloudflare Workers**.

---

## 📁 Estrutura
```
kira-bot/
├── index.js        ← código principal
├── package.json
├── wrangler.toml
└── README.md
```

---

## 🚀 Deploy passo a passo

### 1. Criar o App no Discord
1. Acesse https://discord.com/developers/applications
2. Clique em **New Application** → nomeie "Kira"
3. Vá em **Bot** → clique **Add Bot**
4. Copie o **Token** do bot
5. Vá em **General Information** → copie o **Application ID** e a **Public Key**
6. Em **OAuth2 → URL Generator**: marque `bot` + `applications.commands`  
   Permissões: `Send Messages`, `Read Messages`  
   Copie o link e adicione a Kira ao seu servidor

### 2. Pegar a chave Groq
1. Acesse https://console.groq.com
2. Crie uma conta gratuita
3. Vá em **API Keys** → gere uma chave

### 3. Subir para o GitHub
1. Crie um repositório no GitHub
2. Faça push dos arquivos

### 4. Deploy no Cloudflare Workers
```bash
# Instalar dependências
npm install

# Login no Cloudflare
npx wrangler login

# Configurar os secrets (um por um):
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put DISCORD_APP_ID
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put GROQ_KEY
npx wrangler secret put REGISTER_SECRET   # qualquer senha sua, ex: "minhasenha123"

# Deploy!
npx wrangler deploy
```

Após o deploy, o Wrangler vai exibir a URL do Worker, tipo:
```
https://kira-bot.SEU_USUARIO.workers.dev
```

### 5. Configurar o Discord para apontar para o Worker
1. No Discord Developer Portal → seu app → **General Information**
2. Em **Interactions Endpoint URL** cole:
   ```
   https://kira-bot.SEU_USUARIO.workers.dev/interactions
   ```
3. Clique **Save Changes** — o Discord vai verificar automaticamente ✅

### 6. Registrar os slash commands (só uma vez)
Acesse no navegador:
```
https://kira-bot.SEU_USUARIO.workers.dev/register?secret=SUA_REGISTER_SECRET
```
Vai aparecer: `✅ Comandos registrados!`

---

## 💬 Comandos disponíveis

| Comando | Descrição |
|---------|-----------|
| `/kira [mensagem]` | Conversa com a Kira |
| `/ping` | Verifica se está online |
| `/ajuda` | Lista de comandos |
| `/sobre` | Info sobre a Kira |

> ⚠️ **Menção com @**: O Cloudflare Workers **não suporta gateway** (websocket).  
> Para @ funcionar, você precisaria rodar em Railway/Render com discord.py ou discord.js gateway.  
> No Workers, use `/kira` que funciona igual!

---

## 🔄 Deploy automático pelo GitHub (opcional)
No painel do Cloudflare:
1. Workers & Pages → Create → Connect to Git
2. Selecione seu repositório
3. A cada push na `main`, faz deploy automático ✅
