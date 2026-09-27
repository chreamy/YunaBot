// Core dependencies
const mongoose = require("mongoose");
const { EmbedBuilder } = require("discord.js");
require("dotenv/config");
const { connectMongo } = require("./util/db");
const config = require("./config.json");
const { command } = require("./command");
const { client } = require("./util/client");
const { getGuildSettings } = require("./util/guild");
const serviceManager = require("./service");
const { processTokenMessage } = require("./util/tokenDetector");
const { processRaidMessage } = require("./util/raidNotifier");

let defaultPrefix = "!";

let cmdlist = {
    // fun: {
    //   spam: "spam",
    // },
    // flashnet: {
    //     ping: ["ping", "p"],
    //     status: ["status", "s"],
    // },
    // spark: {
    //     stats: ["tokenstats", "stats", "token"],
    //     top: ["top"],
    //     gains: ["gains", "ga"],
    //     newtokens: ["new", "newtokens"],
    //     lookup: ["lookup", "token-info", "ti"],
    // },
    setup: {
        prefix: ["prefix", "setprefix"],
        setping: ["setping", "pingeveryone"],
        channel: ["setchannel", "channel"],
        settings: ["settings", "config"],
    },
    misc: {
        help: ["help", "h"],
        clear: ["clear", "purge"],
        echo: ["echo", "e"],
    },
    yuna: {
        genyuna: "genyuna",
        yuna: ["yuna", "y"],
        verify: ["verify", "holder"],
    },
    brc20: {
        brc20: ["brc20", "b"],
    },
    // user: {
    //   avatar: ["avatar", "ava"],
    //   userinfo: ["userinfo", "ui", "info", "getuser", "gu"],
    //   messagecount: ["messagecount", "mc"],
    // },
    // util: {
    //   changeprefix: ["changeprefix", "prefix"],
    // },
};
exports.cmdlist = cmdlist;

// Importing command handlers
const echo = require("./cmds/misc/echo");
const help = require("./cmds/misc/help");
const avatar = require("./cmds/user/avatar");
const servers = require("./cmds/misc/servers");
const userinfo = require("./cmds/user/userinfo");
const spam = require("./cmds/fun/spam");
const genyuna = require("./cmds/yuna/genyuna");
const yuna = require("./cmds/yuna/yuna");
const verify = require("./cmds/yuna/verify");
const {
    ensureVerifyPanel,
    onVerifyInteraction,
} = require("./util/yunaVerify");
const prefix = require("./cmds/setup/prefix");
const setping = require("./cmds/setup/setping");
const channel = require("./cmds/setup/channel");
const settings = require("./cmds/setup/settings");
const clear = require("./cmds/misc/clear");
const brc20 = require("./cmds/brc20/brc20");
//         end cmd list
//+------------------------------------------+

connectMongo();

client.on("ready", async () => {
    console.log(`Bot is ready as ${client.user.tag}`);
    const currentdate = new Date();
    const datetime = `${currentdate.getDate()}/${
        currentdate.getMonth() + 1
    }/${currentdate.getFullYear()} @ ${currentdate.getHours()}:${currentdate.getMinutes()}:${currentdate.getSeconds()}`;

    console.log(`Ready at: ${datetime}`);

    // Modern styled embed
    const readyEmbed = new EmbedBuilder()
        .setTitle("🟢 Bot Online")
        .setColor(0x2ecc71) // Green color
        .addFields(
            {
                name: "📊 Statistics",
                value: `\`\`\`yml\nServers: ${client.guilds.cache.size}\nUsers: ${client.users.cache.size}\nChannels: ${client.channels.cache.size}\`\`\``,
                inline: true,
            },
            {
                name: "⚡ Services",
                value: "```diff\n+ Health Monitor\n+ Token Stream\n+ Multi-Server Support```",
                inline: true,
            },
            {
                name: "🕐 Started At",
                value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                inline: false,
            }
        )
        .setFooter({
            text: `${client.user.tag} • Ready`,
            iconURL: client.user.displayAvatarURL(),
        });

    // Send to original channel
    client.channels
        .fetch("1032596705201356810")
        .then((channel) => channel.send({ embeds: [readyEmbed] }))
        .catch(() =>
            console.log("Could not send ready message to original channel")
        );

    // Start background services
    try {
        await serviceManager.startServices();
    } catch (e) {
        console.error("Failed to start services:", e);
    }

    connectMongo();

    try {
        await ensureVerifyPanel(client);
    } catch (e) {
        console.error("Failed to setup verify panel:", e);
    }
});

client.on("messageCreate", async (message) => {
    if (!message.guild) return;
    if (message.author === client.user) return;
    if (message.author.bot) return;

    // Isolated Yuzo raid notification feature.
    // Errors here must never interrupt the bot's existing message processing.
    try {
        await processRaidMessage(message);
    } catch (error) {
        console.error("[RaidNotifier] Unexpected error:", error);
    }

    // Get guild settings from database
    const guildSettings = await getGuildSettings(message.guild.id);
    const guildPrefix = guildSettings?.prefix || defaultPrefix;

    let tokenDetected = false;
    try {
        tokenDetected = await processTokenMessage(message);
    } catch (error) {
        console.error("Error processing token detection:", error);
    }

    if (tokenDetected) {
        return;
    }

    if (typeof msgevents !== "undefined") {
        msgevents(message);
    }

    // Bot mention handler
    if (message.content.startsWith("<@1032039037990600766>")) {
        message.channel.send({
            embeds: [
                {
                    color: 0xfffffe,
                    description: `Use server prefix \`${guildPrefix}\` to call commands`,
                },
            ],
        });
    }

    // Command processing
    if (!message.content.startsWith(guildPrefix)) return;

    const args = message.content
        .slice(guildPrefix.length)
        .split(/\s+/)
        .filter(Boolean);

    for (const [category, cat_commands] of Object.entries(cmdlist)) {
        for (const [key, value] of Object.entries(cat_commands)) {
            command(client, value, eval(key), message, args);
        }
    }
});

client.on("interactionCreate", async (interaction) => {
    try {
        await onVerifyInteraction(interaction);
    } catch (error) {
        console.error("Verify interaction error:", error);
        if (interaction.isRepliable() && !interaction.replied) {
            interaction
                .reply({
                    content: "Something went wrong during verification.",
                    flags: 64,
                })
                .catch(() => null);
        }
    }
});

client.on("guildCreate", async (guild) => {
    console.log(`Joined new guild: ${guild.name} (${guild.id})`);
    try {
        await getGuildSettings(guild.id);
        console.log(`Created database entry for guild: ${guild.name}`);
    } catch (error) {
        console.error(`Failed to create guild entry: ${error.message}`);
    }

    // Call original joinguild if defined
    if (typeof joinguild !== "undefined") {
        joinguild(guild);
    }
});

// Graceful shutdown handlers
process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    serviceManager.stopServices();
    if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
        console.log("MongoDB connection closed");
    }
    client.destroy();
    process.exit(0);
});

process.on("SIGTERM", async () => {
    console.log("\nShutting down...");
    serviceManager.stopServices();
    if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
    }
    console.log("MongoDB connection closed");
    client.destroy();
    process.exit(0);
});

client.login(process.env.TOKEN);
