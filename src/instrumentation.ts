export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureSeed } = await import("./lib/seed");
    const { startScheduler } = await import("./lib/jobs");
    try {
      await ensureSeed();
    } catch (e) {
      console.error("[startup] seed error", e);
    }
    startScheduler();
  }
}
