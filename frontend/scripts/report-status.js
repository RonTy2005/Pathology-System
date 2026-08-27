const portalToken = new URLSearchParams(window.location.search).get("token") || "";
const portalIntro = document.getElementById("portalIntro");
const reportCard = document.getElementById("reportCard");
const patientName = document.getElementById("patientName");
const billDetails = document.getElementById("billDetails");
const statusPill = document.getElementById("statusPill");
const statusMessage = document.getElementById("statusMessage");
const availableReports = document.getElementById("availableReports");
const refreshStatusBtn = document.getElementById("refreshStatusBtn");
const portalMessage = document.getElementById("portalMessage");

function showPortalMessage(message, isError = false) {
  portalMessage.textContent = message;
  portalMessage.classList.toggle("error", isError);
}

function formatRegisteredDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function setStatusStyle(isReady) {
  statusPill.style.background = isReady ? "#0f766e" : "#b45309";
  statusPill.style.color = "#fff";
  statusPill.textContent = isReady ? "REPORT READY" : "IN PROGRESS";
}

function renderAvailableReports(reports) {
  availableReports.innerHTML = "";
  const readyReports = Array.isArray(reports) ? reports : [];
  availableReports.hidden = readyReports.length === 0;

  readyReports.forEach((report, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = index === 0 ? "primary-btn" : "secondary-btn";
    button.textContent = `View ${report.label || "report"}`;
    button.addEventListener("click", () => {
      window.location.href = report.url;
    });
    availableReports.appendChild(button);
  });
}

async function loadReportStatus() {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(portalToken)) {
    portalIntro.textContent = "This report link is invalid.";
    showPortalMessage("Please scan the QR code on your bill again.", true);
    return;
  }

  refreshStatusBtn.disabled = true;
  showPortalMessage("");
  try {
    const response = await fetch(`/api/patient-reports/${encodeURIComponent(portalToken)}/status`, {
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Unable to check report status.");

    portalIntro.textContent = data.message;
    patientName.textContent = data.patientName || "Patient";
    billDetails.textContent = `Bill ${data.billNo || ""}${data.registeredAt ? ` • Registered ${formatRegisteredDate(data.registeredAt)}` : ""}`;
    statusMessage.textContent = data.message;
    setStatusStyle(Boolean(data.reportAvailable));
    renderAvailableReports(data.reportAvailable ? data.reports : []);
    reportCard.hidden = false;
  } catch (error) {
    portalIntro.textContent = "We could not open this report link.";
    showPortalMessage(error.message, true);
    reportCard.hidden = true;
  } finally {
    refreshStatusBtn.disabled = false;
  }
}

refreshStatusBtn.addEventListener("click", loadReportStatus);

fetch("/api/settings/branding")
  .then((response) => response.ok ? response.json() : null)
  .then((settings) => {
    if (settings?.businessName) document.getElementById("facilityName").textContent = settings.businessName;
  })
  .catch(() => {});

loadReportStatus();
