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
const testParametersInput = document.getElementById("testParameters");
const saveTestBtn = document.getElementById("saveTestBtn");
const resetTestBtn = document.getElementById("resetTestBtn");
const testList = document.getElementById("testList");
const testImportFile = document.getElementById("testImportFile");
const importTestsBtn = document.getElementById("importTestsBtn");

function parseParameterText(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [parameterName, unit, normalRange] = line.split("|");
      return {
        parameterName: parameterName?.trim(),
        unit: unit?.trim() || "",
        normalRange: normalRange?.trim() || "",
      };
    })
    .filter((item) => item.parameterName);
}

function setFormMessage(message, isError = false) {
  const element = document.getElementById("testMessage");
  if (!element) return;
  element.textContent = message;
  element.style.color = isError ? "#b91c1c" : "#115e59";
}

function setImportMessage(message, isError = false) {
  const element = document.getElementById("importTestMessage");
  if (!element) return;
  element.textContent = message;
  element.style.color = isError ? "#b91c1c" : "#115e59";
}

function resetForm() {
  testCatalogForm.reset();
  editingTestIdInput.value = "";
  saveTestBtn.textContent = "Add test";
  setFormMessage("");
}

function renderTests(tests) {
  if (!tests.length) {
    testList.innerHTML = `<div class="empty-state">No tests found.</div>`;
    return;
  }

  const isAdmin = (getUser()?.role || "").toLowerCase() === "admin";
  testList.innerHTML = tests
    .map((test) => {
      const parameterSummary = (test.parameters || [])
        .map((parameter) => `${parameter.parameter_name}${parameter.unit ? ` (${parameter.unit})` : ""}${parameter.normal_range ? ` - ${parameter.normal_range}` : ""}`)
        .join(", ");
      return `
        <div class="list-item">
          <strong>${test.name}</strong><br />
          <span>${test.code || "No code"} • ${test.category || "General"} • ${test.sample_type || "Sample type not set"}</span><br />
          <span>Price: ${currency(test.price)} • ${test.turnaround_hours || 24} hrs</span><br />
          <span>${parameterSummary || "No parameter details added"}</span>
          <div class="actions-row">
            ${isAdmin ? `<button class="secondary-btn" data-preview-test="${test.id}" type="button">Preview Report</button>` : ""}
            <button class="secondary-btn" data-edit-test="${test.id}" type="button">Edit</button>
            <button class="danger-btn" data-delete-test="${test.id}" type="button">Delete</button>
          </div>
        </div>
      `;
    })
    .join("");

  testList.querySelectorAll("[data-edit-test]").forEach((button) => {
    button.addEventListener("click", () => {
      const testId = Number(button.dataset.editTest);
      const test = window.catalogTests?.find((item) => item.id === testId);
      if (!test) return;

      editingTestIdInput.value = test.id;
      testNameInput.value = test.name || "";
      testCodeInput.value = test.code || "";
      testCategoryInput.value = test.category || "";
      testSampleTypeInput.value = test.sample_type || "";
      testPriceInput.value = test.price || 0;
      turnaroundHoursInput.value = test.turnaround_hours || 24;
      testParametersInput.value = (test.parameters || [])
        .map((parameter) => `${parameter.parameter_name}|${parameter.unit || ""}|${parameter.normal_range || ""}`)
        .join("\n");
      saveTestBtn.textContent = "Update test";
      setFormMessage(`Editing ${test.name}`);
    });
  });

  testList.querySelectorAll("[data-preview-test]").forEach((button) => {
    button.addEventListener("click", () => {
      const testId = button.dataset.previewTest;
      const token = localStorage.getItem("labToken");
      window.open(`/api/tests/${testId}/sample-report?token=${token}`, "_blank");
    });
  });

  testList.querySelectorAll("[data-delete-test]").forEach((button) => {
    button.addEventListener("click", async () => {
      const testId = Number(button.dataset.deleteTest);
      const test = window.catalogTests?.find((item) => item.id === testId);
      if (!test) return;

      if (!confirm(`Permanently delete "${test.name}" from the test catalog? This cannot be undone.`)) {
        return;
      }

      try {
        await API.request(`/api/tests/${test.id}?_=${Date.now()}`, { method: "DELETE" });
        if (editingTestIdInput.value === String(test.id)) {
          resetForm();
        }
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
    testList.innerHTML = `<div class="error">Unable to load tests: ${error.message}</div>`;
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
    parameters: parseParameterText(testParametersInput.value),
  };

  if (!payload.name) {
    setFormMessage("Test name is required.", true);
    return;
  }

  try {
    if (editingTestIdInput.value) {
      await API.request(`/api/tests/${editingTestIdInput.value}`, {
        method: "PUT",
        body: JSON.stringify({ ...payload, active: true }),
      });
      setFormMessage("Test updated successfully.");
    } else {
      await API.request("/api/tests", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setFormMessage("Test added successfully.");
    }
    resetForm();
    await loadTests();
  } catch (error) {
    setFormMessage(error.message, true);
  }
}

async function importTests() {
  if (!hasPermission("manage_tests")) {
    setImportMessage("You do not have permission to import tests.", true);
    return;
  }

  const file = testImportFile.files?.[0];
  if (!file) {
    setImportMessage("Choose a JSON file to import.", true);
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const payload = Array.isArray(parsed) ? { tests: parsed } : parsed;
    if (!Array.isArray(payload.tests) || !payload.tests.length) {
      throw new Error("The import file must include a tests array.");
    }

    await API.request("/api/tests/import", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    setImportMessage("Test catalog imported successfully.");
    testImportFile.value = "";
    await loadTests();
  } catch (error) {
    setImportMessage(error.message, true);
  }
}

function resetCatalogForm() {
  resetForm();
  setImportMessage("");
}

async function init() {
  testCatalogForm.addEventListener("submit", submitTestForm);
  resetTestBtn.addEventListener("click", resetCatalogForm);
  importTestsBtn.addEventListener("click", importTests);
  await loadTests();
}

init();
