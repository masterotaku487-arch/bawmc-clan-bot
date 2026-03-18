// Worker: bawmc-clan-bot
// Variaveis: BOT_TOKEN, PUBLIC_KEY, CLIENT_ID
// KV Binding: DB (Cloudflare KV Namespace)

const COR = {
  red:    0xE53935, gold:   0xFFB300, blue:   0x1E88E5,
  green:  0x43A047, purple: 0x8E24AA, dark:   0x212121,
  orange: 0xFF6F00,
}

// - Crypto -
function hexToBytes(hex) { return new Uint8Array(hex.match(/.{1,2}/g).map(b=>parseInt(b,16))) }
async function verify(req, pub, body) {
  const sig = req.headers.get('x-signature-ed25519')
  const ts  = req.headers.get('x-signature-timestamp')
  if (!sig||!ts||!pub) return false
  try {
    const key = await crypto.subtle.importKey('raw',hexToBytes(pub),{name:'Ed25519'},false,['verify'])
    return crypto.subtle.verify('Ed25519',key,hexToBytes(sig),new TextEncoder().encode(ts+body))
  } catch { return false }
}

// - KV helpers -
const kv = {
  get: (db,k)      => db.get(k,{type:'json'}),
  set: (db,k,v)    => db.put(k,JSON.stringify(v)),
  del: (db,k)      => db.delete(k),
  clanKey: (gid)   => `clan:${gid}`,
  memberKey: (uid) => `member:${uid}`,
  allyKey: (a,b)   => `ally:${[a,b].sort().join(':')}`,
  huntKey: (uid)   => `hunt:${uid}`,
  treatyKey: (a,b) => `treaty:${[a,b].sort().join(':')}`,
}

// - Discord API -
async function editReply(token, clientId, embed, content='', env, ephemeral=false) {
  await fetch(`https://discord.com/api/v10/webhooks/${clientId}/${token}/messages/@original`,{
    method:'PATCH',
    headers:{'Content-Type':'application/json','Authorization':`Bot ${env.BOT_TOKEN}`},
    body:JSON.stringify({content,embeds:[embed],flags:ephemeral?64:0})
  })
}
function editErr(t,cid,msg,env){return editReply(t,cid,{title:'❌ Erro',description:msg,color:COR.red},'',env,true)}

