try {
  console.log("Resolving @prisma/client...");
  const path = require.resolve("@prisma/client");
  console.log("Found at:", path);
} catch (e) {
  console.error("Failed to resolve:", e.message);
}
