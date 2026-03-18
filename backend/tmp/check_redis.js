const fs = require("fs");
// Let's read the redis memory store to see what it actually has for this phone number.
const Redis = require("ioredis");
const redis = new Redis(
  "rediss://red-d5tcv17gi27c73f4mlv0:BkoREMwe5LdKK9NExksIyvtuGaTb0w6c@oregon-keyvalue.render.com:6379",
);

async function main() {
  const storeRaw = await redis.get("wa:store:global_wa_store");
  if (!storeRaw) {
    console.log("No store found");
    return;
  }
  const store = JSON.parse(storeRaw);
  const msgs = store.messages["573242450628@s.whatsapp.net"];
  if (!msgs) {
    console.log("No messages for 573242450628");
    return;
  }

  console.log(`Total messages in store for this JID: ${msgs.length}`);
  // Print the newest 5 messages in store
  const sorted = msgs.sort(
    (a, b) => (b.messageTimestamp || 0) - (a.messageTimestamp || 0),
  );

  fs.writeFileSync(
    "tmp/store_newest.json",
    JSON.stringify(sorted.slice(0, 20), null, 2),
  );

  // Check media messages
  const mediaMsgs = sorted.filter(
    (m) =>
      m.message &&
      (m.message.documentMessage ||
        m.message.imageMessage ||
        m.message.audioMessage ||
        m.message.videoMessage),
  );
  console.log(`Media messages in store: ${mediaMsgs.length}`);
  if (mediaMsgs.length > 0) {
    fs.writeFileSync(
      "tmp/store_media.json",
      JSON.stringify(mediaMsgs.slice(0, 5), null, 2),
    );
  }

  redis.disconnect();
}
main().catch(console.error);