// - Registrar comandos -
async function register(env) {
  const s3={type:3,required:false},r3={type:3,required:true},r6={type:6,required:true}
  const cmds = [
    // Info
    {name:'ajuda',      description:'📋 Lista todos os comandos'},
    {name:'ajudainf',   description:'📖 Detalhes de um comando', options:[{...r3,name:'comando',description:'Nome do comando'}]},
    {name:'ranking',    description:'🏆 Ranking global de clas'},
    // Cla
    {name:'clan',       description:'👑 Gerenciar seu cla', options:[
      {type:1,name:'info',   description:'Ver informacoes do cla'},
      {type:1,name:'criar',  description:'Criar um novo cla', options:[{...r3,name:'nome',description:'Nome do cla'},{...s3,name:'tag',description:'Tag do cla (ex: ZO)'},{...s3,name:'descricao',description:'Descricao'}]},
      {type:1,name:'editar', description:'Editar informacoes', options:[{...s3,name:'nome',description:'Novo nome'},{...s3,name:'descricao',description:'Nova descricao'},{...s3,name:'cor',description:'Cor hex (ex: FF0000)'}]},
      {type:1,name:'apagar', description:'⚠ Apagar o cla (lider)'},
    ]},
    // Membros
    {name:'recrutar',   description:'➕ Recrutar membro', options:[{...r6,name:'usuario',description:'Usuario a recrutar'}]},
    {name:'expulsar',   description:'➖ Expulsar membro',  options:[{...r6,name:'usuario',description:'Usuario a expulsar'}]},
    {name:'promover',   description:'(subiu) Promover para oficial', options:[{...r6,name:'usuario',description:'Usuario a promover'}]},
    {name:'rebaixar',   description:'(desceu) Rebaixar para membro',  options:[{...r6,name:'usuario',description:'Usuario a rebaixar'}]},
    // Espionagem
    {name:'espionar',   description:'🕵 Espionar outro cla',  options:[{...r3,name:'cla',description:'Nome ou ID do servidor alvo'}]},
    {name:'sabotar',    description:'💣 Sabotar outro cla',   options:[{...r3,name:'cla',description:'Nome ou ID do servidor alvo'}]},
    // Caca e recompensa
    {name:'cacada',     description:'🩸 Iniciar cacada a jogador', options:[{...r6,name:'usuario',description:'Alvo da cacada'},{...s3,name:'recompensa',description:'Valor da recompensa'}]},
    {name:'recompensa', description:'🎯 Colocar recompensa em alguem', options:[{...r6,name:'usuario',description:'Alvo'},{...r3,name:'valor',description:'Valor da recompensa'}]},
    // Blacklist
    {name:'blacklist',  description:'🚫 Gerenciar lista negra', options:[
      {type:1,name:'ver',     description:'Ver blacklist do cla'},
      {type:1,name:'add',     description:'Adicionar a blacklist', options:[{...r6,name:'usuario',description:'Usuario'},{...s3,name:'motivo',description:'Motivo'}]},
      {type:1,name:'remover', description:'Remover da blacklist',  options:[{...r6,name:'usuario',description:'Usuario'}]},
    ]},
    // Aliancas
    {name:'alianca',    description:'🤝 Gerenciar aliancas', options:[
      {type:1,name:'ver',     description:'Ver aliancas ativas'},
      {type:1,name:'criar',   description:'Propor alianca', options:[{...r3,name:'servidor',description:'ID ou nome do servidor aliado'},{...s3,name:'cla',description:'Nome do cla aliado'}]},
      {type:1,name:'quebrar', description:'Romper uma alianca', options:[{...r3,name:'servidor',description:'ID do servidor'}]},
    ]},
    // Tratado
    {name:'tratado',    description:'📜 Propor tratado', options:[{...r3,name:'cla',description:'Cla alvo'},{...r3,name:'condicoes',description:'Condicoes do tratado'},{...s3,name:'dias',description:'Duracao em dias'}]},
    // Guerra
    {name:'guerra',     description:'⚔ Gerenciar guerras', options:[
      {type:1,name:'desafiar', description:'Desafiar outro cla',    options:[{...r3,name:'cla',description:'Nome do cla inimigo'},{...s3,name:'aposta',description:'Aposta em jogo'}]},
      {type:1,name:'status',   description:'Ver guerras ativas'},
      {type:1,name:'declarar', description:'Declarar vitoria'},
    ]},
  ]
  const r = await fetch(`https://discord.com/api/v10/applications/${env.CLIENT_ID}/commands`,{
    method:'PUT',headers:{'Content-Type':'application/json','Authorization':`Bot ${env.BOT_TOKEN}`},
    body:JSON.stringify(cmds)
  })
  return r.ok?`✅ ${cmds.length} comandos registrados!`:`❌ ${await r.text()}`
}

// - Ajuda -
const HELP = {
  ajuda:      {desc:'Lista todos os comandos disponiveis',uso:'/ajuda'},
  ajudainf:   {desc:'Mostra detalhes de um comando especifico',uso:'/ajudainf comando:espionar'},
  ranking:    {desc:'Ranking global de todos os clas',uso:'/ranking'},
  clan:       {desc:'Criar, editar, apagar e ver info do cla',uso:'/clan criar nome:ZeroOxygen tag:ZO'},
  recrutar:   {desc:'Convida um usuario para o seu cla',uso:'/recrutar @usuario'},
  expulsar:   {desc:'Remove um membro do cla (lider/oficial)',uso:'/expulsar @usuario'},
  promover:   {desc:'Promove membro a oficial do cla',uso:'/promover @usuario'},
  rebaixar:   {desc:'Rebaixa oficial a membro',uso:'/rebaixar @usuario'},
  espionar:   {desc:'Tenta espionar um cla inimigo (60% de sucesso). Custa 500 moedas. Cooldown: 2h',uso:'/espionar cla:DarkEmpire'},
  sabotar:    {desc:'Sabota um cla (-10% recursos, trava farm 1h). Custa 1000 moedas. Cooldown: 24h',uso:'/sabotar cla:DarkEmpire'},
  cacada:     {desc:'Inicia uma cacada a um jogador por 6h. Quem completar ganha a recompensa',uso:'/cacada @usuario recompensa:5000'},
  recompensa: {desc:'Coloca recompensa ativa na cabeca de um jogador',uso:'/recompensa @usuario valor:3000'},
  blacklist:  {desc:'Gerencia a lista negra do cla (traidores, espioes)',uso:'/blacklist add @usuario motivo:Traicao'},
  alianca:    {desc:'Cria ou rompe alianca com outro cla',uso:'/alianca criar servidor:ID cla:ShadowGarden'},
  tratado:    {desc:'Propoe um tratado de paz com condicoes especificas',uso:'/tratado cla:DarkEmpire condicoes:Paz por 3 dias dias:3'},
  guerra:     {desc:'Desafia outro cla para guerra ou ve guerras ativas',uso:'/guerra desafiar cla:DarkEmpire aposta:Territorio'},
}

