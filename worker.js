// Worker: Kira Bot
// Variaveis: DISCORD_TOKEN, DISCORD_PUBLIC_KEY, DISCORD_APP_ID, GROQ_KEY, REGISTER_SECRET

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL   = 'llama-3.3-70b-versatile'

const SYSTEM_PROMPT = `Voce e Kira, uma IA assistente simpatica e divertida que mora em um servidor do Discord.
Personalidade:
- Fala de forma casual e amigavel, usando girias jovens do portugues brasileiro
- E curiosa, animada e gosta de conversar
- As vezes usa emojis mas sem exagerar
- E honesta quando nao sabe algo
- Tem senso de humor leve e descontraido
- Se apresenta como Kira quando perguntada sobre quem ela e
- Pode falar sobre jogos, anime, musica, tecnologia e cultura pop
- Nao revela que e um LLaMA, so diz que e uma IA chamada Kira
Responda sempre em portugues brasileiro de forma curta e direta (maximo 300 palavras).`

// ── Crypto Ed25519 (sem npm) ──────────────────────────────────────────────
function hexToBytes(hex) {
  return new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b, 16)))
}

async function verifySignature(req, pub, body) {
  const sig = req.headers.get('x-signature-ed25519')
  const ts  = req.headers.get('x-signature-timestamp')
  if (!sig || !ts || !pub) return false
  try {
    const key = await crypto.subtle.importKey(
      'raw', hexToBytes(pub),
      { name: 'Ed25519' }, false, ['verify']
    )
    return await crypto.subtle.verify(
      'Ed25519', key,
      hexToBytes(sig),
      new TextEncoder().encode(ts + body)
    )
  } catch {
    try {
      const key2 = await crypto.subtle.importKey(
        'raw', hexToBytes(pub),
        { name: 'NODE-ED25519', namedCurve: 'NODE-ED25519' }, false, ['verify']
      )
      return await crypto.subtle.verify(
        'NODE-ED25519', key2,
        hexToBytes(sig),
        new TextEncoder().encode(ts + body)
      )
    } catch { return false }
  }
}

// ── Groq API ──────────────────────────────────────────────────────────────
async function askGroq(message, key, extraContext = '') {
  const systemMsg = extraContext ? `${SYSTEM_PROMPT}\n\nContexto extra: ${extraContext}` : SYSTEM_PROMPT
  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user',   content: message },
      ],
      max_tokens: 400,
      temperature: 0.85,
    })
  })
  if (!res.ok) throw new Error(`Groq: ${res.status}`)
  const d = await res.json()
  return d.choices[0].message.content.trim()
}

// ── Discord helpers ───────────────────────────────────────────────────────
function json(data) {
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
}

async function editReply(appId, token, content) {
  await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  })
}

async function sendError(appId, token, msg = 'Ops, tive um erro! Tenta de novo.') {
  await editReply(appId, token, `❌ ${msg}`)
}

