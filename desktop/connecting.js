const message = document.querySelector("#connectionMessage");
const choices = document.querySelector("#serverChoices");
const retryButton = document.querySelector("#retryButton");
const manualButton = document.querySelector("#manualButton");
const manualForm = document.querySelector("#manualForm");
const serverUrlInput = document.querySelector("#serverUrl");
const manualMessage = document.querySelector("#manualMessage");

function renderStatus(status) {
  message.textContent = status.message || "Preparing LabShield…";
  retryButton.disabled = status.phase === "searching" || status.phase === "connecting";
  choices.replaceChildren();
  choices.hidden = !status.servers?.length;

  for (const serverUrl of status.servers || []) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `Use ${serverUrl}`;
    button.addEventListener("click", () => connectTo(serverUrl));
    choices.append(button);
  }
}

async function connectTo(serverUrl) {
  manualMessage.textContent = "Connecting…";
  try {
    await window.labLmsConnection.useServer(serverUrl);
  } catch (error) {
    manualMessage.textContent = error.message || "Unable to reach that server.";
  }
}

retryButton.addEventListener("click", () => window.labLmsConnection.retry());
manualButton.addEventListener("click", () => {
  manualForm.hidden = !manualForm.hidden;
  if (!manualForm.hidden) serverUrlInput.focus();
});
manualForm.addEventListener("submit", (event) => {
  event.preventDefault();
  connectTo(serverUrlInput.value);
});

window.labLmsConnection.getStatus().then(renderStatus);
window.labLmsConnection.onStatusChanged(renderStatus);
