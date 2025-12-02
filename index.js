const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActivityType } = require('discord.js');
const fs = require('fs');
const http = require('http'); 

// --- Variáveis de Estado ---
let gameTime = null;
let realTime = null;
let rate = 1; 
// 🆕 NOVA VARIÁVEL: Para garantir que o reset só ocorra uma vez por dia
let lastResetDate = null; 

// --- Carregamento de Dados ---
if (fs.existsSync('tempo.json')) {
    try {
        const data = JSON.parse(fs.readFileSync('tempo.json'));
        
        const loadedGameTime = data.gameTime ? new Date(data.gameTime) : null;
        const loadedRealTime = data.realTime ? new Date(data.realTime) : null;
        
        if (loadedGameTime && !isNaN(loadedGameTime.getTime())) {
            gameTime = loadedGameTime;
        }
        if (loadedRealTime && !isNaN(loadedRealTime.getTime())) {
            realTime = loadedRealTime;
        }
        
        rate = data.rate ?? 1;
        // Carrega a data do último reset
        lastResetDate = data.lastResetDate ? new Date(data.lastResetDate) : null;

    } catch (e) {
        console.error("Erro ao carregar tempo.json. Iniciando com valores padrão.", e);
    }
}

// --- Funções Auxiliares ---

function save() {
    fs.writeFileSync('tempo.json', JSON.stringify({
        gameTime: gameTime ? gameTime.toISOString() : null,
        realTime: realTime ? realTime.toISOString() : null,
        rate,
        lastResetDate: lastResetDate ? lastResetDate.toISOString() : null // Salva a nova variável
    }));
}

function getCurrentGameTime() {
    if (!gameTime || !realTime || isNaN(gameTime.getTime()) || isNaN(realTime.getTime())) {
        return "Horário não configurado."; 
    }

    const now = new Date();
    const diffRealMs = now.getTime() - realTime.getTime();
    
    if (diffRealMs <= 0) {
        return gameTime.toTimeString().split(' ')[0];
    }
    
    const diffGameMs = diffRealMs * rate; 
    const final = new Date(gameTime.getTime() + diffGameMs);

    // Retorna HH:MM:SS
    return final.toTimeString().split(' ')[0];
}

function updateStatus(client) {
    const now = new Date();
    
    // 🔔 Lógica de Reajuste Diário (Hard Reset)
    const resetHour = 5; // 5:00 da manhã, horário real
    const nowHour = now.getHours();
    
    // Verifica se é hora do reset (entre 05:00:00 e 05:00:05)
    if (nowHour === resetHour && now.getMinutes() === 0) {
        
        // Verifica se o reset já foi feito hoje
        const today = now.toLocaleDateString();
        const lastReset = lastResetDate ? lastResetDate.toLocaleDateString() : null;
        
        if (lastReset !== today) {
            
            // 🎯 Executa o Hard Reset
            let newGameTime = new Date(now.getTime());
            newGameTime.setHours(18, 0, 0, 0); // Define a hora do jogo para 18:00
            
            gameTime = newGameTime;
            realTime = now;
            lastResetDate = now; // Marca que o reset foi feito
            
            save();
            console.log(`[Automatic Reset] Horário do jogo forçado para 18:00. Próximo reset: amanhã às 05:00.`);
            // A função continua e o status será atualizado imediatamente
        }
    }
    
    const time = getCurrentGameTime();
    let statusText = `🕒 RP: ${time}`;
    
    if (time === "Horário não configurado.") {
        statusText = "Aguardando /sethora";
    }

    client.user.setActivity(statusText, { type: ActivityType.Playing });
    console.log(`[Status Update] Novo status definido: ${statusText}`);
}

// --- Discord Bot ---

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on('ready', () => {
    console.log(`Bot iniciado como ${client.user.tag}`);
    
    updateStatus(client);
    // Intervalo de 5 segundos
    setInterval(() => updateStatus(client), 5000); 
});

