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
* `get_best_of_week` - gets 6, 4 or 2 best picks of the current week, makes them square, sends back. not fast as well.
* `show_fwd_queue` - outputs the state of queues.
* `show_chats_array` - forwards the messages that were neither approved nor rejected.

The queue is checked every half an hour.

Theme related commands, not really in use:
* `+theme THEME` - adds THEME to the array of themes.
* `+constraint CONSTRAINT` - adds CONSTRAINT to the array of constraints.
* `generate_theme` - generates a random "theme constraint" pair.
* `set` - should be a response message to the generated theme, sets the current theme.
* `get_current` - gets the current theme.
