protectPage(["blood_sample_technician", "usg_technician", "mri_technician", "ct_technician"]);

const receptionLink = document.getElementById("receptionLink");
if (hasPermission("manage_patients") || hasPermission("manage_billing")) {
  receptionLink.href = hasPermission("manage_patients")
    ? "reception.html#new-visit"
    : "reception.html#collection-delivery";
  receptionLink.textContent = hasPermission("manage_patients")
    ? "Patient Registration"
    : "Billing & Reports";
  receptionLink.hidden = false;
}

if (!hasPermission("enter_results")) {
  const assignmentsTab = document.querySelector('[data-tab="assignments"]');
  if (assignmentsTab) assignmentsTab.style.display = 'none';
}

let activeVisitId = null;
let activePatientVisitId = null;

const visitsContainer = document.getElementById("technicianVisits");
const visitDetails = document.getElementById("visitDetails");
const saveAllResultsBtn = document.getElementById("saveAllResultsBtn");
const finalizeBtn = document.getElementById("finalizeBtn");
const printBtn = document.getElementById("printBtn");
const viewReportBtn = document.getElementById("viewReportBtn");

const patientSearchInput = document.getElementById("patientSearchInput");
const patientSearchDateFrom = document.getElementById("patientSearchDateFrom");
const patientSearchDateTo = document.getElementById("patientSearchDateTo");
const patientSearchResults = document.getElementById("patientSearchResults");
const patientVisitDetails = document.getElementById("patientVisitDetails");
const patientSaveAllResultsBtn = document.getElementById("patientSaveAllResultsBtn");
const patientFinalizeBtn = document.getElementById("patientFinalizeBtn");
const patientPrintBtn = document.getElementById("patientPrintBtn");
const patientViewReportBtn = document.getElementById("patientViewReportBtn");

const tabButtons = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".technician-layout");

function switchTab(tabName) {
  tabButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tabName));
  tabContents.forEach(content => {
    content.hidden = content.id !== tabName;
  });
}

tabButtons.forEach(button => {
  button.addEventListener("click", () => switchTab(button.dataset.tab));
});

async function loadAssignedVisits(search = "") {
  const data = await API.request(`/api/visits?query=${encodeURIComponent(search)}`);
  
  const filteredVisits = data.visits
    .map(visit => {
      const testsArr = (visit.tests || "").split(", ");
      const pathTests = testsArr.filter(t => isPathologyTest(t, ""));
      return { ...visit, tests: pathTests.join(", "), pathCount: pathTests.length };
    })
    .filter(visit => visit.pathCount > 0);

  visitsContainer.innerHTML = filteredVisits
    .map(
      (visit) => `
        <button class="result-btn" data-visit-id="${visit.id}" type="button">
          <strong>${visit.bill_no} • ${visit.patient_name}</strong><br />
          <span>${visit.tests || "No pathology tests"} • ${visit.status}</span>
        </button>
      `
    )
    .join("");

  visitsContainer.querySelectorAll("[data-visit-id]").forEach((button) => {
    button.addEventListener("click", () => loadVisit(button.dataset.visitId));
  });
}

async function loadPatientVisits(search = "", dateFrom = "", dateTo = "") {
  let url = `/api/visits?all=1&query=${encodeURIComponent(search)}`;
  if (dateFrom) url += `&dateFrom=${encodeURIComponent(dateFrom)}`;
  if (dateTo) url += `&dateTo=${encodeURIComponent(dateTo)}`;

  const data = await API.request(url);

  const filteredVisits = data.visits
    .map(visit => {
      const testsArr = (visit.tests || "").split(", ");
      const pathTests = testsArr.filter(t => isPathologyTest(t, ""));
      return { ...visit, tests: pathTests.join(", "), pathCount: pathTests.length };
    })
    .filter(visit => visit.pathCount > 0);

  patientSearchResults.innerHTML = filteredVisits
    .map(
      (visit) => `
        <button class="result-btn" data-visit-id="${visit.id}" type="button">
          <strong>${visit.bill_no} • ${visit.patient_name}</strong><br />
          <span>${visit.tests || "No pathology tests"} • ${visit.status} • ${formatDate(visit.created_at)}</span>
        </button>
      `
    )
    .join("");

  patientSearchResults.querySelectorAll("[data-visit-id]").forEach((button) => {
    button.addEventListener("click", () => loadPatientVisit(button.dataset.visitId));
  });
}

