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

function formatPreviewBody(value) {
  const paragraphs = String(value || "")
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (!paragraphs.length) return "";
  return `
    <section class="report-preview-notes">
      <h4>Report notes</h4>
      ${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\r?\n/g, "<br />")}</p>`).join("")}
    </section>
  `;
}

function renderReportPreview() {
  const testName = testNameInput.value.trim() || "New laboratory test";
  const sampleType = testSampleTypeInput.value.trim() || "Sample type not set";
  const category = testCategoryInput.value.trim() || "General";
  const parameters = readParameters();
  const parameterRowsMarkup = parameters.length
    ? parameters.map((parameter) => `
        <tr>
          <td>${escapeHtml(parameter.parameterName)}</td>
          <td>${parameter.entryMode === "calculated" ? "Auto-calculated" : "Sample result"}</td>
          <td>${escapeHtml(parameter.normalRange || "-")}</td>
          <td>${escapeHtml(parameter.unit || "-")}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="4" class="report-preview-empty">Add one or more result fields to preview them here.</td></tr>`;

  reportPreview.innerHTML = `
    <div class="report-preview-patient">
      <div><strong>Sample Patient</strong><span>Age: 30 years | Sex: Female</span></div>
      <div><span>Sample report</span><span>Registered: Today</span></div>
    </div>
    <h3>${escapeHtml(testName)}</h3>
    <div class="report-preview-meta"><span>${escapeHtml(category)}</span><span>Sample: ${escapeHtml(sampleType)}</span></div>
    <table>
      <thead><tr><th>Investigation</th><th>Result</th><th>Reference value</th><th>Unit</th></tr></thead>
      <tbody>${parameterRowsMarkup}</tbody>
    </table>
    ${formatPreviewBody(testReportBodyInput.value)}
    <div class="report-preview-footer">Preview only - values are not stored until the test is saved.</div>
  `;
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
      const parameterSummary = (test.parameters || [])
        .map((parameter) => `${escapeHtml(parameter.parameter_name)}${parameter.unit ? ` (${escapeHtml(parameter.unit)})` : ""}${parameter.normal_range ? ` - ${escapeHtml(parameter.normal_range)}` : ""}${parameter.entry_mode === "calculated" ? " - auto-calculated" : ""}`)
        .join(", ");
      return `
        <div class="list-item catalog-test-item">
          <div class="catalog-test-main">
            <strong>${escapeHtml(test.name)}</strong>
            <span>${escapeHtml(test.code || "No code")} | ${escapeHtml(test.category || "General")} | ${escapeHtml(test.sample_type || "Sample type not set")}</span>
            <span>Price: ${currency(test.price)} | ${escapeHtml(test.turnaround_hours || 24)} hrs</span>
            <span>${parameterSummary || "No result fields added"}</span>
            ${test.report_body ? `<span class="catalog-report-text-badge">Custom report text included</span>` : ""}
          </div>
          <div class="actions-row">
            ${isAdmin ? `<button class="secondary-btn" data-preview-test="${test.id}" type="button">Printable preview</button>` : ""}
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
  previewTestBtn.addEventListener("click", renderReportPreview);
  addParameterBtn.addEventListener("click", () => {
    createParameterRow();
    renderReportPreview();
  });
  setParameterRows();
  renderReportPreview();
  loadTests();
}

init();
