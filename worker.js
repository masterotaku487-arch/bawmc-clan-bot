import { verifyKey } from "discord-interactions";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama3-70b-8192";

const KIRA_SYSTEM_PROMPT = `Você é Kira, uma IA assistente simpática e divertida que mora em um servidor do Discord.
Personalidade:
- Fala de forma casual e amigável, usando gírias jovens do português brasileiro
- É curiosa, animada e gosta de conversar
- Às vezes usa emojis mas sem exagerar
- É honesta quando não sabe algo
- Tem senso de humor leve e descontraído
- Se apresenta como Kira quando perguntada sobre quem ela é
Responda sempre em português brasileiro.`;

// Registra os slash commands no Discord
async function registerCommands(env) {
  const commands = [
    {
      name: "ping",
      description: "Verifica se a Kira está online e viva 🏓",
    },
    {
      name: "ajuda",
      description: "Lista todos os comandos disponíveis 📋",
    },
    {
      name: "sobre",
      description: "Informações sobre a Kira 💜",
    },
    {
      name: "kira",
      description: "Conversa com a Kira diretamente via slash command 💬",
      options: [
        {
          name: "mensagem",
          description: "O que você quer dizer para a Kira?",
          type: 3, // STRING
          required: true,
        },
      ],
    },
  ];

  const url = `https://discord.com/api/v10/applications/${env.DISCORD_APP_ID}/commands`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${env.DISCORD_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });

  return res.ok;
}

// Chama a Groq API
async function askGroq(userMessage, groqKey) {
  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: KIRA_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      max_tokens: 500,
      temperature: 0.85,
    }),
  });

  if (!res.ok) {
    throw new Error(`Groq error: ${res.status}`);
  }

  const data = await res.json();
  return data.choices[0].message.content.trim();
}

// Responde a uma interação de slash command
async function handleInteraction(interaction, env, ctx) {
  const { type, data, member, user } = interaction;

  // Tipo 1 = PING (verificação do Discord)
  if (type === 1) {
    return new Response(JSON.stringify({ type: 1 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Tipo 2 = APPLICATION_COMMAND (slash commands)
  if (type === 2) {
    const commandName = data.name;
    const username = member?.user?.username || user?.username || "amigo";

    if (commandName === "ping") {
      return jsonResponse({
        type: 4,
        data: {
          content: `🏓 Pong! Estou viva e funcionando, ${username}! Latência do Worker: ultrarrápida ⚡`,
        },
      });
    }

    if (commandName === "ajuda") {
      return jsonResponse({
        type: 4,
        data: {
          content: `📋 **Comandos da Kira**\n\n💬 **Mencionar** — Me marque com @ em qualquer mensagem e eu respondo!\n\`/kira [mensagem]\` — Fala comigo direto via slash command\n\`/ping\` — Vê se estou online\n\`/ajuda\` — Esta lista aqui\n\`/sobre\` — Saiba mais sobre mim\n\nDica: pode me chamar no chat com @Kira a qualquer hora! 💜`,
        },
      });
    }

    if (commandName === "sobre") {
      return jsonResponse({
        type: 4,
        data: {
          content: `💜 **Sobre a Kira**\n\nOi! Sou a **Kira**, uma IA assistente feita pra conversar e ajudar!\n\n🤖 Modelo: LLaMA 3 70B via Groq\n⚡ Hospedagem: Cloudflare Workers\n🌐 Velocidade: ultra-baixa latência\n\nMe mencione com @ ou use \`/kira\` pra bater papo! ✨`,
        },
      });
    }

    if (commandName === "kira") {
      const userMessage = data.options?.find((o) => o.name === "mensagem")?.value;

      if (!userMessage) {
        return jsonResponse({
          type: 4,
          data: { content: "❓ Você esqueceu de escrever a mensagem!" },
        });
      }

      // Resposta diferida (necessária para chamadas async como Groq)
      // Primeiro ACK o Discord, depois edita com a resposta real
      const ackResponse = new Response(
        JSON.stringify({ type: 5 }), // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        { headers: { "Content-Type": "application/json" } }
      );

      // Processa em background e edita a resposta
      ctx.waitUntil(
        (async () => {
          try {
            const reply = await askGroq(userMessage, env.GROQ_KEY);
            await fetch(
              `https://discord.com/api/v10/webhooks/${env.DISCORD_APP_ID}/${interaction.token}/messages/@original`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: `💜 ${reply}` }),
              }
            );
          } catch (e) {
            await fetch(
              `https://discord.com/api/v10/webhooks/${env.DISCORD_APP_ID}/${interaction.token}/messages/@original`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  content: "❌ Ops, tive um erro ao pensar na resposta. Tenta de novo!",
                }),
              }
            );
          }
        })()
      );

      return ackResponse;
    }
  }

  // Tipo 3 = MESSAGE_COMPONENT (botões etc) — ignora por ora
  return new Response("OK", { status: 200 });
}

function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}

// Handler principal do Cloudflare Worker
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Rota de registro de comandos (acesse uma vez para registrar)
    if (url.pathname === "/register" && request.method === "GET") {
      const secret = url.searchParams.get("secret");
      if (secret !== env.REGISTER_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }
      const ok = await registerCommands(env);
      return new Response(ok ? "✅ Comandos registrados!" : "❌ Erro ao registrar", {
        status: ok ? 200 : 500,
      });
    }

    // Rota principal de interações do Discord
    if (url.pathname === "/interactions" && request.method === "POST") {
      // Verifica assinatura do Discord (obrigatório!)
      const signature = request.headers.get("x-signature-ed25519");
      const timestamp = request.headers.get("x-signature-timestamp");
      const body = await request.text();

      const isValid = await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY);

      if (!isValid) {
        return new Response("Invalid signature", { status: 401 });
      }

      const interaction = JSON.parse(body);
      return handleInteraction(interaction, env, ctx);
    }

    // Rota de menção (via bot gateway — não suportado em Workers)
    // Para menções funcionar, use o bot em modo gateway (Railway/Render)
    // Aqui retorna info
    if (url.pathname === "/") {
      return new Response("🤖 Kira Bot está no ar! Use /interactions para o Discord.", {
        status: 200,
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
                  
