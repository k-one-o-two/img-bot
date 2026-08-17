/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Downloads all messages (and media) from a Telegram channel to disk.
 *
 * Usage:
 *   npx tsx dump-channel.ts [channelId]
 *
 * If no channelId is passed, defaults to 4403760836.
 *
 * Output layout:
 *   channel_dump/<channelId>/
 *     messages.jsonl   # one JSON object per line, oldest → newest
 *     media/<msgId>.<ext>
 *
 * The script is resumable: on re-runs it reads the highest message id
 * already saved in messages.jsonl and only downloads newer messages.
 *
 * Requires the same auth env vars as the bot (API_ID, API_HASH, PHONE,
 * PASS, P_CODE) — see settings.ts. Reuses the `my_session` StoreSession
 * so you don't need to re-verify on each run.
 */
import fs from "fs";
import path from "path";
import readline from "readline";
import { Api } from "telegram";
import { utils } from "./utils.js";
const DEFAULT_CHANNEL_ID = "4403760836";
const dumpRoot = (channelId) => path.join(process.cwd(), "channel_dump", channelId);
const ensureDirs = (channelId) => {
    const root = dumpRoot(channelId);
    const mediaDir = path.join(root, "media");
    fs.mkdirSync(mediaDir, { recursive: true });
    return { root, mediaDir, jsonl: path.join(root, "messages.jsonl") };
};
/** Read the highest message id already saved so we can resume. */
const getResumeFromId = async (jsonlPath) => {
    if (!fs.existsSync(jsonlPath))
        return 0;
    let maxId = 0;
    const rl = readline.createInterface({
        input: fs.createReadStream(jsonlPath, { encoding: "utf8" }),
        crlfDelay: Infinity,
    });
    for await (const line of rl) {
        if (!line.trim())
            continue;
        try {
            const parsed = JSON.parse(line);
            if (typeof parsed.id === "number" && parsed.id > maxId)
                maxId = parsed.id;
        }
        catch {
            // skip malformed lines
        }
    }
    return maxId;
};
const peerToString = (peer) => {
    if (!peer)
        return null;
    if (peer.userId != null)
        return `user:${peer.userId.toString()}`;
    if (peer.chatId != null)
        return `chat:${peer.chatId.toString()}`;
    if (peer.channelId != null)
        return `channel:${peer.channelId.toString()}`;
    return null;
};
const inferExtension = (media) => {
    if (media instanceof Api.MessageMediaPhoto)
        return "jpg";
    if (media instanceof Api.MessageMediaDocument) {
        const doc = media.document;
        if (!doc)
            return "bin";
        const nameAttr = (doc.attributes || []).find((a) => a instanceof Api.DocumentAttributeFilename);
        if (nameAttr?.fileName) {
            const ext = path.extname(nameAttr.fileName).replace(".", "");
            if (ext)
                return ext.toLowerCase();
        }
        const mime = doc.mimeType;
        if (mime) {
            const map = {
                "image/jpeg": "jpg",
                "image/png": "png",
                "image/webp": "webp",
                "image/gif": "gif",
                "video/mp4": "mp4",
                "video/quicktime": "mov",
                "video/webm": "webm",
                "audio/mpeg": "mp3",
                "audio/ogg": "ogg",
                "audio/mp4": "m4a",
                "application/pdf": "pdf",
                "application/zip": "zip",
            };
            if (map[mime])
                return map[mime];
            const guess = mime.split("/")[1];
            if (guess)
                return guess.split(";")[0];
        }
    }
    return "bin";
};
const summarizeMedia = (media) => {
    if (!media)
        return null;
    const summary = {
        type: media.className || media.constructor?.name || "unknown",
        file: null,
    };
    if (media instanceof Api.MessageMediaDocument) {
        const doc = media.document;
        if (doc) {
            summary.mimeType = doc.mimeType;
            const nameAttr = (doc.attributes || []).find((a) => a instanceof Api.DocumentAttributeFilename);
            if (nameAttr?.fileName)
                summary.fileName = nameAttr.fileName;
            const videoAttr = (doc.attributes || []).find((a) => a instanceof Api.DocumentAttributeVideo ||
                a instanceof Api.DocumentAttributeAudio);
            if (videoAttr) {
                if ("duration" in videoAttr)
                    summary.duration = videoAttr.duration;
                if ("w" in videoAttr)
                    summary.width = videoAttr.w;
                if ("h" in videoAttr)
                    summary.height = videoAttr.h;
            }
        }
    }
    return summary;
};
const shouldDownload = (media) => {
    if (!media)
        return false;
    return (media instanceof Api.MessageMediaPhoto ||
        media instanceof Api.MessageMediaDocument);
};
const resolveChannel = async (client, rawId) => {
    const attempts = [
        // As a numeric raw channel id
        () => BigInt(rawId),
        // Bot-API style: -100<channelId>
        () => BigInt(`-100${rawId}`),
        // Direct string
        () => rawId,
        // As plain number
        () => Number(rawId),
    ];
    let lastErr;
    for (const build of attempts) {
        try {
            const value = build();
            const entity = await client.getEntity(value);
            return entity;
        }
        catch (err) {
            lastErr = err;
        }
    }
    throw new Error(`Could not resolve channel ${rawId}. Make sure the account is a member of it.\nLast error: ${lastErr?.message ?? lastErr}`);
};
const run = async () => {
    const channelId = process.argv[2] ?? DEFAULT_CHANNEL_ID;
    console.log(`[dump] target channel id: ${channelId}`);
    const { mediaDir, jsonl } = ensureDirs(channelId);
    const resumeFromId = await getResumeFromId(jsonl);
    if (resumeFromId > 0) {
        console.log(`[dump] resuming after message id ${resumeFromId}`);
    }
    console.log("[dump] logging in…");
    const client = await utils.login();
    console.log("[dump] resolving channel entity…");
    const entity = await resolveChannel(client, channelId);
    console.log(`[dump] resolved: ${entity.title ?? entity.username ?? "(no title)"} ` +
        `[${entity.id?.toString?.() ?? "?"}]`);
    const writeStream = fs.createWriteStream(jsonl, {
        flags: "a",
        encoding: "utf8",
    });
    let count = 0;
    const startedAt = Date.now();
    try {
        for await (const message of client.iterMessages(entity, {
            reverse: true,
            minId: resumeFromId,
            waitTime: 1,
        })) {
            const msg = message;
            const mediaSummary = summarizeMedia(msg.media);
            if (shouldDownload(msg.media)) {
                const ext = inferExtension(msg.media);
                const outPath = path.join(mediaDir, `${msg.id}.${ext}`);
                try {
                    if (!fs.existsSync(outPath)) {
                        await client.downloadMedia(msg, { outputFile: outPath });
                    }
                    if (mediaSummary)
                        mediaSummary.file = path.relative(process.cwd(), outPath);
                }
                catch (err) {
                    console.error(`[dump] media download failed for msg ${msg.id}:`, err);
                }
            }
            const reactions = [];
            if (msg.reactions?.results) {
                for (const r of msg.reactions.results) {
                    const emoticon = r.reaction?.emoticon ?? r.reaction?.documentId?.toString() ?? "?";
                    reactions.push({ emoticon, count: r.count });
                }
            }
            const saved = {
                id: msg.id,
                date: msg.date,
                dateFormatted: new Date(msg.date * 1000).toISOString(),
                text: msg.message ?? "",
                fromId: peerToString(msg.fromId),
                peerId: peerToString(msg.peerId),
                replyTo: msg.replyTo?.replyToMsgId ?? null,
                views: msg.views ?? null,
                forwards: msg.forwards ?? null,
                editDate: msg.editDate ?? null,
                postAuthor: msg.postAuthor ?? null,
                groupedId: msg.groupedId?.toString?.() ?? null,
                fwdFrom: msg.fwdFrom
                    ? {
                        fromName: msg.fwdFrom.fromName ?? null,
                        fromId: peerToString(msg.fwdFrom.fromId),
                        date: msg.fwdFrom.date ?? null,
                        channelPost: msg.fwdFrom.channelPost ?? null,
                        postAuthor: msg.fwdFrom.postAuthor ?? null,
                    }
                    : null,
                reactions,
                media: mediaSummary,
                raw: JSON.parse(JSON.stringify(msg, (_key, value) => typeof value === "bigint" ? value.toString() : value)),
            };
            writeStream.write(JSON.stringify(saved) + "\n");
            count++;
            if (count % 25 === 0) {
                const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
                console.log(`[dump] saved ${count} messages (last id ${msg.id}) in ${elapsed}s`);
            }
        }
    }
    finally {
        writeStream.end();
        await new Promise((resolve) => writeStream.on("close", () => resolve()));
        try {
            await client.disconnect();
        }
        catch {
            /* ignore */
        }
    }
    console.log(`[dump] done. ${count} new messages saved to ${jsonl}`);
};
run().catch((err) => {
    console.error("[dump] failed:", err);
    process.exit(1);
});
//# sourceMappingURL=dump-channel.js.map