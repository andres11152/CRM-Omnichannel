const fs = require("fs");
const Redis = require("ioredis");
const redis = new Redis(
  "rediss://red-d5tcv17gi27c73f4mlv0:BkoREMwe5LdKK9NExksIyvtuGaTb0w6c@oregon-keyvalue.render.com:6379",
);

async function main() {
  const storeRaw = await redis.get("wa:store:global_wa_store");
  if (!storeRaw) return;
  const store = JSON.parse(storeRaw);

  let msgs = store.messages["573242450628@s.whatsapp.net"] || [];

  let stats = {
    total: msgs.length,
    withStubType: 0,
    stubTypes: {},
    mediaTypes: {},
    hasDocument: 0,
  };

  msgs.forEach((msg) => {
    if (msg.messageStubType) {
      stats.withStubType++;
      stats.stubTypes[msg.messageStubType] =
        (stats.stubTypes[msg.messageStubType] || 0) + 1;
    }
    if (msg.message) {
      if (
        msg.message.documentMessage ||
        msg.message.documentWithCaptionMessage
      ) {
        stats.hasDocument++;
      }
      [
        "imageMessage",
        "videoMessage",
        "audioMessage",
        "documentMessage",
      ].forEach((t) => {
        if (msg.message[t]) {
          stats.mediaTypes[t] = (stats.mediaTypes[t] || 0) + 1;
        }
      });
    }
  });

  console.log("Memory Store Message Stats:", JSON.stringify(stats, null, 2));
  redis.disconnect();
}
main().catch(console.error);
