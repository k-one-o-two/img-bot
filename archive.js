bot.onText(/^#bestOf24$/i, (msg) => {
    bot.sendMessage(chatId, `Конкурс уже закончен и голосование закрыто`, {
      reply_to_message_id: msg.message_id,
    });

    return;

    // const entries = bestOf24Array.items;

    // const chatId = msg.chat.id;

    // if (msg.chat.type !== 'private') {
    //   bot.sendMessage(
    //     chatId,
    //     `Эта команда доступна только в личных сообщениях с ботом`,
    //     {
    //       reply_to_message_id: msg.message_id,
    //     },
    //   );

    //   return;
    // }

    // const now = new Date();

    // if (now < voteStartDate) {
    //   bot.sendMessage(
    //     chatId,
    //     `Подождите, голосование начнется ${voteStartDate.toLocaleDateString(
    //       'ru',
    //     )} ${voteStartDate.toLocaleTimeString('ru')}`,
    //     {
    //       reply_to_message_id: msg.message_id,
    //     },
    //   );

    //   return;
    // }

    // bot.sendMessage(
    //   chatId,
    //   `Сейчас я отправлю присланные на конкурс фотографии в случайном порядке.`,
    //   {
    //     reply_to_message_id: msg.message_id,
    //   },
    // );

    // const sorted = entries.sort(() => Math.random() - 0.5); // random sort

    // let i = 0;
    // const id = setInterval(function () {
    //   if (i >= sorted.length) {
    //     clearInterval(id);
    //     return;
    //   }

    //   const entry = sorted[i];
    //   const buffer = fs.readFileSync(`./24/${entry.file}`);

    //   bot.sendPhoto(chatId, buffer, {
    //     caption: `#${entry.cid}`,
    //   });
    //   i++;
    // }, 1000);

    // if (userHasVoted(msg)) {
    //   bot.sendMessage(chatId, `Твой голос уже записан`, {
    //     reply_to_message_id: msg.message_id,
    //   });
    // } else {
    //   bot.sendMessage(
    //     chatId,
    //     `Чтобы отдать свой голос, ответь на сообщение с понравившейся фотографией текстом vote`,
    //     {
    //       reply_to_message_id: msg.message_id,
    //     },
    //   );
    // }
  });

  bot.onText(/^vote$/i, (msg) => {
    const chatId = msg.chat.id;

    bot.sendMessage(chatId, `Конкурс уже закончен и голосование закрыто`, {
      reply_to_message_id: msg.message_id,
    });

    return;

    // if (msg.chat.type !== 'private') {
    //   bot.sendMessage(
    //     chatId,
    //     `Эта команда доступна только в личных сообщениях с ботом`,
    //     {
    //       reply_to_message_id: msg.message_id,
    //     },
    //   );

    //   return;
    // }

    // const now = new Date();

    // if (now < voteStartDate) {
    //   bot.sendMessage(
    //     chatId,
    //     `Подождите, голосование начнется ${voteStartDate.toLocaleDateString(
    //       'ru',
    //     )} ${voteStartDate.toLocaleTimeString('ru')}`,
    //     {
    //       reply_to_message_id: msg.message_id,
    //     },
    //   );

    //   return;
    // }

    // if (userHasVoted(msg)) {
    //   bot.sendMessage(chatId, `Голосовать можно только один раз`, {
    //     reply_to_message_id: msg.message_id,
    //   });
    //   return;
    // }

    // const original = msg.reply_to_message;
    // const cid = Number(/(#\d+)/.exec(original.caption)[0].replace('#', ''));
    // const user = msg.from.id;

    // const itemToVote = bestOf24Array.get(cid);

    // if (!itemToVote) {
    //   return;
    // }

    // if (itemToVote.user === user) {
    //   bot.sendMessage(chatId, `Нельзя голосовать за свою фотографию`, {
    //     reply_to_message_id: msg.message_id,
    //   });

    //   return;
    // }

    // bestOf24Array.update(cid, {
    //   votes: Number(itemToVote.votes) + 1,
    // });
    // votedList.insert({
    //   user_id: user,
    // });

    // bot.sendMessage(chatId, `Спасибо, твой голос учтен`, {
    //   reply_to_message_id: msg.message_id,
    // });
  });

  bot.onText(/^get_winners$/i, (msg) => {
      console.log(new Date().toString(), ' BOT got message');
      const chatId = msg.chat.id;
      const isAdminGroupMessage = msg.chat.id.toString() === nerdsbayPhotoAdmins;
  
      if (!isAdminGroupMessage) {
        return;
      }
  
      const entries = bestOf24Array.items;
      const sorted = entries.sort((a, b) => b.votes - a.votes);
  
      let i = 0;
      const id = setInterval(function () {
        if (i >= sorted.length) {
          clearInterval(id);
          return;
        }
  
        const entry = sorted[i];
        const buffer = fs.readFileSync(`./24/${entry.file}`);
  
        bot.sendPhoto(chatId, buffer, {
          caption: entry.username
            ? `#${entry.cid} votes: ${entry.votes}, author: ${entry.first_name} (@${entry.username})`
            : `#${entry.cid} votes: ${entry.votes}, author: ${entry.first_name}`,
        });
        i++;
      }, 1000);
    });

     // contest section

    // if (msg.caption === '#24best') {
    //   // contest photo

    //   const now = new Date();

    //   if (now >= contestAcceptEnds) {
    //     bot.sendMessage(
    //       chatId,
    //       `Прием фотографий уже закончен закончен (${contestAcceptEnds.toLocaleDateString(
    //         'ru',
    //       )})`,
    //       {
    //         reply_to_message_id: msg.message_id,
    //       },
    //     );

    //     return;
    //   }

    //   console.log(new Date().toString(), ' BOT got photo for contest');

    //   const fileId = msg.photo[msg.photo.length - 1].file_id;
    //   const fileUniqueId = msg.photo[0].file_unique_id;

    //   const userContestEntry = bestOf24Array.where({ user: msg.from.id }).items;

    //   if (userContestEntry.length) {
    //     bot.sendMessage(
    //       chatId,
    //       `На конкурс можно отправить только одну фотографию`,
    //       {
    //         reply_to_message_id: msg.message_id,
    //       },
    //     );
    //   } else {
    //     getFileInfo(fileId).then((data) => {
    //       if (data.ok) {
    //         downloadFile(data.result.file_path, chatId).then(() => {
    //           bestOf24Array.insert({
    //             user: msg.from.id,
    //             first_name: msg.from.first_name,
    //             username: msg.from.username,
    //             msgId: msg.message_id,
    //             file: `${chatId}_${data.result.file_path.replaceAll('/', '_')}`,
    //             fileId: fileUniqueId,
    //             votes: 0,
    //           });
    //         });
    //       }
    //     });
    //     bot.sendMessage(chatId, `Я получил фотографию на конкурс, удачи!`, {
    //       reply_to_message_id: msg.message_id,
    //     });
    //   }
    // } else {