/**
 * Yuzo Raid Notifier
 *
 * Isolated notification logic for the Yuzo #raids channel.
 * This module does nothing unless processRaidMessage(message) is explicitly
 * called from the main Discord message handler.
 *
 * Keep testing pointed at a private test channel before enabling production.
 */

// Production Yuzo Discord configuration.
// Discord guild, channel, and role IDs are public identifiers, not secrets.
const RAID_GUILD_ID = "1312215407821590580";
const RAID_CHANNEL_ID = "1549475865392455750";
const RAID_ROLE_ID = "1553777842326737036";

// Basic protection against repeatedly notifying the role.
const userCooldowns = new Map();
const COOLDOWN_MS = 60 * 1000;

// Specifically recognize X / Twitter post URLs.
const X_URL_PATTERN =
    /https?:\/\/(?:www\.|mobile\.)?(?:x\.com|twitter\.com)\/[A-Za-z0-9_]+\/status\/\d+(?:[^\s<]*)?/i;

function containsXLink(content) {
    if (!content || typeof content !== "string") {
        return false;
    }

    return X_URL_PATTERN.test(content);
}

function isOnCooldown(userId) {
    const lastPing = userCooldowns.get(userId);

    if (!lastPing) {
        return false;
    }

    return Date.now() - lastPing < COOLDOWN_MS;
}

function setCooldown(userId) {
    userCooldowns.set(userId, Date.now());
}

/**
 * Process a Discord message and notify the opt-in Raids role when appropriate.
 *
 * Safety:
 * - Ignores DMs
 * - Ignores bots
 * - Only works in the configured raid channel
 * - Requires an X/Twitter status post URL
 * - Prevents rapid repeat notifications from the same user
 * - Restricted to the configured Yuzo server and raids channel
 */
async function processRaidMessage(message) {
    if (!message?.guild) return false;
    if (message.author?.bot) return false;

    // Never operate outside the explicitly configured Yuzo server.
    if (message.guild.id !== RAID_GUILD_ID) {
        return false;
    }

    // Never operate outside the explicitly configured raids channel.
    if (message.channel.id !== RAID_CHANNEL_ID) {
        return false;
    }

    // A raid notification requires an X/Twitter link.
    if (!containsXLink(message.content)) {
        return false;
    }

    // If the author already mentioned the configured Raids role,
    // do not send a duplicate notification.
    if (message.mentions?.roles?.has(RAID_ROLE_ID)) {
        console.log(
            `[RaidNotifier] Raids role already mentioned by ${message.author.tag}`
        );
        return false;
    }

    if (isOnCooldown(message.author.id)) {
        console.log(
            `[RaidNotifier] Cooldown prevented repeat ping from ${message.author.tag}`
        );
        return false;
    }

    try {
        await message.channel.send({
            content: `<@&${RAID_ROLE_ID}>`,
            allowedMentions: {
                roles: [RAID_ROLE_ID],
            },
        });

        setCooldown(message.author.id);

        console.log(
            `[RaidNotifier] Notified Raids for ${message.author.tag}` +
                (containsXLink(message.content) ? " (X/Twitter link)" : "")
        );

        return true;
    } catch (error) {
        console.error(
            "[RaidNotifier] Failed to send raid notification:",
            error
        );
        return false;
    }
}

module.exports = {
    processRaidMessage,
    containsXLink,
};
