const currentUser = protectPage(["admin", "receptionist"]);
if (!currentUser) {
  throw new Error("User must be authenticated to access test catalog.");
}

if (currentUser.role === "receptionist" && !hasPermission("manage_tests")) {
  alert("You do not have permission to manage tests.");
  window.location.href = getRoleHome(currentUser.role);
}

const testCatalogForm = document.getElementById("testCatalogForm");
const editingTestIdInput = document.getElementById("editingTestId");
const testNameInput = document.getElementById("testName");
const testCodeInput = document.getElementById("testCode");
const testCategoryInput = document.getElementById("testCategory");
const testSampleTypeInput = document.getElementById("testSampleType");
const testPriceInput = document.getElementById("testPrice");
const turnaroundHoursInput = document.getElementById("testTurnaroundHours");
const testReportBodyInput = document.getElementById("testReportBody");
const parameterRows = document.getElementById("parameterRows");
const addParameterBtn = document.getElementById("addParameterBtn");
const saveTestBtn = document.getElementById("saveTestBtn");
const resetTestBtn = document.getElementById("resetTestBtn");
const previewTestBtn = document.getElementById("previewTestBtn");
const testList = document.getElementById("testList");
const reportPreview = document.getElementById("reportPreview");
const reportPreviewViewport = document.getElementById("reportPreviewViewport");
const reportPreviewStatus = document.getElementById("reportPreviewStatus");
const backToOriginBtn = document.getElementById("backToOriginBtn");

const A4_PREVIEW_WIDTH_PX = 794;
const A4_PREVIEW_HEIGHT_PX = 1123;
let previewRequestId = 0;
let previewRenderTimer;
let previewAbortController;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setFormMessage(message, isError = false) {
  const element = document.getElementById("testMessage");
  if (!element) return;
  element.textContent = message;
  element.style.color = isError ? "#b91c1c" : "#115e59";
}

function setPreviewStatus(message, isError = false) {
  if (!reportPreviewStatus) return;
  reportPreviewStatus.textContent = message;
  reportPreviewStatus.style.color = isError ? "#b91c1c" : "#53716a";
}