// ── Registrar comandos ────────────────────────────────────────────────────
async function registerCommands(env) {
  const s = { type: 3, required: false }
  const r = { type: 3, required: true }

  const commands = [
    { name: 'ping',    description: 'Verifica se a Kira esta online 🏓' },
    { name: 'ajuda',   description: 'Lista todos os comandos 📋' },
    { name: 'sobre',   description: 'Informacoes sobre a Kira 💜' },
    {
      name: 'kira', description: 'Conversa com a Kira 💬',
      options: [{ ...r, name: 'mensagem', description: 'O que voce quer dizer?' }]
    },
    {
      name: 'pergunta', description: 'Faz uma pergunta para a Kira 🤔',
      options: [{ ...r, name: 'pergunta', description: 'Sua pergunta' }]
    },
    {
      name: 'traduzir', description: 'Traduz um texto para portugues 🌍',
      options: [
        { ...r, name: 'texto',   description: 'Texto para traduzir' },
        { ...s, name: 'idioma',  description: 'Idioma de origem (ex: ingles, japones)' },
      ]
    },
    {
      name: 'resumir', description: 'Resume um texto longo 📝',
      options: [{ ...r, name: 'texto', description: 'Texto para resumir' }]
    },
    {
      name: 'piada', description: 'Kira conta uma piada 😂',
      options: [{ ...s, name: 'tema', description: 'Tema da piada (opcional)' }]
    },
    {
      name: 'anime', description: 'Kira recomenda um anime 🎌',
      options: [{ ...s, name: 'genero', description: 'Genero preferido (acao, romance, etc)' }]
    },
    {
      name: 'dica', description: 'Kira da uma dica aleatoria ou sobre um tema 💡',
      options: [{ ...s, name: 'tema', description: 'Tema da dica (opcional)' }]
    },
    {
      name: 'roast', description: 'Kira faz um roast amigavel de alguem 🔥',
      options: [{ type: 6, required: true, name: 'usuario', description: 'Usuario para o roast' }]
    },
    {
      name: 'elogiar', description: 'Kira elogia alguem de forma criativa 💫',
      options: [{ type: 6, required: true, name: 'usuario', description: 'Usuario para elogiar' }]
    },
    {
      name: 'historia', description: 'Kira cria uma historia curta 📖',
      options: [{ ...s, name: 'tema', description: 'Tema da historia (opcional)' }]
    },
    {
      name: 'curiosidade', description: 'Kira conta uma curiosidade aleatoria 🧠',
      options: [{ ...s, name: 'tema', description: 'Tema (opcional)' }]
    },
    {
      name: 'humor', description: 'Kira avalia o humor do servidor 😄',
    },
    {
      name: 'conselho', description: 'Kira da um conselho de vida 🌟',
      options: [{ ...s, name: 'situacao', description: 'Sua situacao (opcional)' }]
    },
  ]

  const res = await fetch(`https://discord.com/api/v10/applications/${env.DISCORD_APP_ID}/commands`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bot ${env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  })
  return res.ok ? `✅ ${commands.length} comandos registrados!` : `❌ ${await res.text()}`
}

