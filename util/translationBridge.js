const YUZO_GUILD_ID = "1312215407821590580";
const GENERAL_CHANNEL_ID =
    process.env.TRANSLATION_GENERAL_CHANNEL_ID || "1312216265510621244";
const CHINESE_CHANNEL_ID =
    process.env.TRANSLATION_CHINESE_CHANNEL_ID || "1312218133112688731";

const CLOUDFLARE_MODEL = "@cf/meta/m2m100-1.2b";
const TRANSLATION_TIMEOUT_MS = 8000;

// Protect Yuzo-specific terminology from being altered by the translation model.
// We replace these terms with neutral placeholders before translation and restore
// the original spelling afterward.
const PROTECTED_TERMS = [
    "$WAIFUS",
    "veWAIFUS",
    "Robinhood Chain",
    "Golden Shovel",
    "Pay Day",
    "Yuna",
    "Yuzo",
    "Anvil",
];

function protectTerms(text) {
    const replacements = [];

    let protectedText = text;

    PROTECTED_TERMS.forEach((term, index) => {
        const placeholder = `ZXQTERM${index}QXZ`;

        if (protectedText.includes(term)) {
            protectedText = protectedText.split(term).join(placeholder);
            replacements.push({ placeholder, term });
        }
    });

    return {
        text: protectedText,
        replacements,
    };
}

function restoreTerms(text, replacements) {
    let restoredText = text;

    for (const { placeholder, term } of replacements) {
        restoredText = restoredText.split(placeholder).join(term);
    }

    return restoredText;
}

async function translateText(text, sourceLang, targetLang) {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const token = process.env.CLOUDFLARE_AI_TOKEN;

    if (!accountId || !token) {
        console.error(
            "[TranslationBridge] Cloudflare credentials are not configured."
        );
        return null;
    }

    const protectedInput = protectTerms(text);

    const controller = new AbortController();
    const timeout = setTimeout(
        () => controller.abort(),
        TRANSLATION_TIMEOUT_MS
    );

    try {
        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CLOUDFLARE_MODEL}`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    text: protectedInput.text,
                    source_lang: sourceLang,
                    target_lang: targetLang,
                }),
                signal: controller.signal,
            }
        );

        if (!response.ok) {
            console.error(
                `[TranslationBridge] Cloudflare returned HTTP ${response.status}.`
            );
            return null;
        }

        const data = await response.json();
        const translatedText = data?.result?.translated_text;

        if (
            !data?.success ||
            typeof translatedText !== "string" ||
            !translatedText.trim()
        ) {
            console.error(
                "[TranslationBridge] Cloudflare returned an invalid translation response."
            );
            return null;
        }

        return restoreTerms(translatedText.trim(), protectedInput.replacements);
    } catch (error) {
        if (error?.name === "AbortError") {
            console.error("[TranslationBridge] Translation request timed out.");
        } else {
            console.error(
                "[TranslationBridge] Translation request failed:",
                error?.message || error
            );
        }

        return null;
    } finally {
        clearTimeout(timeout);
    }
}

function splitIntoTranslationSegments(text) {
    const normalized = text.trim();

    if (!normalized) return [];

    // Split after English or Chinese sentence-ending punctuation while keeping
    // the punctuation attached to the sentence. This makes M2M100 more reliable
    // with multi-sentence and mixed Chinese/English Discord messages.
    const segments =
        normalized.match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/g)
            ?.map((segment) => segment.trim())
            .filter(Boolean) || [];

    return segments.length ? segments : [normalized];
}

async function translateMessageText(text, sourceLang, targetLang) {
    const segments = splitIntoTranslationSegments(text);

    if (!segments.length) return null;

    const translatedSegments = [];

    for (const segment of segments) {
        const translated = await translateText(
            segment,
            sourceLang,
            targetLang
        );

        // Fail closed. If any segment cannot be translated, do not post a
        // partial version of the user's message into the other channel.
        if (!translated) return null;

        translatedSegments.push(translated);
    }

    return translatedSegments.join(" ");
}

async function processTranslationMessage(message) {
    try {
        if (!message?.guild) return false;
        if (message.guild.id !== YUZO_GUILD_ID) return false;
        if (message.author?.bot) return false;

        let targetChannelId;
        let sourceLang;
        let targetLang;

        if (message.channel.id === GENERAL_CHANNEL_ID) {
            targetChannelId = CHINESE_CHANNEL_ID;
            sourceLang = "english";
            targetLang = "chinese";
        } else if (message.channel.id === CHINESE_CHANNEL_ID) {
            targetChannelId = GENERAL_CHANNEL_ID;
            sourceLang = "chinese";
            targetLang = "english";
        } else {
            return false;
        }

        const content = message.content?.trim();

        if (!content) return false;

        const translatedText = await translateMessageText(
            content,
            sourceLang,
            targetLang
        );

        if (!translatedText) return false;

        const targetChannel =
            message.guild.channels.cache.get(targetChannelId) ||
            (await message.guild.channels.fetch(targetChannelId).catch(() => null));

        if (!targetChannel || !targetChannel.isTextBased()) {
            console.error(
                `[TranslationBridge] Target channel ${targetChannelId} is unavailable.`
            );
            return false;
        }

        await targetChannel.send({
            content: translatedText,
            allowedMentions: {
                parse: [],
            },
        });

        return true;
    } catch (error) {
        console.error(
            "[TranslationBridge] Unexpected error:",
            error?.message || error
        );
        return false;
    }
}

module.exports = {
    processTranslationMessage,
    translateText,
    translateMessageText,
    splitIntoTranslationSegments,
    protectTerms,
    restoreTerms,
};
