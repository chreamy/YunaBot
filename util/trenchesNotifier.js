/**
 * Yuzo Trenches Notifier
 *
 * Watches for successful Rick CA scan messages in the Yuzo #trenches channel
 * and notifies the opt-in Trenches role.
 *
 * This module is intentionally isolated from the bot's normal message handling.
 */

// Production Yuzo Discord configuration.
// Discord guild, channel, role, and bot IDs are public identifiers, not secrets.
const YUZO_GUILD_ID = "1312215407821590580";
const TRENCHES_CHANNEL_ID = "1552020923434147991";
const TRENCHES_ROLE_ID = "1553778195898306580";
const RICK_BOT_ID = "1081815963990761542";

// Protect against processing the same Rick message more than once.
const processedMessages = new Set();

function hasRickCopyCAButton(message) {
    if (!Array.isArray(message?.components)) {
        return false;
    }

    return message.components.some((row) =>
        row.components?.some(
            (component) =>
                component.label === "Copy CA" &&
                typeof component.customId === "string" &&
                component.customId.startsWith("copy:")
        )
    );
}

async function processTrenchesMessage(message) {
    if (!message?.guild) return false;

    // Only Rick can trigger this feature.
    if (message.author?.id !== RICK_BOT_ID) {
        return false;
    }

    // Only operate inside the Yuzo Discord.
    if (message.guild.id !== YUZO_GUILD_ID) {
        return false;
    }

    // Only operate inside #trenches.
    if (message.channel.id !== TRENCHES_CHANNEL_ID) {
        return false;
    }

    // A successful Rick CA scan includes the Copy CA component.
    if (!hasRickCopyCAButton(message)) {
        return false;
    }

    // Never process the same Rick scan message twice.
    if (processedMessages.has(message.id)) {
        return false;
    }

    try {
        await message.channel.send({
            content: `<@&${TRENCHES_ROLE_ID}>`,
            allowedMentions: {
                roles: [TRENCHES_ROLE_ID],
            },
        });

        processedMessages.add(message.id);

        // Keep the in-memory dedupe set bounded.
        if (processedMessages.size > 1000) {
            const oldestMessageId = processedMessages.values().next().value;
            processedMessages.delete(oldestMessageId);
        }

        console.log(
            `[TrenchesNotifier] Notified Trenches for Rick scan ${message.id}`
        );

        return true;
    } catch (error) {
        console.error(
            "[TrenchesNotifier] Failed to send notification:",
            error
        );
        return false;
    }
}

module.exports = {
    processTrenchesMessage,
    hasRickCopyCAButton,
};