// --- Registro de Comandos (Usando Variáveis de Ambiente) ---
// ... (Este bloco permanece inalterado) ...
(async () => {
    try {
        const CLIENT_ID = process.env.CLIENT_ID; 
        const BOT_TOKEN = process.env.BOT_TOKEN;

        if (!CLIENT_ID || !BOT_TOKEN) {
            console.error("\nERRO CRÍTICO: As variáveis de ambiente CLIENT_ID ou BOT_TOKEN não estão definidas.");
            return;
        }

        const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
        
        const commands = [
            new SlashCommandBuilder().setName("sethora").setDescription("Define o horário atual do servidor RP").addStringOption(o => o.setName("hora").setDescription("Ex: 12:35").setRequired(true)),
            new SlashCommandBuilder().setName("atualizar").setDescription("Informa o novo horário para calcular a velocidade do tempo").addStringOption(o => o.setName("hora").setDescription("Ex: 12:40").setRequired(true)),
            new SlashCommandBuilder().setName("horaagora").setDescription("Mostra o horário atual do servidor RP"),
            new SlashCommandBuilder()
                .setName("velocidade")
                .setDescription("Mostra ou define a taxa de aceleração do tempo RP (Ex: 2.50x)")
                .addNumberOption(o => 
                    o.setName("nova_taxa")
                     .setDescription("Opcional: A nova taxa de aceleração (Ex: 2.5 ou 0.5).")
                     .setRequired(false) 
                )
        ];

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands }
        );
        console.log("Comandos registrados com sucesso!");
    } catch (error) {
        console.error("Erro ao registrar comandos (Verifique seu CLIENT ID):", error);
    }
})();

// --- Tratamento de Interações ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const cmd = interaction.commandName;

    if (cmd === "sethora") {
        const hora = interaction.options.getString("hora");
        const [h, m] = hora.split(":");
        
        if (isNaN(h) || isNaN(m)) {
            return interaction.reply({ content: "⚠️ Formato de hora inválido. Use o formato HH:MM (Ex: 12:35).", ephemeral: true });
        }

        const now = new Date();
        now.setHours(h, m, 0, 0);
        gameTime = now;
        realTime = new Date();
        rate = 1;
        // Reseta o lastResetDate para garantir que o reset diário ocorra
        lastResetDate = null;
        save();
        updateStatus(client); 
        return interaction.reply(`✔ Horário definido como **${hora}** e velocidade resetada para **1.00x**!`);
    }

    if (cmd === "atualizar") {
        if (!gameTime || !realTime) {
            return interaction.reply({ content: "⚠️ Use /sethora primeiro para definir o ponto de partida.", ephemeral: true });
        }
        
        const hora = interaction.options.getString("hora");
        const [h, m] = hora.split(":");

        if (isNaN(h) || isNaN(m)) {
            return interaction.reply({ content: "⚠️ Formato de hora inválido. Use o formato HH:MM (Ex: 12:40).", ephemeral: true });
        }

        const nowGame = new Date();
        nowGame.setHours(h, m, 0, 0);
        const nowReal = new Date();
        
        const diffReal = (nowReal.getTime() - realTime.getTime()) / 1000;
        const diffGame = (nowGame.getTime() - gameTime.getTime()) / 1000;

        if (diffReal <= 0 || diffGame <= 0) {
             return interaction.reply({ content: "⚠️ O tempo real ou o tempo de jogo não avançaram o suficiente para calcular uma nova taxa.", ephemeral: true });
        }
        
        rate = diffGame / diffReal;
        gameTime = nowGame;
        realTime = nowReal;
        save();
        updateStatus(client); 
        return interaction.reply(`🔧 Nova velocidade calculada: **${rate.toFixed(2)}x**`);
    }

    if (cmd === "horaagora") {
        const currentTime = getCurrentGameTime();
        return interaction.reply(`🕒 Horário do servidor RP: **${currentTime}**`);
    }
    
    if (cmd === "velocidade") {
        const newRateInput = interaction.options.getNumber("nova_taxa"); 

        if (!gameTime || !realTime) {
             return interaction.reply({ content: "⚠️ O tempo de RP deve ser configurado primeiro com /sethora.", ephemeral: true });
        }
        
        if (newRateInput !== null) {
            if (newRateInput <= 0 || isNaN(newRateInput)) {
                return interaction.reply({ content: "⚠️ Taxa inválida. Use um número positivo (Ex: 2.5).", ephemeral: true });
            }

            const oldRate = rate.toFixed(2);
            rate = newRateInput;
            
            // Reajusta os pontos de partida para que o tempo continue de forma precisa com a nova taxa
            const now = new Date();
            const diffRealMs = now.getTime() - realTime.getTime();
            const diffGameMs = diffRealMs * oldRate;
            gameTime = new Date(gameTime.getTime() + diffGameMs); // Calcula o gameTime atual
            realTime = now;
            
            save();
            updateStatus(client); 

            return interaction.reply(`🚀 Velocidade do Tempo RP alterada de **${oldRate}x** para **${rate.toFixed(2)}x**!`);
        } else {
            return interaction.reply(`🚀 Velocidade do Tempo RP atual: **${rate.toFixed(2)}x**`);
        }
    }
});


// Bloco de health check para hospedagem 24/7 (Render)
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Discord Bot is running and connected.');
}).listen(PORT, () => {
    console.log(`[Health Check] Servidor HTTP escutando na porta ${PORT}`);
});

// --- Login Final (Usando Variável de Ambiente) ---
client.login(process.env.BOT_TOKEN);