function getSafeReturnTarget(value) {
  if (!value) return "";

  try {
    const target = new URL(value, window.location.origin);
    if (target.origin !== window.location.origin || target.pathname === window.location.pathname) return "";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch (_error) {
    return "";
  }
}

function returnToOrigin() {
  const requestedReturnTarget = getSafeReturnTarget(new URLSearchParams(window.location.search).get("returnTo"));
  const referrerReturnTarget = getSafeReturnTarget(document.referrer);
  window.location.href = requestedReturnTarget || referrerReturnTarget || "reception.html";
}

function getParameterRows() {
  return Array.from(parameterRows.querySelectorAll(".parameter-builder-row"));
}

function readParameters() {
  return getParameterRows()
    .map((row) => {
      const entryMode = row.querySelector(".parameter-entry-mode").value === "calculated"
        ? "calculated"
        : "manual";
      return {
        parameterName: row.querySelector(".parameter-name").value.trim(),
        unit: row.querySelector(".parameter-unit").value.trim(),
        normalRange: row.querySelector(".parameter-range").value.trim(),
        entryMode,
        calculationFormula: entryMode === "calculated"
          ? row.querySelector(".parameter-formula").value.trim()
          : "",
        calculationPrecision: entryMode === "calculated"
          ? row.querySelector(".parameter-precision").value.trim() || "2"
          : "2",
      };
    })
    .filter((parameter) => parameter.parameterName);
}

function updateParameterRowVisibility(row) {
  const calculated = row.querySelector(".parameter-entry-mode").value === "calculated";
  row.querySelector(".parameter-calculation-fields").hidden = !calculated;
}

function createParameterRow(parameter = {}) {
  const row = document.createElement("article");
  row.className = "parameter-builder-row";
  row.innerHTML = `
    <div class="parameter-row-topline">
      <strong>Result field</strong>
      <button class="parameter-remove-btn" type="button" aria-label="Remove parameter">Remove</button>
    </div>
    <div class="parameter-row-grid">
      <label class="field parameter-name-field">
        <span>Parameter name *</span>
        <input class="parameter-name" placeholder="e.g. Calcium" />
      </label>
      <label class="field">
        <span>Unit</span>
        <input class="parameter-unit" placeholder="e.g. mg/dL" />
      </label>
      <label class="field">
        <span>Reference range</span>
        <input class="parameter-range" placeholder="e.g. 8.6 - 10.2" />
      </label>
      <label class="field">
        <span>Entry type</span>
        <select class="parameter-entry-mode">
          <option value="manual">Manual result</option>
          <option value="calculated">Calculated result</option>
        </select>
      </label>
    </div>
    <div class="parameter-calculation-fields" hidden>
      <label class="field">
        <span>Calculation formula</span>
        <input class="parameter-formula" placeholder="e.g. {Bilirubin Total} - {Bilirubin Direct}" />
      </label>
      <label class="field parameter-precision-field">
        <span>Decimal places</span>
        <input class="parameter-precision" type="number" min="0" max="6" value="2" />
      </label>
    </div>
  `;

  row.querySelector(".parameter-name").value = parameter.parameterName || parameter.parameter_name || "";
  row.querySelector(".parameter-unit").value = parameter.unit || "";
  row.querySelector(".parameter-range").value = parameter.normalRange || parameter.normal_range || "";
  row.querySelector(".parameter-entry-mode").value = (parameter.entryMode || parameter.entry_mode) === "calculated"
    ? "calculated"
    : "manual";
  row.querySelector(".parameter-formula").value = parameter.calculationFormula || parameter.calculation_formula || "";
  row.querySelector(".parameter-precision").value = parameter.calculationPrecision ?? parameter.calculation_precision ?? 2;

  row.querySelector(".parameter-entry-mode").addEventListener("change", () => {
    updateParameterRowVisibility(row);
    renderReportPreview();
  });
  row.querySelector(".parameter-remove-btn").addEventListener("click", () => {
    row.remove();
    renderReportPreview();
  });
  row.addEventListener("input", renderReportPreview);

  updateParameterRowVisibility(row);
  parameterRows.appendChild(row);
}

function setParameterRows(parameters = []) {
  parameterRows.innerHTML = "";
  const values = parameters.length ? parameters : [{}];
  values.forEach(createParameterRow);
}

function resizeReportPreview() {
  if (!reportPreview || !reportPreviewViewport) return;

  const previewFrame = reportPreviewViewport.parentElement;
  const frameStyle = previewFrame ? window.getComputedStyle(previewFrame) : null;
  const framePadding = frameStyle
    ? Number.parseFloat(frameStyle.paddingLeft) + Number.parseFloat(frameStyle.paddingRight)
    : 0;
  const availableWidth = Math.max(
    1,
    (previewFrame?.clientWidth || A4_PREVIEW_WIDTH_PX) - framePadding
  );
  const scale = Math.min(1, Math.max(0.25, availableWidth / A4_PREVIEW_WIDTH_PX));
  reportPreviewViewport.style.width = `${Math.round(A4_PREVIEW_WIDTH_PX * scale)}px`;
  reportPreviewViewport.style.height = `${Math.round(A4_PREVIEW_HEIGHT_PX * scale)}px`;
  reportPreview.style.transform = `scale(${scale})`;
}

function getPreviewPayload() {
  return {
    name: testNameInput.value.trim(),
    code: testCodeInput.value.trim(),
    category: testCategoryInput.value.trim(),
    sampleType: testSampleTypeInput.value.trim(),
    turnaroundHours: Number(turnaroundHoursInput.value || 24),
    parameters: readParameters(),
    reportBody: testReportBodyInput.value.trim(),
  };
}

async function loadReportPreview() {
  if (!reportPreview) return;

  const requestId = previewRequestId;
  const controller = new AbortController();
  previewAbortController = controller;
  setPreviewStatus("Updating live preview…");

  try {
    const html = await API.request("/api/tests/builder-report-preview", {
      method: "POST",
      body: JSON.stringify(getPreviewPayload()),
      signal: controller.signal,
    });
    if (requestId !== previewRequestId) return;

    reportPreview.srcdoc = html;
    resizeReportPreview();
    setPreviewStatus("Live preview is up to date.");
  } catch (error) {
    if (requestId !== previewRequestId) return;
    reportPreview.srcdoc = `<!doctype html><html><body style="margin:0;padding:36px;font:16px Arial;color:#991b1b;background:#fff7f7">Unable to load the generated report preview: ${escapeHtml(error.message)}</body></html>`;
    resizeReportPreview();
    setPreviewStatus("Unable to update the live preview.", true);
  } finally {
    if (previewAbortController === controller) previewAbortController = null;
  }
}

function renderReportPreview({ immediate = false } = {}) {
  previewRequestId += 1;
  previewAbortController?.abort();
  if (previewRenderTimer) clearTimeout(previewRenderTimer);
  previewRenderTimer = null;
  const billingOnly = ReportEligibility.isBillingOnlyTest(getPreviewPayload());
  document.getElementById('billingOnlyNotice').hidden = !billingOnly;
  for (const id of ['reportParameterSection', 'reportBodySection', 'reportPreviewPanel']) {
    document.getElementById(id).hidden = billingOnly;
  }
  previewTestBtn.hidden = billingOnly;
  if (billingOnly) {
    reportPreview.srcdoc = '';
    setPreviewStatus(ReportEligibility.BILLING_ONLY_MESSAGE);
    return;
  }
  if (immediate) {
    void loadReportPreview();
    return;
  }

  previewRenderTimer = setTimeout(() => {
    previewRenderTimer = null;
    void loadReportPreview();
  }, 180);
}

function resetForm() {
  testCatalogForm.reset();
  editingTestIdInput.value = "";
  saveTestBtn.textContent = "Save test";
  setParameterRows();
  setFormMessage("");
  renderReportPreview();
}

function populateForm(test) {
  editingTestIdInput.value = test.id;
  testNameInput.value = test.name || "";
  testCodeInput.value = test.code || "";
  testCategoryInput.value = test.category || "";
  testSampleTypeInput.value = test.sample_type || "";
  testPriceInput.value = test.price || 0;
  turnaroundHoursInput.value = test.turnaround_hours || 24;
  testReportBodyInput.value = test.report_body || "";
  setParameterRows(test.parameters || []);
  saveTestBtn.textContent = "Update test";
  setFormMessage(`Editing ${test.name}`);
  renderReportPreview();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderTests(tests) {
  if (!tests.length) {
    testList.innerHTML = `<div class="empty-state">No tests found.</div>`;
    return;
  }

  const isAdmin = isAdministrativeRole();
  testList.innerHTML = tests
    .map((test) => {
      const billingOnly = ReportEligibility.isBillingOnlyTest(test);
      const parameterSummary = (test.parameters || [])
        .map((parameter) => `${escapeHtml(parameter.parameter_name)}${parameter.unit ? ` (${escapeHtml(parameter.unit)})` : ""}${parameter.normal_range ? ` - ${escapeHtml(parameter.normal_range)}` : ""}${parameter.entry_mode === "calculated" ? " - auto-calculated" : ""}`)
        .join(", ");
      return `
        <div class="list-item catalog-test-item">
          <div class="catalog-test-main">
            <strong>${escapeHtml(test.name)}</strong>
            <span>${escapeHtml(test.code || "No code")} | ${escapeHtml(test.category || "General")} | ${escapeHtml(test.sample_type || "Sample type not set")}</span>
            <span>Price: ${currency(test.price)} | ${escapeHtml(test.turnaround_hours || 24)} hrs</span>
            <span>${billingOnly ? 'Billing only - no report format required' : parameterSummary || "No result fields added"}</span>
            ${!billingOnly && test.report_body ? `<span class="catalog-report-text-badge">Custom report text included</span>` : ""}
          </div>
          <div class="actions-row">
            ${isAdmin && !billingOnly ? `<button class="secondary-btn" data-preview-test="${test.id}" type="button">Printable preview</button>` : ""}
            <button class="secondary-btn" data-edit-test="${test.id}" type="button">Edit</button>
            <button class="danger-btn" data-delete-test="${test.id}" type="button">Delete</button>
          </div>
        </div>
      `;
    })
    .join("");

  testList.querySelectorAll("[data-edit-test]").forEach((button) => {
    button.addEventListener("click", () => {
      const test = window.catalogTests?.find((item) => item.id === Number(button.dataset.editTest));
      if (test) populateForm(test);
    });
  });

  testList.querySelectorAll("[data-preview-test]").forEach((button) => {
    button.addEventListener("click", () => {
      const token = localStorage.getItem("labToken");
      window.open(`/api/tests/${button.dataset.previewTest}/sample-report?token=${token}`, "_blank");
    });
  });

  testList.querySelectorAll("[data-delete-test]").forEach((button) => {
    button.addEventListener("click", async () => {
      const test = window.catalogTests?.find((item) => item.id === Number(button.dataset.deleteTest));
      if (!test || !confirm(`Permanently delete "${test.name}" from the test catalog? This cannot be undone.`)) return;

      try {
        await API.request(`/api/tests/${test.id}?_=${Date.now()}`, { method: "DELETE" });
        if (editingTestIdInput.value === String(test.id)) resetForm();
        setFormMessage(`Deleted ${test.name} from the catalog.`);
        await loadTests();
      } catch (error) {
        setFormMessage(error.message, true);
      }
    });
  });
}

async function loadTests() {
  try {
    const data = await API.request("/api/tests");
    window.catalogTests = data.tests || [];
    renderTests(window.catalogTests);
  } catch (error) {
    testList.innerHTML = `<div class="error">Unable to load tests: ${escapeHtml(error.message)}</div>`;
  }
}

async function submitTestForm(event) {
  event.preventDefault();

  if (!hasPermission("manage_tests")) {
    setFormMessage("You do not have permission to manage tests.", true);
    return;
  }

  const payload = {
    name: testNameInput.value.trim(),
    code: testCodeInput.value.trim(),
    category: testCategoryInput.value.trim(),
    sampleType: testSampleTypeInput.value.trim(),
    price: Number(testPriceInput.value || 0),
    turnaroundHours: Number(turnaroundHoursInput.value || 24),
    parameters: readParameters(),
    reportBody: testReportBodyInput.value.trim(),
  };

  if (!payload.name) {
    setFormMessage("Test name is required.", true);
    return;
  }

  try {
    let successMessage;
    if (editingTestIdInput.value) {
      await API.request(`/api/tests/${editingTestIdInput.value}`, {
        method: "PUT",
        body: JSON.stringify({ ...payload, active: true }),
      });
      successMessage = "Test updated successfully.";
    } else {
      await API.request("/api/tests", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      successMessage = "Test added successfully.";
    }
    resetForm();
    setFormMessage(successMessage);
    await loadTests();
  } catch (error) {
    setFormMessage(error.message, true);
  }
}

function init() {
  testCatalogForm.addEventListener("submit", submitTestForm);
  testCatalogForm.addEventListener("input", renderReportPreview);
  resetTestBtn.addEventListener("click", resetForm);
  backToOriginBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    returnToOrigin();
  });
  previewTestBtn.addEventListener("click", () => renderReportPreview({ immediate: true }));
  addParameterBtn.addEventListener("click", () => {
    createParameterRow();
    renderReportPreview();
  });
  setParameterRows();
  renderReportPreview({ immediate: true });
  window.addEventListener("resize", resizeReportPreview);
  loadTests();
}

init();
