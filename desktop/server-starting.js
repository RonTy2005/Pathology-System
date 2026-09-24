const startupMessage = document.getElementById("connectionMessage");

function showServerStartupStatus(status) {
  if (startupMessage && status?.message) startupMessage.textContent = status.message;
}

window.labLmsConnection.getStatus().then(showServerStartupStatus).catch(() => {});
window.labLmsConnection.onStatusChanged(showServerStartupStatus);
