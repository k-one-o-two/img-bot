import fs from "fs";
import { getCollections } from "./db.js";
import { utils } from "./utils.js";
import { settings } from "./settings.js";
import { contest } from "./contest.js";
import { subMonths, format } from "date-fns";
import path from "path";
import os from "os-utils";
const CONTEST_TAG = "#contest";
// See `utils.ts` — on-disk artifacts live relative to the project root, not to
// this file's location (which points into `dist/` after `tsc` builds).
const PROJECT_ROOT = process.cwd();
// ---- media group buffering --------------------------------------------------
//
// Telegram delivers each photo of an album as its own `Message` sharing a
// `media_group_id`. We buffer those in-memory and flush after a short quiet
// period so we can download all photos, combine them into a single image, add
// one watermark, and forward the album to admins as a single submission.
const MEDIA_GROUP_DEBOUNCE_MS = 2000;
const mediaGroups = new Map();
export const setupBotEvents = (bot) => {
    // ---- text-pattern handlers (formerly `bot.onText`) ----
    bot.hears(/^contest_stat/i, async (ctx) => {
        const msg = ctx.message;
        if (!msg || !utils.isInAdminGroup(msg))
            return;
        const chatId = msg.chat.id;
        const contestEntries = await contest.getContestList();
        const getUserPicture = async (id) => {
            const avatar = await ctx.api.getUserProfilePhotos({
                user_id: id,
                limit: 1,
            });
            if (avatar.photos.length) {
                const firstAvatar = avatar.photos[0][0];
                return await utils.downloadUserPicture(firstAvatar.file_id, id);
            }
            return null;
        };
        for (const entry of contestEntries) {
            const index = contestEntries.indexOf(entry);
            const avatarFileName = await getUserPicture(entry.userId);
            await utils.addWatermark(entry.filename, `by ${entry.userName} votes: ${entry.votes}`, avatarFileName, {
                replace: true,
                contestTarget: true,
            });
            //filename  "./contest/file_197668719_photos_file_94.jpg"
            const buffer = fs.readFileSync(entry.filename.replace("/contest/", "/contest_result/"));
            await ctx.api.sendPhoto({
                chat_id: chatId,
                photo: utils.bufferAsInputFile(buffer, `${entry.userId}.jpg`),
                caption: (index + 1).toString(),
            });
        }
    });
    bot.hears(/^vote$/i, async (ctx) => {
        const msg = ctx.message;
        if (!msg)
            return;
        const chatId = msg.chat.id;
        const contestEntries = await contest.getContestList();
        const voteOptions = [];
        await Promise.all(contestEntries.map(async (entry, index) => {
            const buffer = fs.readFileSync(entry.filename);
            voteOptions.push({
                text: (index + 1).toString(),
                callback_data: (index + 1).toString(),
            });
            return ctx.api.sendPhoto({
                chat_id: chatId,
                photo: utils.bufferAsInputFile(buffer, `vote_${index + 1}.jpg`),
                caption: (index + 1).toString(),
            });
        }));
        const newMessage = await ctx.api.sendMessage({
            chat_id: chatId,
            text: "Cast your vote!",
        });
        await ctx.api.editMessageReplyMarkup({
            chat_id: chatId,
            message_id: newMessage.message_id,
            reply_markup: { inline_keyboard: [voteOptions] },
        });
    });
    // ---- admin approval / rejection handlers ----
    bot.hears(/^ok\s?(.*)/i, async (ctx) => {
        const msg = ctx.message;
        if (!msg || !utils.isInAdminGroup(msg))
            return;
        if (!(await utils.checkMessage(msg, ctx.api)))
            return;
        const match = Array.isArray(ctx.match) ? ctx.match : null;
        const comment = match?.[1];
        const collections = await getCollections();
        const original = msg.reply_to_message;
        const fileId = utils.getFileId(original);
        await collections.fwd.insertOne({
            chatId: msg.chat.id,
            messageId: original.message_id,
        });
        await collections.approved.insertOne({ fileId });
        const savedUser = await utils.getUserByFile(fileId);
        await collections.queue.deleteOne({ fileId });
        if (savedUser) {
            try {
                await collections.users.updateOne({ id: savedUser.user }, { $inc: { approved: 1 } }, { upsert: true });
                await ctx.api.sendMessage({
                    chat_id: savedUser.user,
                    text: `The photo has been approved and added to the queue. ${comment ? `Comment from admins: "${comment}"` : ""}`,
                    reply_parameters: { message_id: savedUser.msgId },
                });
            }
            catch (e) {
                console.log("replying to user failed: ", e);
            }
        }
    });
    bot.hears(/^later\s?(.*)/i, async (ctx) => {
        const msg = ctx.message;
        if (!msg || !utils.isInAdminGroup(msg))
            return;
        if (!(await utils.checkMessage(msg, ctx.api)))
            return;
        const match = Array.isArray(ctx.match) ? ctx.match : null;
        const comment = match?.[1];
        const collections = await getCollections();
        const original = msg.reply_to_message;
        const fileId = utils.getFileId(original);
        try {
            await collections.later.insertOne({
                chatId: msg.chat.id,
                messageId: original.message_id,
            });
        }
        catch (e) {
            console.log("forward failed: ", e);
        }
        await collections.approved.insertOne({ fileId });
        const savedUser = await utils.getUserByFile(fileId);
        await collections.queue.deleteOne({ fileId });
        if (savedUser) {
            try {
                await collections.users.updateOne({ id: savedUser.user }, { $inc: { approved: 1 } }, { upsert: true });
                await ctx.api.sendMessage({
                    chat_id: savedUser.user,
                    text: `The photo has been approved to be send next Saturday (off-topic day). ${comment ? `Comment from admins: "${comment}"` : ""}`,
                    reply_parameters: { message_id: savedUser.msgId },
                });
            }
            catch (e) {
                console.log("replying to user failed: ", e);
            }
        }
    });
    bot.hears(/^no (.+)/i, async (ctx) => {
        const msg = ctx.message;
        if (!msg || !utils.isInAdminGroup(msg))
            return;
        if (!(await utils.checkMessage(msg, ctx.api)))
            return;
        const match = Array.isArray(ctx.match) ? ctx.match : null;
        const resp = match?.[1];
        const original = msg.reply_to_message;
        const fileId = utils.getFileId(original);
        const collections = await getCollections();
        await collections.rejected.insertOne({ fileId });
        const savedUser = await utils.getUserByFile(fileId);
        await collections.queue.deleteOne({ fileId });
        if (savedUser) {
            try {
                await collections.users.updateOne({ id: savedUser.user }, { $inc: { rejected: 1 } }, { upsert: true });
                await ctx.api.sendMessage({
                    chat_id: savedUser.user,
                    text: `The photo has been rejected, reason: "${resp}"`,
                    reply_parameters: { message_id: savedUser.msgId },
                });
            }
            catch (e) {
                console.log("replying to user failed: ", e);
            }
        }
    });
    bot.hears(/^forget$/i, async (ctx) => {
        const msg = ctx.message;
        if (!msg || !utils.isInAdminGroup(msg))
            return;
        if (!(await utils.checkMessage(msg, ctx.api)))
            return;
        const collections = await getCollections();
        const original = msg.reply_to_message;
        const fileId = utils.getFileId(original);
        await collections.rejected.insertOne({ fileId });
        const savedUser = await utils.getUserByFile(fileId);
        await collections.queue.deleteOne({ fileId });
        if (savedUser) {
            try {
                await collections.users.updateOne({ id: savedUser.user }, { $inc: { rejected: 1 } }, { upsert: true });
            }
            catch (e) {
                console.log("removing chat failed: ", e);
            }
        }
    });
    // ---- reporting / utility text commands ----
    bot.hears(/^get_best_of_month$/i, async (ctx) => {
        const msg = ctx.message;
        if (!msg)
            return;
        const chatId = msg.chat.id;
        const prevMonth = subMonths(new Date(), 1);
        const client = await utils.login();
        const bestOfTheMonth = await utils.getBestOfCurrentMonth(client);
        await utils.makePostcard();
        const buffer = fs.readFileSync(`./output_stamp.jpg`);
        await ctx.api.sendPhoto({
            chat_id: chatId,
            photo: utils.bufferAsInputFile(buffer, "best_of_month.jpg"),
            caption: `Top photo of ${format(prevMonth, "MMMM yyyy")} with ${bestOfTheMonth.reactionsCnt} likes`,
        });
    });
    bot.hears(/^get_best_of_week$/i, async (ctx) => {
        const msg = ctx.message;
        if (!msg)
            return;
        const chatId = msg.chat.id;
        const size = 512;
        const client = await utils.login();
        const imagesLength = await utils.getBestOfCurrentWeek(client);
        await utils.squareImages(imagesLength, size);
        for (let i = 0; i < imagesLength; i++) {
            const filePath = path.join(PROJECT_ROOT, `square/output_square_${i}.jpg`);
            if (!fs.existsSync(filePath)) {
                console.error(`File output_square_${i}.jpg does not exist`);
                continue;
            }
            const buffer = fs.readFileSync(filePath);
            await ctx.api.sendPhoto({
                chat_id: chatId,
                photo: utils.bufferAsInputFile(buffer, `best_${i}.jpg`),
            });
        }
    });
    bot.hears(/^get_best_of_week\s(.+)$/i, async (ctx) => {
        const msg = ctx.message;
        if (!msg)
            return;
        const chatId = msg.chat.id;
        const match = Array.isArray(ctx.match) ? ctx.match : null;
        const size = match?.[1] ?? 512;
        const client = await utils.login();
        const imagesLength = await utils.getBestOfCurrentWeek(client);
        await utils.squareImages(imagesLength, size);
        for (let i = 0; i < imagesLength; i++) {
            const filePath = path.join(PROJECT_ROOT, `square/output_square_${i}.jpg`);
            if (!fs.existsSync(filePath)) {
                console.error(`File output_square_${i}.jpg does not exist`);
                continue;
            }
            const buffer = fs.readFileSync(filePath);
            await ctx.api.sendPhoto({
                chat_id: chatId,
                photo: utils.bufferAsInputFile(buffer, `best_${i}.jpg`),
            });
        }
    });
    bot.hears(/^show_fwd_queue$/i, async (ctx) => {
        const msg = ctx.message;
        if (!msg || !utils.isInAdminGroup(msg))
            return;
        const chatId = msg.chat.id;
        const collections = await getCollections();
        const messages = await collections.fwd.find({}).toArray();
        const delayedMessages = await collections.later.find({}).toArray();
        await ctx.api.sendMessage({
            chat_id: chatId,
            text: `I have ${messages.length} in my fwdQueue and ${delayedMessages.length} in my laterQueue`,
        });
    });
    bot.hears(/^rules$/i, async (ctx) => {
        const msg = ctx.message;
        if (!msg)
            return;
        const rulesContent = fs.readFileSync("rules.txt", "utf8");
        await ctx.api.sendMessage({ chat_id: msg.chat.id, text: rulesContent });
    });
    bot.hears(/^show_chats_array$/i, async (ctx) => {
        const msg = ctx.message;
        if (!msg || !utils.isInAdminGroup(msg))
            return;
        const chatId = msg.chat.id;
        const collections = await getCollections();
        const messages = await collections.queue.find({}).toArray();
        if (!messages.length) {
            await ctx.api.sendMessage({
                chat_id: chatId,
                text: "all good, no unchecked messages",
            });
        }
        for (const message of messages) {
            await ctx.api.forwardMessage({
                chat_id: chatId,
                from_chat_id: message.user,
                message_id: message.msgId,
            });
        }
    });
    // ---- callback query (vote button presses) ----
    bot.on("callback_query", async (ctx) => {
        const query = ctx.callbackQuery;
        if (!query)
            return;
        const chatId = query.from.id;
        const { data } = query;
        const voteError = await contest.recordVote(chatId, Number(data));
        if (voteError) {
            await ctx.api.sendMessage({
                chat_id: chatId,
                text: `There has been a mistake: ${voteError}`,
            });
            return;
        }
        await ctx.api.sendMessage({
            chat_id: chatId,
            text: `Your voice has been heard, may the photo number ${data} be the winner!`,
        });
    });
    // ---- shared photo processing pipeline (single photo or media group) ----
    const handlePhotoSubmission = async (submission) => {
        // 1. Download each source photo.
        const filenames = [];
        for (const fileId of submission.fileIds) {
            const file = await utils.getFileInfo(fileId);
            const filename = await utils.downloadFile(file.result.file_path, submission.chatId, { isContest: submission.isContest });
            filenames.push(filename);
        }
        // 2. If it's an album, stitch the pieces into one wide image.
        let filename;
        if (filenames.length === 1) {
            filename = filenames[0];
        }
        else {
            const dir = submission.isContest ? "contest" : "output";
            filename = `./${dir}/group_${submission.chatId}_${submission.replyToMsgId}.jpg`;
            await utils.combineImagesGrid(filenames, filename);
        }
        const chatId = submission.chatId;
        const name = submission.from.first_name || submission.from.username;
        // 3a. Contest branch.
        if (submission.isContest) {
            const photoId = await contest.addPhoto(filename, chatId, submission.from.username, submission.from.first_name);
            if (!photoId) {
                await bot.api.sendMessage({
                    chat_id: chatId,
                    text: `You can't add more than one photo to the current contest, sorry.`,
                });
                utils.deleteFile(filename);
                return;
            }
            await bot.api.sendMessage({
                chat_id: settings.adminGroup,
                text: `User ${name} has added photo to the contest (${photoId})`,
            });
            await bot.api.sendMessage({
                chat_id: chatId,
                text: `The photo has been added to the contest list, good luck!`,
                reply_parameters: { message_id: submission.replyToMsgId },
            });
            return;
        }
        // 3b. Main branch: watermark and forward to admins for approval.
        const avatar = await bot.api.getUserProfilePhotos({
            user_id: submission.from.id,
            limit: 1,
        });
        let avatarFileName = null;
        if (avatar.photos.length) {
            const firstAvatar = avatar.photos[0][0];
            avatarFileName = await utils.downloadUserPicture(firstAvatar.file_id, submission.chatId);
        }
        const strippedName = /[a-zA-Z\s0-9а-яА-Я\-_!?:#$%^*\\(\\)]+/
            .exec(name || "")[0]
            .trim();
        const watermark = name
            ? `By ${strippedName} for Postikortti Suomesta`
            : "Postikortti Suomesta";
        await utils.addWatermark(filename, watermark, avatarFileName);
        const collections = await getCollections();
        await bot.api.sendMessage({
            chat_id: chatId,
            text: `The photo has been sent for approval`,
            reply_parameters: { message_id: submission.replyToMsgId },
        });
        try {
            const buffer = fs.readFileSync(filename);
            const newMessage = await bot.api.sendPhoto({
                chat_id: settings.adminGroup,
                photo: utils.bufferAsInputFile(buffer, `submission_${chatId}.jpg`),
                caption: `${submission.caption || ""}\n${watermark}\n@nerdsbayPhoto`,
            });
            await collections.queue.insertOne({
                user: chatId,
                fileId: newMessage.photo[0].file_unique_id,
                msgId: submission.replyToMsgId,
            });
            const recordedUser = await collections.users.findOne({ id: chatId });
            if (!recordedUser) {
                await collections.users.insertOne({
                    id: chatId,
                    handle: submission.from.username,
                    photos: 1,
                    approved: 0,
                    rejected: 0,
                });
            }
            else {
                await collections.users.updateOne({ id: chatId }, { $inc: { photos: 1 } });
            }
        }
        catch (e) {
            console.log("forward failed: ", e);
        }
    };
    const flushMediaGroup = async (groupId) => {
        const group = mediaGroups.get(groupId);
        if (!group)
            return;
        mediaGroups.delete(groupId);
        try {
            await handlePhotoSubmission({
                chatId: group.chatId,
                from: group.from,
                replyToMsgId: group.firstMsgId,
                caption: group.caption,
                isContest: group.caption === CONTEST_TAG,
                fileIds: group.fileIds,
            });
        }
        catch (err) {
            console.error(`media group ${groupId} flush failed:`, err);
        }
    };
    // ---- generic message handler: routes photo / video / plain text ----
    bot.on("message", async (ctx) => {
        const msg = ctx.message;
        if (!msg)
            return;
        // photo
        if (msg.photo) {
            if (utils.isInAdminGroup(msg))
                return;
            if (!msg.from)
                return;
            const largest = msg.photo[msg.photo.length - 1];
            // Album: buffer by media_group_id and debounce a flush.
            if (msg.media_group_id) {
                const groupId = msg.media_group_id;
                const existing = mediaGroups.get(groupId);
                if (existing) {
                    existing.fileIds.push(largest.file_id);
                    if (msg.caption && !existing.caption)
                        existing.caption = msg.caption;
                    clearTimeout(existing.timer);
                    existing.timer = setTimeout(() => flushMediaGroup(groupId), MEDIA_GROUP_DEBOUNCE_MS);
                }
                else {
                    mediaGroups.set(groupId, {
                        chatId: msg.chat.id,
                        from: msg.from,
                        firstMsgId: msg.message_id,
                        caption: msg.caption,
                        fileIds: [largest.file_id],
                        timer: setTimeout(() => flushMediaGroup(groupId), MEDIA_GROUP_DEBOUNCE_MS),
                    });
                }
                return;
            }
            // Single photo.
            await handlePhotoSubmission({
                chatId: msg.chat.id,
                from: msg.from,
                replyToMsgId: msg.message_id,
                caption: msg.caption,
                isContest: msg.caption === CONTEST_TAG,
                fileIds: [largest.file_id],
            });
            return;
        }
        // video
        if (msg.video) {
            if (utils.isInAdminGroup(msg))
                return;
            const collections = await getCollections();
            const chatId = msg.chat.id;
            await ctx.api.sendMessage({
                chat_id: chatId,
                text: `The video has been sent for approval`,
                reply_parameters: { message_id: msg.message_id },
            });
            await collections.queue.insertOne({
                user: chatId,
                fileId: msg.video.file_unique_id,
                msgId: msg.message_id,
            });
            try {
                await ctx.api.forwardMessage({
                    chat_id: settings.adminGroup,
                    from_chat_id: msg.chat.id,
                    message_id: msg.message_id,
                });
            }
            catch (e) {
                console.log("forward failed: ", e);
            }
            return;
        }
        // plain text — forward non-admin messages to the admin group.
        // Note: v2 `hears` terminates the middleware chain on match, so this
        // branch only fires for text that didn't match any `hears` regex above.
        if (msg.text) {
            os.cpuUsage((v) => console.log(">> CPU Usage (%): " + v));
            if (utils.isInAdminGroup(msg))
                return;
            const text = `User ${msg.from?.first_name || msg.from?.username} (@${msg.from?.username || msg.from?.id}) sent a message:\n${msg.text}`;
            await ctx.api.sendMessage({ chat_id: settings.adminGroup, text });
            os.cpuUsage((v) => console.log("<<CPU Usage (%): " + v));
        }
    });
};
//# sourceMappingURL=events.js.map