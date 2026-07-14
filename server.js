const { createApp } = require("./src/app");
const { initializeDatabase } = require("./src/db/init");

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  await initializeDatabase();
  const app = createApp();

  app.listen(PORT, () => {
    console.log(`Lab LMS running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start Lab LMS:", error);
  process.exit(1);
});