// - Processar comandos -
async function process(cmd, sub, opts, body, token, env) {
  const gid = body.guild_id
  const uid = body.member?.user?.id || body.user?.id
  const uname = body.member?.user?.username || body.user?.username || 'Desconhecido'
  const cid = env.CLIENT_ID

  const clan = gid ? await kv.get(env.DB, kv.clanKey(gid)) : null
  const isLeader  = clan?.leader === uid
  const isOfficer = clan?.officers?.includes(uid) || isLeader
  const isMember  = clan?.members?.includes(uid) || isOfficer

  // /ajuda
  if (cmd==='ajuda') {
    return editReply(token,cid,{title:'📋 BawMC Clan Bot -- Comandos',color:COR.gold,description:[
      '**👑 Cla:** `/clan info` `/clan criar` `/clan editar` `/clan apagar`',
      '**👥 Membros:** `/recrutar` `/expulsar` `/promover` `/rebaixar`',
      '**🕵 Espionagem:** `/espionar` `/sabotar`',
      '**🎯 Caca:** `/cacada` `/recompensa`',
      '**🚫 Blacklist:** `/blacklist ver/add/remover`',
      '**🤝 Aliancas:** `/alianca ver/criar/quebrar`',
      '**📜 Tratado:** `/tratado`',
      '**⚔ Guerra:** `/guerra desafiar/status/declarar`',
      '**📊 Geral:** `/ranking` `/ajudainf [comando]`',
    ].join('\n'),footer:{text:'BawMC * Use /ajudainf [comando] para detalhes'}},'' ,env)
  }

  // /ajudainf
  if (cmd==='ajudainf') {
    const nome = opts.comando?.toLowerCase()
    const h = HELP[nome]
    if (!h) return editErr(token,cid,`Comando \`${nome}\` nao encontrado.`,env)
    return editReply(token,cid,{title:`📖 /${nome}`,color:COR.blue,
      fields:[{name:'Descricao',value:h.desc,inline:false},{name:'Uso',value:`\`${h.uso}\``,inline:false}]
    },'',env)
  }

  // /ranking
  if (cmd==='ranking') {
    const list = await kv.get(env.DB,'ranking:global') || []
    if (!list.length) return editReply(token,cid,{title:'🏆 Ranking Global',description:'Nenhum cla registrado ainda!',color:COR.gold},'',env)
    const medals = ['🥇','🥈','🥉']
    const desc = list.slice(0,10).map((c,i)=>`${medals[i]||`**${i+1}.**`} **[${c.tag}] ${c.name}** -- ⚔ ${c.wins}V/${c.losses}D * 👥 ${c.memberCount}`).join('\n')
    return editReply(token,cid,{title:'🏆 Ranking Global -- BawMC',description:desc,color:COR.gold,footer:{text:`${list.length} clas registrados`},timestamp:new Date().toISOString()},'',env)
  }

  // /clan
  if (cmd==='clan') {
    if (sub==='info') {
      if (!clan) return editErr(token,cid,'Este servidor nao tem cla. Use `/clan criar`.',env)
      return editReply(token,cid,{
        title:`${clan.tag ? `[${clan.tag}] ` : ''}${clan.name}`,
        description:clan.description||'Sem descricao.',
        color:clan.color ? parseInt(clan.color,16) : COR.purple,
        fields:[
          {name:'👑 Lider',value:`<@${clan.leader}>`,inline:true},
          {name:'👥 Membros',value:`${clan.members?.length||0}/${clan.maxMembers||50}`,inline:true},
          {name:'⚔ Guerras',value:`${clan.wins||0}V / ${clan.losses||0}D`,inline:true},
          {name:'🏆 Ranking',value:`#${clan.rank||'?'}`,inline:true},
          {name:'💰 Recursos',value:`${clan.resources||0} moedas`,inline:true},
          {name:'🤝 Aliancas',value:`${clan.alliances?.length||0}`,inline:true},
        ],
        footer:{text:`Criado em ${new Date(clan.createdAt||Date.now()).toLocaleDateString('pt-BR')}`}
      },'',env)
    }

    if (sub==='criar') {
      if (clan) return editErr(token,cid,'Este servidor ja tem um cla!',env)
      const novoClan = {
        name:opts.nome, tag:opts.tag?.toUpperCase().slice(0,4)||'CLA',
        description:opts.descricao||'',
        leader:uid, officers:[], members:[uid],
        wins:0, losses:0, resources:1000,
        maxMembers:50, rank:null, color:'8E24AA',
        blacklist:[], alliances:[], wars:[],
        createdAt:Date.now()
      }
      await kv.set(env.DB,kv.clanKey(gid),novoClan)
      // Atualiza ranking
      const ranking = await kv.get(env.DB,'ranking:global') || []
      ranking.push({gid,name:novoClan.name,tag:novoClan.tag,wins:0,losses:0,memberCount:1})
      await kv.set(env.DB,'ranking:global',ranking)
      return editReply(token,cid,{title:'✅ Cla Criado!',description:`**[${novoClan.tag}] ${novoClan.name}** foi fundado!\n\nUse \`/recrutar\` para convidar membros.`,color:COR.green},'',env)
    }

    if (sub==='editar') {
      if (!isLeader) return editErr(token,cid,'Apenas o lider pode editar o cla.',env)
      if (opts.nome) clan.name = opts.nome
      if (opts.descricao) clan.description = opts.descricao
      if (opts.cor) clan.color = opts.cor.replace('#','')
      await kv.set(env.DB,kv.clanKey(gid),clan)
      return editReply(token,cid,{title:'✅ Cla Atualizado!',color:COR.green,description:`Informacoes de **${clan.name}** atualizadas.`},'',env)
    }

    if (sub==='apagar') {
      if (!isLeader) return editErr(token,cid,'Apenas o lider pode apagar o cla.',env)
      await kv.del(env.DB,kv.clanKey(gid))
      const ranking = (await kv.get(env.DB,'ranking:global')||[]).filter(c=>c.gid!==gid)
      await kv.set(env.DB,'ranking:global',ranking)
      return editReply(token,cid,{title:'💀 Cla Dissolvido',description:`O cla **${clan.name}** foi apagado.`,color:COR.dark},'',env)
    }
  }

  // /recrutar
  if (cmd==='recrutar') {
    if (!isOfficer) return editErr(token,cid,'Precisa ser oficial ou lider.',env)
    if (!clan) return editErr(token,cid,'Sem cla neste servidor.',env)
    const alvo = opts.usuario
    if (clan.members.includes(alvo)) return editErr(token,cid,'Usuario ja e membro.',env)
    clan.members.push(alvo)
    await kv.set(env.DB,kv.clanKey(gid),clan)
    return editReply(token,cid,{title:'✅ Membro Recrutado!',description:`<@${alvo}> foi recrutado para **${clan.name}**!`,color:COR.green},`🎉 Bem-vindo ao cla, <@${alvo}>!`,env)
  }

  // /expulsar
  if (cmd==='expulsar') {
    if (!isOfficer) return editErr(token,cid,'Precisa ser oficial ou lider.',env)
    const alvo = opts.usuario
    if (alvo===clan?.leader) return editErr(token,cid,'Nao pode expulsar o lider.',env)
    clan.members = clan.members.filter(m=>m!==alvo)
    clan.officers = clan.officers.filter(o=>o!==alvo)
    await kv.set(env.DB,kv.clanKey(gid),clan)
    return editReply(token,cid,{title:'👢 Membro Expulso',description:`<@${alvo}> foi expulso de **${clan.name}**.`,color:COR.orange},'',env)
  }

  // /promover
  if (cmd==='promover') {
    if (!isLeader) return editErr(token,cid,'Apenas o lider pode promover.',env)
    const alvo = opts.usuario
    if (!clan.members.includes(alvo)) return editErr(token,cid,'Usuario nao e membro.',env)
    if (!clan.officers.includes(alvo)) clan.officers.push(alvo)
    await kv.set(env.DB,kv.clanKey(gid),clan)
    return editReply(token,cid,{title:'(subiu) Promovido!',description:`<@${alvo}> agora e **Oficial** de ${clan.name}!`,color:COR.gold},'',env)
  }

  // /rebaixar
  if (cmd==='rebaixar') {
    if (!isLeader) return editErr(token,cid,'Apenas o lider pode rebaixar.',env)
    const alvo = opts.usuario
    clan.officers = clan.officers.filter(o=>o!==alvo)
    await kv.set(env.DB,kv.clanKey(gid),clan)
    return editReply(token,cid,{title:'(desceu) Rebaixado',description:`<@${alvo}> voltou a ser **Membro** de ${clan.name}.`,color:COR.orange},'',env)
  }

  // /espionar
  if (cmd==='espionar') {
    if (!isMember) return editErr(token,cid,'Precisa ser membro do cla.',env)
    // Cooldown 2h
    const cdKey = `cd:espionar:${gid}:${uid}`
    const cd = await kv.get(env.DB,cdKey)
    if (cd && Date.now() < cd) {
      const resto = Math.ceil((cd-Date.now())/60000)
      return editErr(token,cid,`Cooldown ativo! Aguarde **${resto} minutos**.`,env)
    }
    const sucesso = Math.random() < 0.6
    await kv.set(env.DB,cdKey,Date.now()+7200000)
    if (sucesso) {
      const recursos = Math.floor(Math.random()*5000)+500
      const membros  = Math.floor(Math.random()*30)+5
      const forca    = Math.floor(Math.random()*100)+1
      return editReply(token,cid,{
        title:'🕵 MISSAO DE ESPIONAGEM -- SUCESSO',
        description:`Informacoes obtidas sobre **${opts.cla}**:`,
        color:COR.blue,
        fields:[
          {name:'💰 Recursos',    value:`~${recursos} moedas`,inline:true},
          {name:'👥 Membros ativos',value:`${membros}`,         inline:true},
          {name:'⚔ Forca estimada',value:`${forca}/100`,        inline:true},
        ],
        footer:{text:'Informacoes podem nao ser 100% precisas'}
      },'',env)
    } else {
      return editReply(token,cid,{
        title:'🕵 MISSAO FALHOU!',
        description:`A espionagem contra **${opts.cla}** foi detectada!\n⚠ Eles foram alertados da tentativa.`,
        color:COR.red,
        footer:{text:'Tente novamente em 2 horas'}
      },'',env)
    }
  }

  // /sabotar
  if (cmd==='sabotar') {
    if (!isOfficer) return editErr(token,cid,'Precisa ser oficial ou lider.',env)
    const cdKey = `cd:sabotar:${gid}`
    const cd = await kv.get(env.DB,cdKey)
    if (cd && Date.now() < cd) {
      const resto = Math.ceil((cd-Date.now())/3600000)
      return editErr(token,cid,`Cooldown ativo! Aguarde **${resto}h**.`,env)
    }
    const sucesso = Math.random() < 0.5
    await kv.set(env.DB,cdKey,Date.now()+86400000)
    if (sucesso) {
      const efeito = ['🔻 -10% recursos','⛔ Farm travado por 1 hora','📉 -5 pontos no ranking'][Math.floor(Math.random()*3)]
      return editReply(token,cid,{
        title:'💣 SABOTAGEM -- SUCESSO!',
        description:`**${opts.cla}** foi sabotado com sucesso!\n\n${efeito}`,
        color:COR.orange,
        footer:{text:'Proxima sabotagem disponivel em 24h'}
      },'',env)
    } else {
      return editReply(token,cid,{
        title:'💣 SABOTAGEM FALHOU!',
        description:`A sabotagem de **${opts.cla}** foi detectada! Sua identidade pode ter sido exposta.`,
        color:COR.red
      },'',env)
    }
  }

  // /cacada
  if (cmd==='cacada') {
    if (!isOfficer) return editErr(token,cid,'Precisa ser oficial ou lider.',env)
    const alvo = opts.usuario
    const premio = opts.recompensa || '5000'
    const hunt = { hunter:uid, target:alvo, reward:premio, gid, expiresAt:Date.now()+21600000, active:true }
    await kv.set(env.DB,kv.huntKey(alvo),hunt)
    return editReply(token,cid,{
      title:'🔥 CACADA INICIADA!',
      description:`<@${alvo}> agora esta sendo cacado!\n\n💰 Recompensa: **${premio} moedas**\n(relogio) Expira em: **6 horas**`,
      color:COR.red,
    },`🩸 @everyone CACADA ATIVA: <@${alvo}> * Recompensa: ${premio} moedas!`,env)
  }

  // /recompensa
  if (cmd==='recompensa') {
    const alvo = opts.usuario
    const valor = opts.valor
    return editReply(token,cid,{
      title:'🎯 RECOMPENSA ATIVA',
      description:`Uma recompensa foi colocada na cabeca de <@${alvo}>!`,
      color:COR.gold,
      fields:[{name:'💰 Valor',value:`${valor} moedas`,inline:true},{name:'📌 Colocada por',value:`<@${uid}>`,inline:true}]
    },`🎯 Recompensa de **${valor} moedas** por <@${alvo}>!`,env)
  }

  // /blacklist
  if (cmd==='blacklist') {
    if (!clan) return editErr(token,cid,'Sem cla neste servidor.',env)
    if (sub==='ver') {
      if (!clan.blacklist?.length) return editReply(token,cid,{title:'🚫 Blacklist',description:'Nenhum jogador na lista negra.',color:COR.dark},'',env)
      const desc = clan.blacklist.map(b=>`<@${b.uid}> -- *${b.motivo||'Sem motivo'}*`).join('\n')
      return editReply(token,cid,{title:`🚫 Blacklist -- ${clan.name}`,description:desc,color:COR.dark},'',env)
    }
    if (sub==='add') {
      if (!isOfficer) return editErr(token,cid,'Precisa ser oficial ou lider.',env)
      const alvo = opts.usuario
      if (!clan.blacklist) clan.blacklist=[]
      if (clan.blacklist.find(b=>b.uid===alvo)) return editErr(token,cid,'Ja esta na blacklist.',env)
      clan.blacklist.push({uid:alvo,motivo:opts.motivo||'',addedBy:uid,at:Date.now()})
      await kv.set(env.DB,kv.clanKey(gid),clan)
      return editReply(token,cid,{title:'🚫 Adicionado a Blacklist',description:`<@${alvo}> foi marcado como inimigo.\n**Motivo:** ${opts.motivo||'Nao informado'}`,color:COR.red},'',env)
    }
    if (sub==='remover') {
      if (!isOfficer) return editErr(token,cid,'Precisa ser oficial ou lider.',env)
      const alvo = opts.usuario
      clan.blacklist = (clan.blacklist||[]).filter(b=>b.uid!==alvo)
      await kv.set(env.DB,kv.clanKey(gid),clan)
      return editReply(token,cid,{title:'✅ Removido da Blacklist',description:`<@${alvo}> foi removido da lista negra.`,color:COR.green},'',env)
    }
  }

  // /alianca
  if (cmd==='alianca') {
    if (!clan) return editErr(token,cid,'Sem cla neste servidor.',env)
    if (sub==='ver') {
      if (!clan.alliances?.length) return editReply(token,cid,{title:'🤝 Aliancas',description:'Nenhuma alianca ativa.',color:COR.blue},'',env)
      const desc = clan.alliances.map(a=>`🤝 **${a.name}** \`[${a.tag}]\` -- desde ${new Date(a.since).toLocaleDateString('pt-BR')}`).join('\n')
      return editReply(token,cid,{title:`🤝 Aliancas de ${clan.name}`,description:desc,color:COR.blue},'',env)
    }
    if (sub==='criar') {
      if (!isLeader) return editErr(token,cid,'Apenas o lider pode criar aliancas.',env)
      if (!clan.alliances) clan.alliances=[]
      clan.alliances.push({serverId:opts.servidor,name:opts.cla||opts.servidor,tag:'?',since:Date.now()})
      await kv.set(env.DB,kv.clanKey(gid),clan)
      return editReply(token,cid,{
        title:'🤝 Alianca Formada!',
        description:`**${clan.name}** agora e aliado de **${opts.cla||opts.servidor}**!\n\nAmbos os clas nao podem se atacar enquanto a alianca estiver ativa.`,
        color:COR.blue
      },'',env)
    }
    if (sub==='quebrar') {
      if (!isLeader) return editErr(token,cid,'Apenas o lider pode romper aliancas.',env)
      clan.alliances = (clan.alliances||[]).filter(a=>a.serverId!==opts.servidor)
      await kv.set(env.DB,kv.clanKey(gid),clan)
      return editReply(token,cid,{title:'💔 Alianca Rompida',description:`A alianca com o servidor \`${opts.servidor}\` foi encerrada.`,color:COR.orange},'',env)
    }
  }

  // /tratado
  if (cmd==='tratado') {
    if (!isLeader) return editErr(token,cid,'Apenas o lider pode propor tratados.',env)
    const dias = parseInt(opts.dias||'3')
    const expira = new Date(Date.now()+dias*86400000).toLocaleDateString('pt-BR')
    return editReply(token,cid,{
      title:'📜 PROPOSTA DE TRATADO',
      description:`**${clan.name}** propoe um tratado a **${opts.cla}**:`,
      color:COR.purple,
      fields:[
        {name:'📋 Condicoes',value:opts.condicoes,inline:false},
        {name:'📅 Duracao',  value:`${dias} dias (ate ${expira})`,inline:true},
        {name:'📌 Proposto por',value:`<@${uid}>`,inline:true},
      ],
      footer:{text:'O cla alvo pode aceitar ou recusar este tratado'}
    },`📜 Proposta de tratado de **${clan.name}** para **${opts.cla}**! Verifique os termos acima.`,env)
  }

  // /guerra
  if (cmd==='guerra') {
    if (sub==='desafiar') {
      if (!isLeader) return editErr(token,cid,'Apenas o lider pode declarar guerra.',env)
      if (!clan) return editErr(token,cid,'Sem cla neste servidor.',env)
      return editReply(token,cid,{
        title:'⚔ DECLARACAO DE GUERRA!',
        description:`**${clan.name}** declara guerra a **${opts.cla}**!`,
        color:COR.red,
        fields:[
          {name:'⚔ Atacante',value:`${clan.tag ? `[${clan.tag}]` : ''} ${clan.name}`,inline:true},
          {name:'🛡 Defensor',value:opts.cla,inline:true},
          {name:'🎰 Aposta',  value:opts.aposta||'Nenhuma',inline:true},
        ],
        footer:{text:'Que venca o mais forte! 💀'}
      },`@everyone ⚔ **GUERRA DECLARADA!** ${clan.name} vs **${opts.cla}** * Aposta: ${opts.aposta||'Nenhuma'}`,env)
    }
    if (sub==='status') {
      if (!clan?.wars?.length) return editReply(token,cid,{title:'⚔ Guerras',description:'Nenhuma guerra ativa no momento.',color:COR.dark},'',env)
      return editReply(token,cid,{title:'⚔ Guerras Ativas',description:clan.wars.map(w=>`⚔ vs **${w.enemy}** -- ${w.status}`).join('\n'),color:COR.red},'',env)
    }
    if (sub==='declarar') {
      if (!isLeader) return editErr(token,cid,'Apenas o lider pode declarar vitoria.',env)
      if (clan) { clan.wins=(clan.wins||0)+1; await kv.set(env.DB,kv.clanKey(gid),clan) }
      return editReply(token,cid,{title:'🏆 VITORIA DECLARADA!',description:`**${clan?.name}** declara vitoria!\n\n*Aguardando confirmacao do cla inimigo ou dos moderadores.*`,color:COR.gold},'',env)
    }
  }

  return editErr(token,cid,'Comando nao reconhecido.',env)
}

// - Handler -
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url)
    if (url.searchParams.get('action')==='register') return new Response(await register(env))
    if (req.method!=='POST') return new Response('BawMC Clan Bot ✅')
    const body = await req.text()
    if (!await verify(req,env.PUBLIC_KEY||'',body)) return new Response('Unauthorized',{status:401})
    const data = JSON.parse(body)
    if (data.type===1) return new Response('{"type":1}',{headers:{'Content-Type':'application/json'}})
    if (data.type===2) {
      const cmd = data.data.name
      const sub = data.data.options?.[0]?.type===1 ? data.data.options[0].name : null
      const rawOpts = sub ? (data.data.options[0].options||[]) : (data.data.options||[])
      const opts = Object.fromEntries(rawOpts.map(o=>[o.name,o.value]))
      ctx.waitUntil(process(cmd,sub,opts,data,data.token,env))
      return new Response('{"type":5}',{headers:{'Content-Type':'application/json'}})
    }
    return new Response('OK')
  }
}