// ── Handler de comandos ───────────────────────────────────────────────────
async function handleCommand(interaction, env, ctx) {
  const { data, member, user, token } = interaction
  const cmd      = data.name
  const opts     = Object.fromEntries((data.options || []).map(o => [o.name, o.value]))
  const username = member?.user?.username || user?.username || 'amigo'
  const appId    = env.DISCORD_APP_ID

  // Respostas imediatas (sem Groq)
  if (cmd === 'ping') return json({ type: 4, data: { content: `🏓 Pong! Estou viva, ${username}! Latencia ultrarapida ⚡` } })

  if (cmd === 'ajuda') return json({ type: 4, data: { content: [
    '📋 **Comandos da Kira**\n',
    '💬 `/kira [mensagem]` — Bate papo livre comigo',
    '🤔 `/pergunta [pergunta]` — Me faz uma pergunta',
    '🌍 `/traduzir [texto]` — Traduz para portugues',
    '📝 `/resumir [texto]` — Resume um texto',
    '😂 `/piada [tema?]` — Conto uma piada',
    '🎌 `/anime [genero?]` — Recomendo um anime',
    '💡 `/dica [tema?]` — Dou uma dica',
    '🔥 `/roast @usuario` — Roast amigavel',
    '💫 `/elogiar @usuario` — Elogio criativo',
    '📖 `/historia [tema?]` — Crio uma historia curta',
    '🧠 `/curiosidade [tema?]` — Curiosidade aleatoria',
    '😄 `/humor` — Avalio o humor do servidor',
    '🌟 `/conselho [situacao?]` — Dou um conselho',
    '📋 `/sobre` — Sobre mim',
    '🏓 `/ping` — Testa se estou online',
  ].join('\n') } })

  if (cmd === 'sobre') return json({ type: 4, data: { content:
    '💜 **Sobre a Kira**\n\nOi! Sou a **Kira**, uma IA assistente animada e divertida!\n\n🤖 Powered by: LLaMA 3 70B via Groq\n⚡ Hospedagem: Cloudflare Workers\n🌐 Latencia: ultra-baixa\n\nMe use com `/kira` ou qualquer outro comando! ✨'
  } })

  // Todos os outros comandos usam Groq — resposta diferida
  ctx.waitUntil((async () => {
    try {
      let prompt = ''

      if (cmd === 'kira')       prompt = opts.mensagem
      if (cmd === 'pergunta')   prompt = `Responda essa pergunta de forma clara e divertida: ${opts.pergunta}`
      if (cmd === 'traduzir')   prompt = `Traduza para portugues brasileiro${opts.idioma ? ` (original em ${opts.idioma})` : ''}: "${opts.texto}". Mostre so a traducao, sem explicacoes extras.`
      if (cmd === 'resumir')    prompt = `Resuma esse texto em no maximo 5 pontos curtos: "${opts.texto}"`
      if (cmd === 'piada')      prompt = `Conta uma piada${opts.tema ? ` sobre ${opts.tema}` : ' aleatoria'} em portugues brasileiro. Pode ser trocadilho, piada de dois, ou qualquer estilo.`
      if (cmd === 'anime')      prompt = `Recomenda 3 animes${opts.genero ? ` do genero ${opts.genero}` : ''} com uma descricao curta de cada um (1 linha). Usa emojis.`
      if (cmd === 'dica')       prompt = `Da uma dica util e interessante${opts.tema ? ` sobre ${opts.tema}` : ' sobre qualquer assunto'}. Seja criativa!`
      if (cmd === 'roast')      prompt = `Faz um roast amigavel e engraçado do usuario "${opts.usuario_name || 'um amigo'}" (sem ofender de verdade, so para rir). Seja criativa e use humor!`
      if (cmd === 'elogiar')    prompt = `Elogia de forma criativa e animada o usuario "${opts.usuario_name || 'alguem'}" como se fosse um hype! Usa emojis e seja entusiasmada!`
      if (cmd === 'historia')   prompt = `Cria uma historia curta${opts.tema ? ` sobre ${opts.tema}` : ''} com no maximo 150 palavras. Pode ser engraçada, de aventura ou romantica.`
      if (cmd === 'curiosidade') prompt = `Me conta uma curiosidade surpreendente e verdadeira${opts.tema ? ` sobre ${opts.tema}` : ''}. Seja especifica e interessante!`
      if (cmd === 'humor')      prompt = `Avalia o humor de um servidor de Discord de forma bem humorada, como se voce tivesse observando as conversas. Inventa algo divertido!`
      if (cmd === 'conselho')   prompt = `Da um conselho sincero e motivador${opts.situacao ? ` para essa situacao: ${opts.situacao}` : ' de vida em geral'}. Seja humana e carinhosa.`

      // Pega nome do usuario alvo para roast/elogiar
      if ((cmd === 'roast' || cmd === 'elogiar') && data.options?.[0]?.value) {
        const resolvedUser = interaction.data.resolved?.users?.[data.options[0].value]
        const targetName = resolvedUser?.username || 'alguem'
        prompt = prompt.replace(opts.usuario_name || 'um amigo', targetName).replace('alguem', targetName)
      }

      if (!prompt) return await sendError(appId, token, 'Nao entendi o comando.')

      const reply = await askGroq(prompt, env.GROQ_KEY)
      const prefix = { kira:'💜', pergunta:'🤔', traduzir:'🌍', resumir:'📝', piada:'😂',
        anime:'🎌', dica:'💡', roast:'🔥', elogiar:'💫', historia:'📖',
        curiosidade:'🧠', humor:'😄', conselho:'🌟' }[cmd] || '💜'

      await editReply(appId, token, `${prefix} ${reply}`)
    } catch(e) {
      await sendError(appId, token, `Erro: ${e.message}`)
    }
  })())

  return json({ type: 5 }) // Deferred response — instantaneo
}

// ── Handler principal ─────────────────────────────────────────────────────
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url)

    // Registro de comandos
    if (url.pathname === '/register') {
      if (url.searchParams.get('secret') !== env.REGISTER_SECRET)
        return new Response('Unauthorized', { status: 401 })
      return new Response(await registerCommands(env))
    }

    if (req.method !== 'POST') return new Response('Kira Bot online! ✅')

    const body = await req.text()
    if (!await verifySignature(req, env.DISCORD_PUBLIC_KEY, body))
      return new Response('Invalid signature', { status: 401 })

    const interaction = JSON.parse(body)
    if (interaction.type === 1) return json({ type: 1 }) // PING
    if (interaction.type === 2) return handleCommand(interaction, env, ctx)
    return new Response('OK')
  }
        }
    