async function saveResultForm(form) {
  const visitId = form.dataset.visitId || activeVisitId;
  const payload = {
    visitTestId: Number(form.dataset.visitTestId),
    parameters: Array.from(form.querySelectorAll("[data-parameter-row]")).map((row) => {
      const input = row.querySelector("input, textarea");
      return {
        parameter_name: row.dataset.parameterName,
        value: input ? input.value : "",
        unit: row.dataset.unit,
        normal_range: row.dataset.range,
      };
    }),
  };

  await API.request(`/api/visits/${visitId}/results`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function loadVisit(visitId) {
  activeVisitId = Number(visitId);
  const data = await API.request(`/api/visits/${visitId}`);
  const reportData = await API.request(`/api/visits/${visitId}/report`).catch(() => null);
  const user = getUser();

  const pathologyTests = data.tests.filter(t => isPathologyTest(t.name, t.category));

  if (pathologyTests.length === 0) {
    visitDetails.innerHTML = `<div class="empty-state">No pathology tests found.</div>`;
    return;
  }

  visitDetails.innerHTML = pathologyTests
    .map(
      (test) => `
        <form class="result-card" data-result-form data-visit-id="${visitId}" data-visit-test-id="${test.id}">
          <div>
            <strong>${test.name}</strong><br />
            <span>Status: ${test.status} • Technician: ${test.technician_name || "Unassigned"}</span>
          </div>
          ${test.status === "reported" ? `<div class="inline-note">Already included in finalized report.</div>` : ""}
          <div class="stack" id="parameters-${test.id}"></div>
          <button class="secondary-btn" type="submit" ${test.status === "reported" && !hasAccessControl("multiple_report_edit") ? "disabled" : ""}>Save results</button>
        </form>
      `
    )
    .join("");

  for (const test of pathologyTests) {
    const testCatalog = await API.request(`/api/tests?query=${encodeURIComponent(test.name)}`);
    const matched = testCatalog.tests.find((item) => item.test_id === test.test_id || item.name === test.name);
    const holder = document.getElementById(`parameters-${test.id}`);
    holder.innerHTML = (matched?.parameters || [])
      .map((parameter) => renderResultParameterField(parameter, test.results || []))
      .join("");

    attachParameterCalculations(holder);
  }

  visitDetails.querySelectorAll("[data-result-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await saveResultForm(form);
        showMessage("techMessage", "Results saved");
      } catch (error) {
        showMessage("techMessage", error.message, true);
      }
    });
  });

  if (!hasPermission("enter_results")) {
    visitDetails.querySelectorAll("button[type='submit']").forEach(btn => btn.disabled = true);
    saveAllResultsBtn.disabled = true;
  } else {
    saveAllResultsBtn.disabled = false;
  }

  if (user?.role === "blood_sample_technician") {
    finalizeBtn.style.display = "none";
  } else {
    finalizeBtn.style.display = "";
    finalizeBtn.disabled = false;
  }

  printBtn.disabled = !reportData?.report?.finalized;
  viewReportBtn.disabled = !reportData?.report;
}

async function loadPatientVisit(visitId) {
  activePatientVisitId = visitId;
  const data = await API.request(`/api/visits/${visitId}`);
  const reportData = await API.request(`/api/visits/${visitId}/report`).catch(() => null);
  const user = getUser();

  const pathologyTests = data.tests.filter(t => isPathologyTest(t.name, t.category));

  if (pathologyTests.length === 0) {
    patientVisitDetails.innerHTML = `<div class="empty-state">No pathology tests found.</div>`;
    return;
  }

  patientVisitDetails.innerHTML = pathologyTests
    .map(
      (test) => `
        <form class="result-card" data-result-form data-visit-id="${visitId}" data-visit-test-id="${test.id}">
          <div>
            <strong>${test.name}</strong><br />
            <span>Status: ${test.status} • Technician: ${test.technician_name || "Unassigned"}</span>
          </div>
          ${test.status === "reported" ? `<div class="inline-note">Already included in finalized report.</div>` : ""}
          <div class="stack" id="patient-parameters-${test.id}"></div>
          <button class="secondary-btn" type="submit" ${test.status === "reported" && !hasAccessControl("multiple_report_edit") ? "disabled" : ""}>Save results</button>
        </form>
      `
    )
    .join("");

  for (const test of pathologyTests) {
    const testCatalog = await API.request(`/api/tests?query=${encodeURIComponent(test.name)}`);
    const matched = testCatalog.tests.find((item) => item.test_id === test.test_id || item.name === test.name);
    const holder = document.getElementById(`patient-parameters-${test.id}`);
    holder.innerHTML = (matched?.parameters || [])
      .map((parameter) => renderResultParameterField(parameter, test.results || []))
      .join("");

    attachParameterCalculations(holder);
  }

  patientVisitDetails.querySelectorAll("[data-result-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await saveResultForm(form);
        showMessage("patientTechMessage", "Results saved");
      } catch (error) {
        showMessage("patientTechMessage", error.message, true);
      }
    });
  });

  if (!hasPermission("enter_results")) {
    patientVisitDetails.querySelectorAll("button[type='submit']").forEach(btn => btn.disabled = true);
    patientSaveAllResultsBtn.disabled = true;
  } else {
    patientSaveAllResultsBtn.disabled = false;
  }

  if (user?.role === "blood_sample_technician") {
    patientFinalizeBtn.style.display = "none";
  } else {
    patientFinalizeBtn.style.display = "";
    patientFinalizeBtn.disabled = false;
  }

  patientPrintBtn.disabled = !reportData?.report?.finalized;
  patientViewReportBtn.disabled = !reportData?.report;
}

