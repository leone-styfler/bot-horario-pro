const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActivityType } = require('discord.js');
const fs = require('fs');
const http = require('http'); // Essencial para hospedar no Render (Health Check)

// --- Variáveis de Estado ---
let gameTime = null; // Último horário de jogo definido (Objeto Date)
let realTime = null; // Último horário real definido (Objeto Date)
let rate = 1; // Fator de multiplicação do tempo (Ex: 60x, 1x)

// --- Carregamento de Dados ---
if (fs.existsSync('tempo.json')) {
    try {
        const data = JSON.parse(fs.readFileSync('tempo.json'));
        
        // Carrega datas e garante que são válidas
        const loadedGameTime = data.gameTime ? new Date(data.gameTime) : null;
        const loadedRealTime = data.realTime ? new Date(data.realTime) : null;
        
        if (loadedGameTime && !isNaN(loadedGameTime.getTime())) {
            gameTime = loadedGameTime;
        }
        if (loadedRealTime && !isNaN(loadedRealTime.getTime())) {
            realTime = loadedRealTime;
        }
        
        rate = data.rate ?? 1;

    } catch (e) {
        console.error("Erro ao carregar tempo.json. Iniciando com valores padrão.", e);
    }
}

// --- Funções Auxiliares ---

// Salva o estado atual no arquivo JSON
function save() {
    fs.writeFileSync('tempo.json', JSON.stringify({
        gameTime: gameTime ? gameTime.toISOString() : null,
        realTime: realTime ? realTime.toISOString() : null,
        rate
    }));
}

// 🎯 FUNÇÃO CENTRAL: Calcula o horário atual do jogo com base no rate
function getCurrentGameTime() {
    if (!gameTime || !realTime || isNaN(gameTime.getTime()) || isNaN(realTime.getTime())) {
        return "Horário não configurado."; 
    }

    const now = new Date();
    
    // Calcula a diferença de tempo real em milissegundos (muito preciso)
    const diffRealMs = now.getTime() - realTime.getTime();
    
    // Se não houver passado tempo real, retorna o último horário definido
    if (diffRealMs <= 0) {
        return gameTime.toTimeString().split(' ')[0];
    }
    
    // Calcula o quanto de tempo de jogo passou (diffRealMs * rate)
    const gameDiffMs = diffRealMs * rate; 
    
    // Calcula o tempo final do jogo
    const final = new Date(gameTime.getTime() + gameDiffMs);

    // Retorna a hora formatada (HH:MM:SS)
    return final.toTimeString().split(' ')[0];
}

// 🎯 FUNÇÃO: Atualiza o status/atividade do bot no Discord
function updateStatus(client) {
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
    
    // Inicia e configura o intervalo de atualização do status
    updateStatus(client);
    // Intervalo de 30 segundos (30000ms) para maior precisão visual
    setInterval(() => updateStatus(client), 30000); 
});

// --- Definição dos Comandos ---
const commands = [
    new SlashCommandBuilder()
        .setName("sethora")
        .setDescription("Define o horário atual do servidor RP")
        .addStringOption(o => o.setName("hora").setDescription("Ex: 12:35").setRequired(true)),

    new SlashCommandBuilder()
        .setName("atualizar")
        .setDescription("Informa o novo horário para calcular a velocidade do tempo")
        .addStringOption(o => o.setName("hora").setDescription("Ex: 12:40").setRequired(true)),

    new SlashCommandBuilder()
        .setName("horaagora")
        .setDescription("Mostra o horário atual do servidor RP")
];


// --- Registro de Comandos (Usando Variáveis de Ambiente) ---

(async () => {
    try {
        // Lendo variáveis de ambiente do Render
        const CLIENT_ID = process.env.CLIENT_ID; 
        const BOT_TOKEN = process.env.BOT_TOKEN;

        if (!CLIENT_ID || !BOT_TOKEN) {
            console.error("\nERRO CRÍTICO: As variáveis de ambiente CLIENT_ID ou BOT_TOKEN não estão definidas. Verifique o painel do Render.");
            return;
        }

        const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
        
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

    // --- Lógica do /sethora ---
    if (cmd === "sethora") {
        const hora = interaction.options.getString("hora");
        const [h, m] = hora.split(":");
        
        if (isNaN(h) || isNaN(m)) {
            return interaction.reply({ content: "⚠️ Formato de hora inválido. Use o formato HH:MM (Ex: 12:35).", ephemeral: true });
        }

        // Define a nova hora no objeto Date
        const now = new Date();
        now.setHours(h, m, 0, 0);
        
        gameTime = now;
        realTime = new Date(); // Captura o momento exato da execução
        rate = 1; // Reseta a taxa para 1x
        
        save();
        updateStatus(client); 

        return interaction.reply(`✔ Horário definido como **${hora}** e velocidade resetada para **1.00x**!`);
    }

    // --- Lógica do /atualizar ---
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
        
        // Diferença de tempo em segundos
        const diffReal = (nowReal.getTime() - realTime.getTime()) / 1000;
        const diffGame = (nowGame.getTime() - gameTime.getTime()) / 1000;

        if (diffReal <= 0 || diffGame <= 0) {
             return interaction.reply({ content: "⚠️ O tempo real ou o tempo de jogo não avançaram o suficiente para calcular uma nova taxa.", ephemeral: true });
        }
        
        // Nova taxa (Rate) = (Tempo de Jogo Passado) / (Tempo Real Passado)
        rate = diffGame / diffReal;
        
        // Atualiza a nova referência de tempo para o próximo cálculo
        gameTime = nowGame;
        realTime = nowReal;
        
        save();
        updateStatus(client); 

        return interaction.reply(`🔧 Nova velocidade calculada: **${rate.toFixed(2)}x**`);
    }

    // --- Lógica do /horaagora ---
    if (cmd === "horaagora") {
        const currentTime = getCurrentGameTime();
        return interaction.reply(`🕒 Horário do servidor: **${currentTime}**`);
    }
});


// 🚨 BLOCO ESSENCIAL PARA HOSPEDAGEM 24/7 (RENDER)
// Abre uma porta HTTP para satisfazer o health check do Render.
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Discord Bot is running and connected.');
}).listen(PORT, () => {
    console.log(`[Health Check] Servidor HTTP escutando na porta ${PORT}`);
});

// --- Login Final (Usando Variável de Ambiente) ---
client.login(process.env.BOT_TOKEN);
