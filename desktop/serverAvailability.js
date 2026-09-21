function createServerAvailabilityGuard({
  appMode,
  powerSaveBlocker,
  logger = console,
} = {}) {
  let blockerId = null;

  function start() {
    if (appMode !== "server" || !powerSaveBlocker || blockerId !== null) {
      return blockerId;
    }

    try {
      blockerId = powerSaveBlocker.start("prevent-app-suspension");
      if (!powerSaveBlocker.isStarted(blockerId)) {
        logger.warn("LabShield Server could not confirm its sleep-prevention request.");
      }
      return blockerId;
    } catch (error) {
      blockerId = null;
      logger.warn("LabShield Server could not prevent automatic sleep:", error?.message || error);
      return null;
    }
  }

  function stop() {
    if (blockerId === null || !powerSaveBlocker) return false;
    const id = blockerId;
    blockerId = null;
    try {
      return powerSaveBlocker.stop(id);
    } catch (error) {
      logger.warn("LabShield Server could not release its sleep-prevention request:", error?.message || error);
      return false;
    }
  }

  return {
    start,
    stop,
    isActive: () => blockerId !== null && Boolean(powerSaveBlocker?.isStarted?.(blockerId)),
  };
}

module.exports = { createServerAvailabilityGuard };
