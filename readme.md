**README**

What does this bot do:
When receiving a photo or a video, it forwards it to the admin group.
Depending on the command it does the following:

These must be send as a response to a message with a photo or video.
* `ok COMMENT` - puts the photo (or video) th the queue, sends the message to the author with the COMMENT in it.
* `later COMMENT` - the same, but puts in a different queue, that is only used on saturdays.
* `no COMMENT` - rejects the photo, sending the user a message with COMMENT.
* `forget` - silently removed the photo.

These may be sent freely
* `get_best_of_month` - gets bets (most liked) image of the previous month, makes a postcard out of it, sends back. this operation is not fast.
* `get_best_of_week` - gets 9, 6, 4 or 2 best picks of the current week, makes them square, sends back. not fast as well.
* `show_fwd_queue` - outputs the state of queues.
* `show_chats_array` - forwards the messages that were neither approved nor rejected.

The queue is checked every half an hour (see settings.js).

**SETUP**

You will need an `.env` file with the following variables:

* BOTID - your bot id
* TOKEN - your bot token
* ADMIN_GROUP_ID - id of the admin group
* PHOTO_CHANNEL - name or id of your target channel
* API_ID - app id for the telegram Api
* API_HASH - app hash for the telegram Api
* P_CODE - your phone code (example: +358)
* PHONE - your phone number **with** code
* PASS - your telegram password
