import discord
from discord.ext import commands, tasks
import aiohttp
import asyncio
import json
from bs4 import BeautifulSoup
import logging
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
import undetected_chromedriver as uc
import time
import random
import os

logging.basicConfig(level=logging.INFO)

# TOKEN DO CÓDIGO ANTERIOR (FIXO - NÃO MUDA)
DISCORD_TOKEN = ""  # Token do seu código anterior
TASKITOS_URL = "https://taskitos.cupiditys.lol/"

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix='!', intents=intents)

class TaskitosAutomator:
    def __init__(self):
        self.session = None
        self.driver = None
        self.ra = None
        self.senha = None
        self.logged_in = False
    
    async def init_session(self):
        self.session = aiohttp.ClientSession()
    
    def init_driver(self):
        options = Options()
        options.add_argument('--headless')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        self.driver = uc.Chrome(options=options)
    
    async def set_credentials(self, ra: str, senha: str):
        """Define RA e Senha via comando"""
        self.ra = ra
        self.senha = senha
        print(f"✅ Credenciais salvas: RA={ra}")
    
    async def login_taskitos(self):
        """Login com credenciais salvas"""
        if not self.ra or not self.senha:
            return False
        
        if self.driver:
            self.driver.quit()
        self.init_driver()
        
        self.driver.get(TASKITOS_URL)
        await asyncio.sleep(3)
        
        try:
            # Preenche RA e Senha
            ra_input = self.driver.find_element(By.NAME, "RA")
            senha_input = self.driver.find_element(By.NAME, "Senha")
            ra_input.clear()
            senha_input.clear()
            ra_input.send_keys(self.ra)
            senha_input.send_keys(self.senha)
            
            # Clica login
            login_btn = self.driver.find_element(By.CSS_SELECTOR, "button[type='submit'], input[type='submit']")
            self.driver.execute_script("arguments[0].click();", login_btn)
            
            await asyncio.sleep(6)
            self.logged_in = "Atividades Pendentes" in self.driver.page_source or "Selecionar Atividades" in self.driver.page_source
            return self.logged_in
        except Exception as e:
            print(f"Erro login: {e}")
            return False
    
    async def auto_complete_tasks(self):
        """Automação completa das tarefas"""
        if not self.logged_in:
            success = await self.login_taskitos()
            if not success:
                return False
        
        try:
            # Seleciona todas (prioriza pendentes)
            checkboxes = self.driver.find_elements(By.XPATH, "//input[@type='checkbox']")
            for cb in checkboxes[:5]:  # Primeiras 5 pra instantâneo
                try:
                    self.driver.execute_script("arguments[0].click();", cb)
                except:
                    pass
            
            await asyncio.sleep(1)
            
            # Configs otimizadas (JS injection pra velocidade)
            self.driver.execute_script("""
                // Pontuação máxima
                let pont_inputs = document.querySelectorAll('input[placeholder*="Pontuação"], input[placeholder*="Score"]');
                pont_inputs.forEach(i => i.value = '100');
                
                // Tempo mínimo
                let tempo_inputs = document.querySelectorAll('input[placeholder*="Mínimo"]');
                tempo_inputs.forEach(i => i.value = '1');
            """)
            
            # Executa tarefas
            buttons = self.driver.find_elements(By.XPATH, "//button[contains(text(),'Fazer') or contains(text(),'Enviar') or contains(text(),'Processar')]")
            if buttons:
                self.driver.execute_script("arguments[0].click();", buttons[0])
            
            # Monitora processamento
            timeout = 60
            start = time.time()
            while time.time() - start < timeout:
                if "Concluídas" in self.driver.page_source or "Processando 0 de 0" in self.driver.page_source:
                    print("✅ Automação concluída!")
                    return True
                await asyncio.sleep(2)
            
            return True
        except Exception as e:
            print(f"Erro automação: {e}")
            return False

automator = TaskitosAutomator()

@bot.event
async def on_ready():
    print(f'{bot.user} pronto para Taskitos! | GitHub: https://github.com/seuuser/taskitos-bot')
    await automator.init_session()
    farm_loop.start()  # Inicia loop auto

@tasks.loop(minutes=3)  # Farm a cada 3min (rápido!)
async def farm_loop():
    """Farm automático nonstop"""
    await automator.auto_complete_tasks()

# COMANDOS PARA RA/SENHA
@bot.command(name='ra')
async def set_ra(ctx, *, ra_value: str):
    """!ra SEU_RA_AQUI - Define RA"""
    await automator.set_credentials(ra_value, automator.senha)
    await ctx.reply(f"✅ RA salvo: `{ra_value}` | Use !senha agora")

@bot.command(name='senha')
async def set_senha(ctx, *, senha_value: str):
    """!senha SUA_SENHA - Define senha (DM privada)"""
    await automator.set_credentials(automator.ra, senha_value)
    await ctx.author.send(f"🔒 Senha salva para RA `{automator.ra}` | Use !farm")
    await ctx.reply("✅ Credenciais salvas (senha via DM)")

@bot.command(name='login')
async def login_cmd(ctx):
    """!login - Faz login com credenciais salvas"""
    await ctx.send("🔑 Logando...")
    success = await automator.login_taskitos()
    await ctx.reply("✅ Logado!" if success else "❌ Credenciais inválidas | Use !ra e !senha")

@bot.command(name='farm')
async def farm_cmd(ctx):
    """!farm - Faz automação agora"""
    if not automator.ra:
        return await ctx.reply("❌ Defina !ra e !senha primeiro")
    
    await ctx.send("🚀 Farmando Taskitos...")
    success = await automator.auto_complete_tasks()
    emoji = "✅" if success else "❌"
    await ctx.reply(f"{emoji} Farm concluído! | GitHub: https://github.com/seuuser/taskitos-bot")

@bot.command(name='status')
async def status_cmd(ctx):
    """!status - Ver status"""
    ra_status = automator.ra[:4] + "..." if automator.ra else "Não definido"
    await ctx.reply(f"📊 RA: `{ra_status}` | Logado: {'✅' if automator.logged_in else '❌'} | Auto-farm: ON")

@bot.command(name='stop')
@commands.has_permissions(administrator=True)
async def stop_farm(ctx):
    """!stop - Para auto-farm (admin only)"""
    farm_loop.stop()
    await ctx.reply("⏹️ Auto-farm parado")

@bot.event
async def on_message(message):
    await bot.process_commands(message)
    if bot.user.mentioned_in(message):
        await message.reply("⚡ Use !ra SEU_RA → !senha SUA_SENHA → !farm", mention_author=True)

# GitHub pronto pra fork
print("GitHub Repo: https://github.com/seuusername/taskitos-discord-bot")
bot.run(DISCORD_TOKEN)