document.getElementById("techVisitSearch").addEventListener("input", (event) => {
  loadAssignedVisits(event.target.value);
});

patientSearchInput.addEventListener("input", () => reloadPatientVisits());
patientSearchDateFrom.addEventListener("change", () => reloadPatientVisits());
patientSearchDateTo.addEventListener("change", () => reloadPatientVisits());

function reloadPatientVisits() {
  const search = patientSearchInput.value;
  const dateFrom = patientSearchDateFrom.value;
  const dateTo = patientSearchDateTo.value;
  loadPatientVisits(search, dateFrom, dateTo);
}

finalizeBtn.addEventListener("click", async () => {
  if (!activeVisitId) return;
  try {
    const data = await API.request(`/api/visits/${activeVisitId}/finalize-report`, { method: "POST" });
    printBtn.disabled = false;
    viewReportBtn.disabled = false;
    showMessage("techMessage", `Report finalized${data.doctorCreated ? ` • ${data.doctor.name} was added to Doctor Setup.` : ""}`);
    await loadAssignedVisits();
  } catch (error) {
    showMessage("techMessage", error.message, true);
  }
});

printBtn.addEventListener("click", async () => {
  if (!activeVisitId) return;
  try {
    await API.request(`/api/visits/${activeVisitId}/print`, { method: "POST" });
    openHtmlReport(activeVisitId, true);
    showMessage("techMessage", "Report opened for printing");
  } catch (error) {
    showMessage("techMessage", error.message, true);
  }
});

viewReportBtn.addEventListener("click", () => {
  if (activeVisitId) {
    openHtmlReport(activeVisitId);
  }
});

patientFinalizeBtn.addEventListener("click", async () => {
  if (!activePatientVisitId) return;
  try {
    const data = await API.request(`/api/visits/${activePatientVisitId}/finalize-report`, { method: "POST" });
    patientPrintBtn.disabled = false;
    patientViewReportBtn.disabled = false;
    showMessage("patientTechMessage", `Report finalized${data.doctorCreated ? ` • ${data.doctor.name} was added to Doctor Setup.` : ""}`);
    reloadPatientVisits();
  } catch (error) {
    showMessage("patientTechMessage", error.message, true);
  }
});

patientPrintBtn.addEventListener("click", async () => {
  if (!activePatientVisitId) return;
  try {
    await API.request(`/api/visits/${activePatientVisitId}/print`, { method: "POST" });
    openHtmlReport(activePatientVisitId, true);
    showMessage("patientTechMessage", "Report opened for printing");
  } catch (error) {
    showMessage("patientTechMessage", error.message, true);
  }
});

patientViewReportBtn.addEventListener("click", () => {
  if (activePatientVisitId) {
    openHtmlReport(activePatientVisitId);
  }
});

saveAllResultsBtn.addEventListener("click", async () => {
  if (!activeVisitId) return;
  saveAllResultsBtn.disabled = true;
  const originalText = saveAllResultsBtn.textContent;
  saveAllResultsBtn.textContent = "Saving...";
  try {
    const forms = Array.from(visitDetails.querySelectorAll("[data-result-form]"));
    for (const form of forms) {
      const submitBtn = form.querySelector("button[type='submit']");
      if (!submitBtn.disabled) {
        await saveResultForm(form);
      }
    }
    showMessage("techMessage", "All results saved successfully");
  } catch (error) {
    showMessage("techMessage", error.message, true);
  } finally {
    saveAllResultsBtn.disabled = false;
    saveAllResultsBtn.textContent = originalText;
  }
});

patientSaveAllResultsBtn.addEventListener("click", async () => {
  if (!activePatientVisitId) return;
  patientSaveAllResultsBtn.disabled = true;
  const originalText = patientSaveAllResultsBtn.textContent;
  patientSaveAllResultsBtn.textContent = "Saving...";
  try {
    const forms = Array.from(patientVisitDetails.querySelectorAll("[data-result-form]"));
    for (const form of forms) {
      const submitBtn = form.querySelector("button[type='submit']");
      if (!submitBtn.disabled) {
        await saveResultForm(form);
      }
    }
    showMessage("patientTechMessage", "All results saved successfully");
  } catch (error) {
    showMessage("patientTechMessage", error.message, true);
  } finally {
    patientSaveAllResultsBtn.disabled = false;
    patientSaveAllResultsBtn.textContent = originalText;
  }
});

function setDefaultDateRange() {
  const today = new Date();
  const oneMonthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  const fromDateString = oneMonthAgo.toISOString().split("T")[0];
  const toDateString = today.toISOString().split("T")[0];
  
  patientSearchDateFrom.value = fromDateString;
  patientSearchDateTo.value = toDateString;
}




(async function init() {
  setDefaultDateRange();
  switchTab("patient-search");
  await loadAssignedVisits();
  await reloadPatientVisits();
})();
