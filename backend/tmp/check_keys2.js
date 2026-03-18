const fs = require("fs");
const Redis = require("ioredis");
const redis = new Redis(
  "rediss://red-d5tcv17gi27c73f4mlv0:BkoREMwe5LdKK9NExksIyvtuGaTb0w6c@oregon-keyvalue.render.com:6379",
);

async function main() {
  const storeRaw = await redis.get("wa:store:global_wa_store");
  if (!storeRaw) return;
  const store = JSON.parse(storeRaw);

  let allMsgKeys = new Set();

  for (const jid in store.messages) {
    for (const msg of store.messages[jid]) {
      if (msg.message) {
        Object.keys(msg.message).forEach((k) => allMsgKeys.add(k));
      }
    }
  }

  fs.writeFileSync("tmp/store_keys.txt", Array.from(allMsgKeys).join("\n"));

  redis.disconnect();
}
main().catch(console.error);
