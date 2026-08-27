protectPage(["admin", "manager", "receptionist", "blood_sample_technician", "usg_technician", "mri_technician", "ct_technician"]);

const associateSelect = document.getElementById("associateSelectNew");
const editAssociateSelect = document.getElementById("editAssociateSelect");
let selectedDoctor = null;
let selectedTests = [];
let associates = [];

const doctorSearch = document.getElementById("doctorSearch");
const doctorResults = document.getElementById("doctorResults");
const selectedDoctorView = document.getElementById("selectedDoctor");
const testSearch = document.getElementById("testSearch");
const testResults = document.getElementById("testResults");
const selectedTestsView = document.getElementById("selectedTests");
const recentVisits = document.getElementById("recentVisits");
const generatedBillActions = document.getElementById("generatedBillActions");
const generatedBillNumber = document.getElementById("generatedBillNumber");
const selectedAssociateView = document.getElementById("selectedAssociate");
const sampleSourceInput = document.getElementById("sampleSource");
const openTestCatalogBtn = document.getElementById("openTestCatalogBtn");
let latestGeneratedVisitId = null;

const navLinks = Array.from(document.querySelectorAll(".sidebar-nav a"));
const patientSearch = document.getElementById("patientSearch");
const patientNameInput = document.getElementById("patientName");
const patientNameResults = document.getElementById("patientNameResults");
const newPatientBillingHistoryCard = document.getElementById("newPatientBillingHistoryCard");
const newPatientBillingHistory = document.getElementById("newPatientBillingHistory");
let newPatientHistoryTimer = null;

async function loadAssociates() {
  console.log("TOP LEVEL loadAssociates called");
  if (associateSelect) associateSelect.innerHTML = '<option value="">Loading Associates...</option>';
  try {
    const data = await API.request("/api/associates");
    if (data && Array.isArray(data.associates)) {
      associates = data.associates.filter(a => a.active);
      const optionsHtml = `<option value="">-- Choose Associate --</option>` + 
        associates.map(a => `<option value="${a.id}">${a.name} (${a.associate_code})</option>`).join("");
      if (associateSelect) associateSelect.innerHTML = optionsHtml;
      if (editAssociateSelect) editAssociateSelect.innerHTML = optionsHtml;
      console.log("TOP LEVEL associates loaded:", associates.length);
      renderSelectedAssociate();
    }
  } catch (e) {
    console.error("TOP LEVEL load failed", e);
  }
}
loadAssociates();
const patientPhoneInput = document.getElementById("patientPhone");
const patientAgeInput = document.getElementById("patientAge");
const patientGenderInput = document.getElementById("patientGender");
const patientSearchResults = document.getElementById("patientSearchResults");
const patientEditForm = document.getElementById("patientEditForm");
const editPatientName = document.getElementById("editPatientName");
const editPatientPhone = document.getElementById("editPatientPhone");
const editPatientAge = document.getElementById("editPatientAge");
const editPatientGender = document.getElementById("editPatientGender");
const patientEditMessage = document.getElementById("patientEditMessage");
const deleteSelectedPatientBtn = document.getElementById("deleteSelectedPatientBtn");
const editTestSearch = document.getElementById("editTestSearch");
const editTestResults = document.getElementById("editTestResults");
const editSelectedTestsView = document.getElementById("editSelectedTests");
let selectedPatient = null;
let editSelectedTests = [];
let editSelectedDoctor = null;
let editSelectedAssociateObj = null;

const editDoctorSearch = document.getElementById("editDoctorSearch");
const editDoctorResults = document.getElementById("editDoctorResults");
const editSampleSourceInput = document.getElementById("editSampleSourceInput");
const editAssociateSelection = document.getElementById("editAssociateSelection");
const editSelectedAssociateEl = document.getElementById("editSelectedAssociate");
let doctorSearchRequestId = 0;
let editDoctorSearchRequestId = 0;



function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function renderDoctorSuggestions(container, doctors, onSelect) {
  if (!doctors.length) {
    container.innerHTML = `<div class="autocomplete-empty">No matching doctor in database.</div>`;
    return;
  }

  container.innerHTML = doctors
    .map(
      (doctor) => `
        <button class="result-btn" data-doctor-id="${doctor.id}" type="button">
          <strong>${escapeHtml(doctor.name)}</strong><br />
          <span>${escapeHtml(doctor.specialization || "General")} - ${escapeHtml(doctor.phone || "No phone")}</span>
        </button>
      `
    )
    .join("");

  container.querySelectorAll("[data-doctor-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const doctor = doctors.find((item) => item.id === Number(button.dataset.doctorId));
      if (doctor) {
        onSelect(doctor);
        container.innerHTML = "";
      }
    });
  });
}

function getSelectedAssociate() {
  return associates.find((associate) => associate.id === Number(associateSelect.value)) || null;
}

function updateTotals() {
  const subtotal = selectedTests.reduce((sum, test) => sum + Number(test.price), 0);
  const discount = Number(document.getElementById("discount").value || 0);
  const paid = Number(document.getElementById("amountPaid").value || 0);
  const total = Math.max(0, subtotal - discount);
  const due = Math.max(0, total - paid);

  document.getElementById("subtotal").textContent = currency(subtotal);
  document.getElementById("total").textContent = currency(total);
  document.getElementById("due").textContent = currency(due);
}

function renderGeneratedBillActions() {
  const hasGeneratedBill = Boolean(latestGeneratedVisitId);
  generatedBillActions.hidden = !hasGeneratedBill;
  generatedBillNumber.textContent = hasGeneratedBill ? `Last bill: ${generatedBillNumber.dataset.billNo || ""}` : "";
}

function renderSelectedDoctor() {
  if (!selectedDoctor) {
    selectedDoctorView.className = "selection-card empty";
    selectedDoctorView.textContent = "No doctor selected";
    return;
  }

  selectedDoctorView.className = "selection-card";
  selectedDoctorView.innerHTML = `
    <div style="flex-grow: 1;">
      <strong>${escapeHtml(selectedDoctor.name)}</strong><br />
      <span>${escapeHtml(selectedDoctor.specialization || "General")} - ${escapeHtml(selectedDoctor.phone || "No phone")}</span>
    </div>
    <button class="ghost-btn" id="clearDoctorBtn" type="button" style="color: var(--danger); padding: 4px 8px;">✕ Clear</button>
  `;

  document.getElementById("clearDoctorBtn").addEventListener("click", () => {
    selectedDoctor = null;
    doctorSearch.value = "";
    renderSelectedDoctor();
  });
}

function renderSelectedAssociate() {
  const sampleSource = sampleSourceInput.value;
  const associate = getSelectedAssociate();
  selectedAssociateView.className = "selection-card";

  if (sampleSource === "lab") {
    selectedAssociateView.textContent = "Sample marked as direct at lab.";
    associateSelect.disabled = true;
    associateSelect.value = "";
    return;
  }

  associateSelect.disabled = false;
  selectedAssociateView.innerHTML = associate
    ? `<strong>${associate.name}</strong><br /><span>${associate.associate_code} • ${associate.associate_type} • ${associate.phone || "No phone"}</span>`
    : "Select the collector or associate who provided this sample.";
}

function renderSelectedTests() {
  if (!selectedTests.length) {
    selectedTestsView.innerHTML = `<div class="empty-state">No tests selected yet.</div>`;
    updateTotals();
    return;
  }

  selectedTestsView.innerHTML = selectedTests
    .map(
      (test) => {
        const uniqueId = test.id || test.tempId;
        return `
          <div class="test-chip" style="display: block;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <div style="flex-grow: 1;">
                <strong>${test.name}</strong><br />
                <span>${test.code || "CUSTOM"} • ${currency(test.price)}</span>
              </div>
              <button class="danger-btn" data-remove-test="${uniqueId}" type="button" title="Remove" style="padding: 6px 12px; font-size: 0.85rem;">Remove</button>
            </div>
            <div style="display: flex; align-items: center; gap: 12px; border-top: 1px dashed var(--line); padding-top: 8px; margin-top: 8px;">
              <label style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; cursor: pointer;">
                <input type="checkbox" data-outside-test="${uniqueId}" ${test.isOutside ? "checked" : ""} />
                <span>Outside Report</span>
              </label>
              <input 
                type="text" 
                placeholder="External Lab (e.g. Serum)" 
                data-lab-name="${uniqueId}" 
                value="${test.externalLabName || ""}" 
                style="flex-grow: 1; padding: 4px 8px; font-size: 0.8rem; border: 1px solid var(--line); border-radius: 4px; ${test.isOutside ? "" : "display: none;"}" 
              />
            </div>
          </div>
        `;
      }
    )
    .join("");

  selectedTestsView.querySelectorAll("[data-outside-test]").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const uniqueId = checkbox.dataset.outsideTest;
      const test = selectedTests.find(t => (t.id || t.tempId).toString() === uniqueId);
      if (test) {
        test.isOutside = e.target.checked;
        if (test.isOutside && !test.externalLabName) {
          test.externalLabName = "Serum";
        }
        renderSelectedTests();
      }
    });
  });

  selectedTestsView.querySelectorAll("[data-lab-name]").forEach((input) => {
    input.addEventListener("input", (e) => {
      const uniqueId = input.dataset.labName;
      const test = selectedTests.find(t => (t.id || t.tempId).toString() === uniqueId);
      if (test) {
        test.externalLabName = e.target.value;
      }
    });
  });

  selectedTestsView.querySelectorAll("[data-remove-test]").forEach((button) => {
    button.addEventListener("click", () => {
      const uniqueId = button.dataset.removeTest;
      selectedTests = selectedTests.filter((test) => (test.id || test.tempId).toString() !== uniqueId);
      renderSelectedTests();
    });
  });


  updateTotals();
}

function renderEditSelectedDoctor() {
  const container = document.getElementById("editSelectedDoctor");
  if (!editSelectedDoctor) {
    container.innerHTML = "No doctor selected";
    container.className = "selection-card empty";
    return;
  }

  container.className = "selection-card";
  container.innerHTML = `
    <strong>${escapeHtml(editSelectedDoctor.name)}</strong><br />
    <span>${escapeHtml(editSelectedDoctor.specialization || "General")} - ${escapeHtml(editSelectedDoctor.phone || "No phone")}</span>
    <button type="button" class="remove-btn" data-remove-edit-doctor>Remove</button>
  `;

  container.querySelector("[data-remove-edit-doctor]").addEventListener("click", () => {
    editSelectedDoctor = null;
    renderEditSelectedDoctor();
  });
}

async function searchEditDoctors(query) {
  const searchText = query.trim();

  if (editSelectedDoctor && editSelectedDoctor.name !== searchText) {
    editSelectedDoctor = null;
    renderEditSelectedDoctor();
  }

  if (!searchText) {
    editDoctorSearchRequestId += 1;
    editDoctorResults.innerHTML = "";
    return;
  }

  const requestId = ++editDoctorSearchRequestId;

  try {
    const data = await API.request(`/api/doctors/search?q=${encodeURIComponent(searchText)}`);
    if (requestId !== editDoctorSearchRequestId) return;

    renderDoctorSuggestions(editDoctorResults, data.doctors || [], (doctor) => {
      editSelectedDoctor = doctor;
      renderEditSelectedDoctor();
      editDoctorSearch.value = doctor.name;
    });
  } catch (error) {
    console.error("Error searching doctors:", error);
    if (requestId === editDoctorSearchRequestId) {
      editDoctorResults.innerHTML = `<div class="autocomplete-empty">Unable to search doctors.</div>`;
    }
  }
}

function renderEditSelectedAssociate() {
  if (editSampleSourceInput.value === "lab") {
    editAssociateSelection.hidden = true;
    editSelectedAssociateEl.hidden = true;
    editSelectedAssociateObj = null;
    return;
  }

  editAssociateSelection.hidden = false;
  editSelectedAssociateEl.hidden = false;

  if (!editSelectedAssociateObj) {
    editSelectedAssociateEl.innerHTML = "No associate selected";
    editSelectedAssociateEl.className = "selection-card empty";
    return;
  }

  editSelectedAssociateEl.className = "selection-card";
  editSelectedAssociateEl.innerHTML = `
    <strong>${editSelectedAssociateObj.name}</strong><br />
    <span>${editSelectedAssociateObj.associate_code} • ${editSelectedAssociateObj.associate_type}</span>
  `;
}

function getEditSelectedAssociate() {
  return editSelectedAssociateObj;
}

function renderEditSelectedTests() {
  if (!editSelectedTests.length) {
    editSelectedTestsView.innerHTML = `<div class="empty-state">No new tests selected yet.</div>`;
    updateEditTotals();
    return;
  }

  editSelectedTestsView.innerHTML = editSelectedTests
    .map(
      (test) => {
        const uniqueId = test.id || test.tempId;
        return `
          <div class="test-chip" style="display: block;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <div style="flex-grow: 1;">
                <strong>${test.name}</strong><br />
                <span>${test.code || "CUSTOM"} • ${currency(test.price)}</span>
              </div>
              <button class="danger-btn" data-remove-edit-test="${uniqueId}" type="button" title="Remove" style="padding: 6px 12px; font-size: 0.85rem;">Remove</button>
            </div>
            <div style="display: flex; align-items: center; gap: 12px; border-top: 1px dashed var(--line); padding-top: 8px; margin-top: 8px;">
              <label style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; cursor: pointer;">
                <input type="checkbox" data-edit-outside-test="${uniqueId}" ${test.isOutside ? "checked" : ""} />
                <span>Outside Report</span>
              </label>
              <input 
                type="text" 
                placeholder="External Lab" 
                data-edit-lab-name="${uniqueId}" 
                value="${test.externalLabName || ""}" 
                style="flex-grow: 1; padding: 4px 8px; font-size: 0.8rem; border: 1px solid var(--line); border-radius: 4px; ${test.isOutside ? "" : "display: none;"}" 
              />
            </div>
          </div>
        `;
      }
    )
    .join("");

  editSelectedTestsView.querySelectorAll("[data-edit-outside-test]").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const uniqueId = checkbox.dataset.editOutsideTest;
      const test = editSelectedTests.find(t => (t.id || t.tempId).toString() === uniqueId);
      if (test) {
        test.isOutside = e.target.checked;
        if (test.isOutside && !test.externalLabName) {
          test.externalLabName = "Serum";
        }
        renderEditSelectedTests();
      }
    });
  });

  editSelectedTestsView.querySelectorAll("[data-edit-lab-name]").forEach((input) => {
    input.addEventListener("input", (e) => {
      const uniqueId = input.dataset.editLabName;
      const test = editSelectedTests.find(t => (t.id || t.tempId).toString() === uniqueId);
      if (test) {
        test.externalLabName = e.target.value;
      }
    });
  });

  editSelectedTestsView.querySelectorAll("[data-remove-edit-test]").forEach((button) => {
    button.addEventListener("click", () => {
      const uniqueId = button.dataset.removeEditTest;
      editSelectedTests = editSelectedTests.filter((test) => (test.id || test.tempId).toString() !== uniqueId);
      renderEditSelectedTests();
    });
  });

  editSelectedTestsView.querySelectorAll("[data-remove-edit-test]").forEach((button) => {
    button.addEventListener("click", () => {
      editSelectedTests = editSelectedTests.filter((test) => test.id !== Number(button.dataset.removeEditTest));
      renderEditSelectedTests();
    });
  });

  updateEditTotals();
}

let activeEditVisitId = null;
let existingVisitTestsList = [];
let originalVisitTotal = null;

function renderExistingVisitTests(tests, visitId) {
  const container = document.getElementById("existingVisitTests");
  if (!container) return;

  if (!tests.length) {
    container.innerHTML = `<div class="empty-state">No tests on the latest visit yet.</div>`;
    return;
  }

  container.innerHTML = tests.map(t => `
    <div class="test-chip" data-existing-vt="${t.visit_test_id}">
      <div>
        <strong>${t.name}</strong><br />
        <span>${t.code || "NA"} • ${currency(t.price)}</span>
        ${t.is_outside ? `<div style="font-size: 0.78rem; color: var(--danger); font-weight: 600; margin-top: 2px;">Outside: ${escapeHtml(t.external_lab_name || "Yes")}</div>` : ""}
      </div>
      <button class="danger-btn" data-remove-existing-test="${t.visit_test_id}" type="button">Remove</button>
    </div>
  `).join("");

  container.querySelectorAll("[data-remove-existing-test]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Remove this test from the visit? The bill will be updated.")) return;
      try {
        const result = await API.request(
          `/api/visits/${visitId}/tests/${btn.dataset.removeExistingTest}`,
          { method: "DELETE" }
        );
        existingVisitTestsList = result.tests;
        renderExistingVisitTests(result.tests, visitId);
        // Sync paid amount from updated visit (handles overpayment cap)
        const paidEl = document.getElementById("editAmountPaid");
        if (paidEl) paidEl.value = result.visit.amount_paid || 0;
        updateEditTotals();
        showMessage("patientEditMessage", "Test removed. Bill updated.");
      } catch (error) {
        showMessage("patientEditMessage", error.message, true);
      }
    });
  });
}

function renderPatientHistory(visits) {
  const container = document.getElementById("patientVisitHistory");
  if (!container) return;

  if (!visits.length) {
    container.innerHTML = `<div class="empty-state">No previous visits found.</div>`;
    return;
  }

  container.innerHTML = visits.map(v => `
    <div class="result-card stack compact" style="background: rgba(255,255,255,0.4); border: 1px solid var(--line);">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong style="color: var(--primary);">${v.bill_no}</strong>
        <span style="font-size: 0.85rem; color: var(--muted);">${formatDate(v.created_at)}</span>
      </div>
      <div style="font-size: 0.9rem;">
        Tests: <span style="font-weight: 500;">${v.tests || "No tests"}</span>
      </div>
      <div style="font-size: 0.8rem; color: var(--muted); display: flex; justify-content: space-between;">
        <span>Ref: ${v.doctor_name || "Self"}</span>
        <span>Total: ${currency(v.total)} • Status: <strong style="text-transform: uppercase;">${v.status}</strong></span>
      </div>
    </div>
  `).join("");
}

function updateEditTotals() {
  const existingSubtotal = existingVisitTestsList.reduce((sum, t) => sum + Number(t.price), 0);
  const newSubtotal = editSelectedTests.reduce((sum, t) => sum + Number(t.price), 0);
  const subtotal = existingSubtotal + newSubtotal;
  const discount = Number(document.getElementById("editDiscount").value || 0);
  const paid = Number(document.getElementById("editAmountPaid").value || 0);
  const total = Math.max(0, subtotal - discount);
  const due = total - paid;

  document.getElementById("editSubtotal").textContent = currency(subtotal);
  document.getElementById("editTotal").textContent = currency(total);
  document.getElementById("editDue").textContent = due < 0
    ? `Overpaid ${currency(Math.abs(due))}`
    : currency(due);

  // Show bill changed banner if total differs from when patient was loaded
  const banner = document.getElementById("editBillChangedBanner");
  if (banner && originalVisitTotal !== null) {
    banner.hidden = Math.abs(total - originalVisitTotal) < 0.01;
  }
}

document.getElementById("editDiscount").addEventListener("input", updateEditTotals);
document.getElementById("editAmountPaid").addEventListener("input", updateEditTotals);

// loadAssociates moved to top level

async function searchDoctors(term) {
  const searchText = term.trim();

  if (selectedDoctor && selectedDoctor.name !== searchText) {
    selectedDoctor = null;
    renderSelectedDoctor();
  }

  if (!searchText) {
    doctorSearchRequestId += 1;
    doctorResults.innerHTML = "";
    return;
  }

  const requestId = ++doctorSearchRequestId;

  try {
    const data = await API.request(`/api/doctors/search?q=${encodeURIComponent(searchText)}`);
    if (requestId !== doctorSearchRequestId) return;

    renderDoctorSuggestions(doctorResults, data.doctors || [], (doctor) => {
      selectedDoctor = doctor;
      doctorSearch.value = doctor.name;
      renderSelectedDoctor();
    });
  } catch (error) {
    console.error("Error searching doctors:", error);
    if (requestId === doctorSearchRequestId) {
      doctorResults.innerHTML = `<div class="autocomplete-empty">Unable to search doctors.</div>`;
    }
  }
}

async function searchTests(term) {
  if (!term.trim()) {
    testResults.innerHTML = "";
    return;
  }
  const data = await API.request(`/api/tests?query=${encodeURIComponent(term)}`);
  testResults.innerHTML = data.tests
    .slice(0, 8)
    .map(
      (test) => `
        <button class="result-btn" data-test-id="${test.id}" type="button">
          <strong>${test.name}</strong><br />
          <span>${test.category || "General"} • ${currency(test.price)}</span>
        </button>
      `
    )
    .join("");

  testResults.querySelectorAll("[data-test-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const test = data.tests.find((item) => item.id === Number(button.dataset.testId));
      if (!selectedTests.some((item) => item.id === test.id)) {
        selectedTests.push({ ...test, isOutside: false, externalLabName: "" });
      }
      testSearch.value = "";
      testResults.innerHTML = "";
      renderSelectedTests();
    });
  });
}

async function searchEditTests(term) {
  if (!term.trim()) {
    editTestResults.innerHTML = "";
    return;
  }

  const data = await API.request(`/api/tests?query=${encodeURIComponent(term)}`);
  editTestResults.innerHTML = data.tests
    .slice(0, 8)
    .map(
      (test) => `
        <button class="result-btn" data-edit-test-id="${test.id}" type="button">
          <strong>${test.name}</strong><br />
          <span>${test.category || "General"} • ${currency(test.price)}</span>
        </button>
      `
    )
    .join("");

  editTestResults.querySelectorAll("[data-edit-test-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const test = data.tests.find((item) => item.id === Number(button.dataset.editTestId));
      if (!editSelectedTests.some((item) => item.id === test.id)) {
        editSelectedTests.push({ ...test, isOutside: false, externalLabName: "" });
      }
      editTestSearch.value = "";
      editTestResults.innerHTML = "";
      renderEditSelectedTests();
    });
  });
}

async function loadRecentVisits(search = "", dateFrom = "", dateTo = "") {
  let url = `/api/visits?query=${encodeURIComponent(search)}`;
  if (dateFrom) url += `&dateFrom=${encodeURIComponent(dateFrom)}`;
  if (dateTo) url += `&dateTo=${encodeURIComponent(dateTo)}`;
  
  const data = await API.request(url);
  const canManageBilling = hasPermission("manage_billing");
  const canViewReports = hasPermission("view_reports");
  const isReceptionist = getUser()?.role === "receptionist";

  if (!data.visits || data.visits.length === 0) {
    recentVisits.innerHTML = `<div class="empty-state" style="padding: 40px; text-align: center; background: rgba(255,255,255,0.4); border: 2px dashed var(--line); border-radius: var(--radius);">
      <div style="font-size: 2rem; margin-bottom: 12px; opacity: 0.5;">📋</div>
      <strong>No visits found</strong><br/>
      <span style="color: var(--muted); font-size: 0.9rem;">There are no patient visits recorded for the selected date range.</span>
    </div>`;
    return;
  }

  recentVisits.innerHTML = data.visits
    .map(
      (visit) => `
        <div class="list-item">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <strong style="font-size: 1.1rem; color: var(--primary-dark);">${visit.bill_no} • ${visit.patient_name} (${visit.age || "?"}${visit.gender ? `/${visit.gender[0].toUpperCase()}` : ""})</strong><br />
              <div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
                <span class="pill" style="padding: 2px 8px; font-size: 0.75rem; background: ${visit.status === 'reported' ? '#0f766e' : '#fef2f2'}; color: ${visit.status === 'reported' ? 'white' : '#b91c1c'}; font-weight: 700; text-transform: uppercase;">${visit.status}</span>
                <span style="font-size: 0.9rem; font-weight: 600; color: var(--text);">${visit.tests || "No tests"}</span>
              </div>
              <div style="font-size: 0.85rem; color: var(--muted); margin-top: 8px; display: grid; gap: 4px;">
                <span>Phone: <strong>${visit.phone || "N/A"}</strong> • Referred by: <strong>${visit.doctor_name || "Self"}</strong></span>
                <span>Source: <strong>${visit.associate_name || "Direct at lab"}</strong> • Due: <strong style="color: var(--danger);">${currency(visit.amount_due)}</strong></span>
                <span style="font-style: italic; opacity: 0.8;">Registered on ${formatDate(visit.created_at)} at ${new Date(visit.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              </div>
            </div>
          </div>
          <div class="actions-row" style="margin-top: 14px; border-top: 1px solid var(--line); padding-top: 12px;">
            ${canManageBilling ? `<button class="secondary-btn" data-bill-preview="${visit.id}" type="button">Preview Bill</button>` : ""}
            ${canManageBilling ? `<button class="ghost-btn" data-bill-print="${visit.id}" type="button">Print Bill</button>` : ""}
            ${isReceptionist && canManageBilling && hasPermission("manage_patients") ? `<button class="secondary-btn" data-quick-edit-bill="${visit.id}" type="button">Edit Bill</button>` : ""}
            ${canViewReports && visit.status === "reported" ? `<button class="secondary-btn" data-view="${visit.id}" type="button">View Report</button>` : ""}
          </div>
        </div>
      `
    )
    .join("");

  recentVisits.querySelectorAll("[data-bill-preview]").forEach((button) => {
    button.addEventListener("click", () => openHtmlBill(button.dataset.billPreview, false));
  });

  recentVisits.querySelectorAll("[data-bill-print]").forEach((button) => {
    button.addEventListener("click", () => openHtmlBill(button.dataset.billPrint, true));
  });

  recentVisits.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => openHtmlReport(button.dataset.view, false));
  });

  bindQuickBillEditActions(recentVisits, data.visits);
}

function patientFromVisit(visit) {
  return {
    id: Number(visit.patient_id),
    name: visit.patient_name || "",
    phone: visit.phone || "",
    age: visit.age || "",
    gender: visit.gender || "",
    patient_code: visit.patient_code || "",
    created_at: visit.patient_created_at || visit.created_at || "",
  };
}

function openQuickBillEdit(visit) {
  if (getUser()?.role !== "receptionist" || !hasPermission("manage_billing") || !hasPermission("manage_patients")) return;
  const patient = patientFromVisit(visit);
  if (!patient.id) return;

  const patientManagementLink = navLinks.find((link) => link.getAttribute("href") === "#patient-management");
  patientManagementLink?.click();
  selectPatientForEdit(patient, Number(visit.id));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindQuickBillEditActions(container, visits) {
  container.querySelectorAll("[data-quick-edit-bill]").forEach((button) => {
    button.addEventListener("click", () => {
      const visit = visits.find((item) => Number(item.id) === Number(button.dataset.quickEditBill));
      if (visit) openQuickBillEdit(visit);
    });
  });
}

function renderNewPatientBillingHistory(visits, patientName = "") {
  if (!newPatientBillingHistory) return;
  const canEditBill = getUser()?.role === "receptionist"
    && hasPermission("manage_billing")
    && hasPermission("manage_patients");
  const canViewReports = hasPermission("view_reports");

  if (!visits.length) {
    newPatientBillingHistory.innerHTML = `<div class="empty-state">No earlier bills found${patientName ? ` for ${escapeHtml(patientName)}` : ""}.</div>`;
    return;
  }

  newPatientBillingHistory.innerHTML = visits.slice(0, 3).map((visit) => `
    <div class="list-item" style="padding: 12px 14px;">
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:start;">
        <div>
          <strong style="color:var(--primary-dark);">${escapeHtml(visit.bill_no)}</strong>
          <span class="pill" style="margin-left:6px; padding:2px 6px; font-size:.68rem; text-transform:uppercase;">${escapeHtml(visit.payment_status || "due")}</span>
          <div style="margin-top:4px; font-size:.82rem; color:var(--muted);">${escapeHtml(visit.tests || "No tests")} · ${formatDate(visit.created_at)}</div>
        </div>
        <div style="text-align:right; font-size:.82rem; white-space:nowrap;">
          <strong>${currency(visit.total)}</strong><br />
          <span style="color:${Number(visit.amount_due || 0) > 0 ? "var(--danger)" : "var(--primary)"};">Due ${currency(visit.amount_due)}</span>
        </div>
      </div>
      ${(canEditBill || (canViewReports && visit.status === "reported")) ? `
        <div class="actions-row" style="margin-top:8px; gap:8px;">
          ${canEditBill ? `<button class="ghost-btn" data-quick-edit-bill="${visit.id}" type="button">Edit Bill</button>` : ""}
          ${canEditBill ? `<button class="ghost-btn" data-share-bill="${visit.id}" type="button">WhatsApp Bill</button>` : ""}
          ${canEditBill ? `<button class="ghost-btn" data-download-bill="${visit.id}" type="button">Download Bill PDF</button>` : ""}
          ${canViewReports && visit.status === "reported" ? `<button class="ghost-btn" data-view="${visit.id}" type="button">View Report</button>` : ""}
        </div>
      ` : ""}
    </div>
  `).join("");

  newPatientBillingHistory.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => openHtmlReport(button.dataset.view, false));
  });
  newPatientBillingHistory.querySelectorAll("[data-share-bill]").forEach((button) => {
    button.addEventListener("click", () => shareBillViaWhatsApp(button.dataset.shareBill));
  });
  newPatientBillingHistory.querySelectorAll("[data-download-bill]").forEach((button) => {
    button.addEventListener("click", async () => {
      const visit = visits.find((item) => Number(item.id) === Number(button.dataset.downloadBill));
      if (!visit) return;
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Preparing PDF…";
      try {
        await downloadBillPdf(visit.id, visit.bill_no);
      } catch (error) {
        alert(error.message || "Unable to download the bill PDF.");
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  });
  bindQuickBillEditActions(newPatientBillingHistory, visits);
}

async function loadNewPatientBillingHistory(patient) {
  if (!newPatientBillingHistory || getUser()?.role !== "receptionist") return;
  const patientName = String(patient?.name || "").trim();
  const phone = String(patient?.phone || "").trim();
  const query = phone || patientName;
  if (!query) {
    renderNewPatientBillingHistory([], "");
    return;
  }

  try {
    const data = await API.request(`/api/visits?query=${encodeURIComponent(query)}`);
    const visits = (data.visits || []).filter((visit) => {
      if (patient?.id) return Number(visit.patient_id) === Number(patient.id);
      return (phone && visit.phone === phone)
        || String(visit.patient_name || "").trim().toLowerCase() === patientName.toLowerCase();
    });
    renderNewPatientBillingHistory(visits, patientName);
  } catch (error) {
    newPatientBillingHistory.innerHTML = `<div class="empty-state">Could not load billing history.</div>`;
  }
}

// Tab Switching Logic
function setupTabs(tabGroupId, contents) {
  const group = document.getElementById(tabGroupId);
  if (!group) return;
  group.querySelectorAll("[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabName = btn.dataset.tab;
      group.querySelectorAll("[data-tab]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      Object.keys(contents).forEach(key => {
        const el = document.getElementById(contents[key]);
        if (el) el.hidden = (key !== tabName);
      });
    });
  });
}

setupTabs("testTabGroup", { inlab: "inlabTabContent", outside: "outsideTabContent" });
setupTabs("editTestTabGroup", { "edit-inlab": "editInlabTabContent", "edit-outside": "editOutsideTabContent" });

doctorSearch.addEventListener("input", (event) => searchDoctors(event.target.value));
testSearch.addEventListener("input", (event) => searchTests(event.target.value));
editTestSearch.addEventListener("input", (event) => searchEditTests(event.target.value));
document.getElementById("discount").addEventListener("input", updateTotals);
document.getElementById("amountPaid").addEventListener("input", updateTotals);
patientNameInput.addEventListener("input", (event) => {
  const query = event.target.value.trim();
  searchPatientsForNewVisit(query);
  clearTimeout(newPatientHistoryTimer);
  newPatientHistoryTimer = setTimeout(() => {
    loadNewPatientBillingHistory({ name: query, phone: patientPhoneInput.value.trim() });
  }, 300);
});

patientPhoneInput.addEventListener("input", () => {
  clearTimeout(newPatientHistoryTimer);
  newPatientHistoryTimer = setTimeout(() => {
    loadNewPatientBillingHistory({ name: patientNameInput.value.trim(), phone: patientPhoneInput.value.trim() });
  }, 300);
});

// Manual Outside Test Handlers
document.getElementById("addOutsideTestBtn")?.addEventListener("click", () => {
  const name = document.getElementById("outsideTestName").value.trim();
  const price = Number(document.getElementById("outsideTestPrice").value || 0);
  const lab = document.getElementById("outsideLabName").value.trim();

  if (!name || price <= 0) {
    alert("Please enter a valid test name and price.");
    return;
  }

  selectedTests.push({
    id: null,
    tempId: "custom-" + Date.now(),
    name,
    price,
    isOutside: true,
    externalLabName: lab || "Serum",
    isCustom: true
  });

  document.getElementById("outsideTestName").value = "";
  document.getElementById("outsideTestPrice").value = "";
  renderSelectedTests();
});

document.getElementById("addEditOutsideTestBtn")?.addEventListener("click", () => {
  const name = document.getElementById("editOutsideTestName").value.trim();
  const price = Number(document.getElementById("editOutsideTestPrice").value || 0);
  const lab = document.getElementById("editOutsideLabName").value.trim();

  if (!name || price <= 0) {
    alert("Please enter a valid test name and price.");
    return;
  }

  editSelectedTests.push({
    id: null,
    tempId: "custom-" + Date.now(),
    name,
    price,
    isOutside: true,
    externalLabName: lab || "Serum",
    isCustom: true
  });

  document.getElementById("editOutsideTestName").value = "";
  document.getElementById("editOutsideTestPrice").value = "";
  renderEditSelectedTests();
});

document.addEventListener("click", (event) => {
  if (!event.target.closest("#doctorSearch") && !event.target.closest("#doctorResults")) {
    doctorResults.innerHTML = "";
  }

  if (!event.target.closest("#editDoctorSearch") && !event.target.closest("#editDoctorResults")) {
    editDoctorResults.innerHTML = "";
  }
});

async function searchPatientsForNewVisit(query) {
  if (!query) {
    patientNameResults.innerHTML = "";
    return;
  }

  try {
    const patients = await API.request(`/api/patients/search?q=${encodeURIComponent(query)}`);
    if (!patients.length) {
      patientNameResults.innerHTML = "";
      return;
    }

    patientNameResults.innerHTML = patients
      .map(
        (p) => `
        <div class="autocomplete-item" data-patient-id="${p.id}">
          <strong>${p.name}</strong><br />
          <small>${p.phone || "No phone"} • ${p.age || "-"} • ${p.gender || "-"}</small>
        </div>
      `
      )
      .join("");

    patientNameResults.querySelectorAll(".autocomplete-item").forEach((item) => {
      item.addEventListener("click", () => {
        const p = patients.find((p) => p.id === Number(item.dataset.patientId));
        if (p) {
          patientNameInput.value = p.name;
          patientPhoneInput.value = p.phone || "";
          patientAgeInput.value = p.age || "";
          patientGenderInput.value = p.gender || "Male";
          patientNameResults.innerHTML = "";
          loadNewPatientBillingHistory(p);
        }
      });
    });
  } catch (error) {
    console.error("Error searching patients:", error);
  }
}

function reloadRecentVisits() {
  const search = document.getElementById("visitSearch").value;
  const dateFrom = document.getElementById("visitDateFrom").value;
  const dateTo = document.getElementById("visitDateTo").value;
  return loadRecentVisits(search, dateFrom, dateTo);
}

document.getElementById("visitSearch").addEventListener("input", reloadRecentVisits);
document.getElementById("visitDateFrom").addEventListener("change", reloadRecentVisits);
document.getElementById("visitDateTo").addEventListener("change", reloadRecentVisits);
sampleSourceInput.addEventListener("change", renderSelectedAssociate);
associateSelect.addEventListener("change", renderSelectedAssociate);

document.getElementById("visitForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!selectedTests.length) {
    showMessage("visitMessage", "Select at least one test", true);
    return;
  }

  if (sampleSourceInput.value === "associate" && !associateSelect.value) {
    showMessage("visitMessage", "Select the associate or collector", true);
    return;
  }

  const associate = getSelectedAssociate();

  try {
    let doctorId = selectedDoctor?.id || null;
    let doctorSearchVal = document.getElementById("doctorSearch").value.trim();

    if (!doctorId && doctorSearchVal && doctorSearchVal.toLowerCase() !== "self") {
      let name = doctorSearchVal;
      let degree = "General";
      if (doctorSearchVal.includes("-")) {
        const parts = doctorSearchVal.split("-");
        name = parts[0].trim();
        degree = parts.slice(1).join("-").trim();
      }

      try {
        const docRes = await API.request("/api/doctors", {
          method: "POST",
          body: JSON.stringify({ name, specialization: degree, isAutoCreate: true })
        });
        doctorId = docRes.doctor.id;
      } catch (err) {
        showMessage("visitMessage", "Failed to auto-create doctor: " + err.message, true);
        return;
      }
    }

    const payload = {
      patient: {
        name: document.getElementById("patientName").value.trim(),
        age: Number(document.getElementById("patientAge").value),
        gender: document.getElementById("patientGender").value,
        phone: document.getElementById("patientPhone").value.trim(),
      },
      registrationTime: document.getElementById("registrationTime").value,
      doctorId: doctorId,
      tests: selectedTests.map((test) => ({ 
        id: test.id, 
        isOutside: !!test.isOutside, 
        externalLabName: test.externalLabName || null,
        isCustom: !!test.isCustom,
        customName: test.isCustom ? test.name : null,
        customPrice: test.isCustom ? test.price : null
      })),
      discount: Number(document.getElementById("discount").value || 0),
      amountPaid: Number(document.getElementById("amountPaid").value || 0),
      paymentMode: document.getElementById("paymentMode").value,
      sampleSource: sampleSourceInput.value,
      associateId: associate?.id || null,
      associateName: associate ? `${associate.name} (${associate.associate_code})` : "Direct at lab",
    };

    const data = await API.request("/api/visits", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    event.target.reset();
    document.getElementById("registrationTime").value = getLocalDatetime();
    selectedDoctor = null;
    selectedTests = [];
    latestGeneratedVisitId = data.visit.id;
    generatedBillNumber.dataset.billNo = data.visit.bill_no;
    renderSelectedDoctor();
    renderSelectedTests();
    renderGeneratedBillActions();
    renderSelectedAssociate();
    showMessage("visitMessage", `Bill created successfully: ${data.visit.bill_no}`);
    loadNewPatientBillingHistory(payload.patient);
    await loadRecentVisits();
    await loadReceptionSummary();
    await loadDailyAccounts();
    await reloadPatientSearch();
    await reloadResultsVisits();
    if (typeof loadCollectionVisits === "function") {
      await loadCollectionVisits(document.getElementById("collectionSearchInput")?.value || "");
    }
  } catch (error) {
    showMessage("visitMessage", error.message, true);
  }
});

document.getElementById("previewGeneratedBillBtn").addEventListener("click", () => {
  if (latestGeneratedVisitId) {
    openHtmlBill(latestGeneratedVisitId, false);
  }
});

document.getElementById("savePatientDetailsBtn").addEventListener("click", async () => {
  if (!document.getElementById("patientName").value.trim()) {
    showMessage("visitMessage", "Enter patient name", true);
    return;
  }

  if (!document.getElementById("patientAge").value) {
    showMessage("visitMessage", "Enter patient age", true);
    return;
  }

  if (selectedTests.length && sampleSourceInput.value === "associate" && !getSelectedAssociate()) {
    showMessage("visitMessage", "Select the associate or collector", true);
    return;
  }

  try {
    let doctorId = selectedDoctor?.id || null;
    let doctorSearchVal = document.getElementById("doctorSearch").value.trim();

    if (!doctorId && doctorSearchVal && doctorSearchVal.toLowerCase() !== "self") {
      let name = doctorSearchVal;
      let degree = "General";
      if (doctorSearchVal.includes("-")) {
        const parts = doctorSearchVal.split("-");
        name = parts[0].trim();
        degree = parts.slice(1).join("-").trim();
      }

      try {
        const docRes = await API.request("/api/doctors", {
          method: "POST",
          body: JSON.stringify({ name, specialization: degree, isAutoCreate: true })
        });
        doctorId = docRes.doctor.id;
      } catch (err) {
        showMessage("visitMessage", "Failed to auto-create doctor: " + err.message, true);
        return;
      }
    }

    const payload = {
      name: document.getElementById("patientName").value.trim(),
      age: Number(document.getElementById("patientAge").value),
      gender: document.getElementById("patientGender").value,
      phone: document.getElementById("patientPhone").value.trim(),
      registrationTime: document.getElementById("registrationTime").value,
      tests: selectedTests.map((test) => ({ 
        id: test.id, 
        isOutside: !!test.isOutside, 
        externalLabName: test.externalLabName || null,
        isCustom: !!test.isCustom,
        customName: test.isCustom ? test.name : null,
        customPrice: test.isCustom ? test.price : null
      })),
      discount: Number(document.getElementById("discount").value || 0),
      amountPaid: Number(document.getElementById("amountPaid").value || 0),
      paymentMode: document.getElementById("paymentMode").value,
      doctorId: doctorId,
      sampleSource: sampleSourceInput.value,
      associateId: getSelectedAssociate()?.id || null,
      associateName: getSelectedAssociate() ? `${getSelectedAssociate().name} (${getSelectedAssociate().associate_code})` : "Direct at lab",
    };

    payload.createVisit = true;

    const data = await API.request("/api/patients", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (data.visit) {
      latestGeneratedVisitId = data.visit.id;
      generatedBillNumber.dataset.billNo = data.visit.bill_no;
      if (selectedTests.length > 0) {
        showMessage("visitMessage", `Bill created successfully: ${data.visit.bill_no}`);
      } else {
        showMessage("visitMessage", `Patient registered successfully: ${data.patient.patient_code}`);
      }
    } else {
      latestGeneratedVisitId = null;
      generatedBillNumber.dataset.billNo = "";
      showMessage("visitMessage", `Patient details saved successfully: ${data.patient.patient_code}`);
    }
    loadNewPatientBillingHistory({ name: payload.name, phone: payload.phone });

    document.getElementById("visitForm").reset();
    document.getElementById("registrationTime").value = getLocalDatetime();
    selectedDoctor = null;
    selectedTests = [];
    renderSelectedDoctor();
    renderSelectedTests();
    renderGeneratedBillActions();
    renderSelectedAssociate();
    await loadRecentVisits();
    await loadReceptionSummary();
    await loadDailyAccounts();
    await reloadResultsVisits();
    await reloadPatientSearch();
    if (typeof loadCollectionVisits === "function") {
      await loadCollectionVisits(document.getElementById("collectionSearchInput")?.value || "");
    }
  } catch (error) {
    showMessage("visitMessage", error.message, true);
  }
});

document.getElementById("printGeneratedBillBtn").addEventListener("click", () => {
  if (latestGeneratedVisitId) {
    openHtmlBill(latestGeneratedVisitId, true);
  }
});

function initializeNavigation() {
  const user = getUser();
  const technicianRoles = ["blood_sample_technician", "usg_technician", "mri_technician", "ct_technician"];
  const isTechnician = technicianRoles.includes(user?.role);
  const hasRegistrationOnlyAccess = isTechnician
    && hasPermission("manage_patients")
    && !hasPermission("manage_billing")
    && !hasPermission("enter_results")
    && !hasPermission("view_reports")
    && !hasPermission("print_reports")
    && !hasPermission("download_reports");
  const sections = {
    "#reception-summary": document.getElementById("reception-summary"),
    "#new-visit": document.getElementById("new-visit"),
    "#patient-management": document.getElementById("patient-management"),
    "#results-entry": document.getElementById("results-entry"),
    "#collection-delivery": document.getElementById("collection-delivery"),
    "#price-inquiry": document.getElementById("price-inquiry"),
    "#daily-accounts": document.getElementById("daily-accounts"),
  };

  const sectionTitles = {
    "#reception-summary": "Daily Overview",
    "#new-visit": "Register a new patient",
    "#patient-management": "Patient Management",
    "#results-entry": "Enter Test Results",
    "#collection-delivery": "Bill Collection & Reports",
    "#price-inquiry": "Price Inquiry",
    "#daily-accounts": "Daily Accounts",
  };
  const sectionPermissions = {
    "#new-visit": ["manage_patients"],
    "#patient-management": ["manage_patients"],
    "#results-entry": ["enter_results"],
    "#price-inquiry": ["manage_billing"],
  };
  const sectionAnyPermissions = {
    "#collection-delivery": ["manage_billing", "view_reports", "print_reports", "download_reports"],
  };

  function canOpenSection(href) {
    // Technicians may register a patient, but patient management exposes the
    // wider patient record workspace. Keep that workspace for reception and
    // administrative roles only.
    if (href === "#patient-management" && isTechnician) return false;
    if (href === "#reception-summary" && hasRegistrationOnlyAccess) return false;

    const permissions = sectionPermissions[href] || [];
    const anyPermissions = sectionAnyPermissions[href] || [];
    const hasRequiredPermissions = permissions.every((permission) => hasPermission(permission));
    const hasAllowedPermission = !anyPermissions.length || anyPermissions.some((permission) => hasPermission(permission));
    return hasRequiredPermissions && hasAllowedPermission;
  }

  function normalizeHref(href) {
    if (href === "reception.html") return "#new-visit";
    return href || "#reception-summary";
  }

  function activateSection(href) {
    const fallbackHref = hasRegistrationOnlyAccess ? "#new-visit" : "#reception-summary";
    const normalizedHref = normalizeHref(href);
    let targetHref = (sections[normalizedHref] && sections[normalizedHref] !== null) ? normalizedHref : fallbackHref;

    if (!canOpenSection(targetHref)) {
      alert("You do not have permission to open this section.");
      targetHref = fallbackHref;
    }

    if (targetHref === "#daily-accounts" && user?.role !== "receptionist") {
      targetHref = fallbackHref;
    }

    navLinks.forEach((link) => {
      if (link) link.classList.toggle("active", link.getAttribute("href") === targetHref);
    });

    Object.entries(sections).forEach(([sectionHref, section]) => {
      if (section) section.hidden = sectionHref !== targetHref;
    });

    const pageTitle = document.getElementById("pageTitle");
    if (pageTitle && sectionTitles[targetHref]) {
      pageTitle.textContent = sectionTitles[targetHref];
    }

    const header = document.querySelector(".page-header");
    if (header) header.hidden = false;

    if (targetHref === "#price-inquiry" && typeof initPriceInquiry === 'function') {
      initPriceInquiry();
    }
    if (targetHref === "#collection-delivery" && typeof loadCollectionVisits === 'function') {
      setTimeout(() => {
        const searchInput = document.getElementById("collectionSearchInput");
        const dateFrom = document.getElementById("collectionDateFrom")?.value || "";
        const dateTo = document.getElementById("collectionDateTo")?.value || "";
        loadCollectionVisits(searchInput?.value?.trim() || "", dateFrom, dateTo);
      }, 0);
    }
    if (targetHref === "#daily-accounts" && typeof loadDailyAccounts === 'function') {
      loadDailyAccounts();
    }
    if (targetHref === "#reception-summary" && typeof loadReceptionSummary === 'function') {
      loadReceptionSummary();
    }
    if (targetHref === "#patient-management") {
      reloadPatientSearch();
    }
    if (targetHref === "#results-entry") {
      reloadResultsVisits();
    }
    if (targetHref === "#new-visit" || targetHref === "reception.html") {
      reloadRecentVisits();
    }
  }

  navLinks.forEach((link) => {
    if (link) {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        activateSection(link.getAttribute("href"));
      });
    }
  });
  const initialSection = window.location.hash || (hasRegistrationOnlyAccess ? "#new-visit" : "#reception-summary");
  activateSection(initialSection);

  navLinks.forEach((link) => {
    const href = normalizeHref(link.getAttribute("href"));
    if (href !== "#reception-summary" && !canOpenSection(href)) {
      link.style.display = "none";
    }
    if (href === "#reception-summary" && hasRegistrationOnlyAccess) {
      link.style.display = "none";
    }
  });

  const navDailyAccounts = document.getElementById("navDailyAccounts");
  if (navDailyAccounts && user?.role !== "receptionist") {
    navDailyAccounts.style.display = "none";
  }

}

function renderPatientSearchResults(patients) {
  if (!patients.length) {
    patientSearchResults.innerHTML = `<div class="empty-state">No patients found.</div>`;
    return;
  }

  patientSearchResults.innerHTML = patients
    .map(
      (patient) => {
        let dotHTML = '';
        if (patient.latest_visit_status) {
          const isReported = patient.latest_visit_status === 'reported';
          const color = isReported ? 'var(--primary)' : 'var(--danger)';
          const title = isReported ? 'Latest Report Ready' : 'Latest Report Not Ready';
          dotHTML = `<div style="position: absolute; top: 18px; right: 18px; width: 12px; height: 12px; border-radius: 50%; background-color: ${color}; box-shadow: 0 0 8px 1px ${color};" title="${title}"></div>`;
        }
        
        return `
        <div class="list-item" data-patient-id="${patient.id}" style="position: relative; cursor: pointer;">
          ${dotHTML}
          <div style="padding-right: 20px;">
            <strong>${patient.name}</strong><br />
            <span>${patient.patient_code} • Age: ${patient.age || "-"} • ${patient.gender || "-"} • ${patient.phone || "No phone"}</span><br />
            <span>${patient.tests ? `Tests: ${patient.tests}` : "No tests registered yet"}</span>
          </div>
        </div>
        `;
      }
    )
    .join("");

  patientSearchResults.querySelectorAll(".list-item").forEach((item) => {
    item.addEventListener("click", () => {
      const patientId = Number(item.dataset.patientId);
      const patient = patients.find((p) => p.id === patientId);
      if (patient) {
        selectPatientForEdit(patient);
      }
    });
  });
}

function selectPatientForEdit(patient, preferredVisitId = null) {
  selectedPatient = patient;
  editSelectedTests = [];
  existingVisitTestsList = [];
  editSelectedDoctor = null;
  editSelectedAssociateObj = null;
  originalVisitTotal = null;
  activeEditVisitId = null;

  editPatientName.value = patient.name;
  editPatientPhone.value = patient.phone || "";
  editPatientAge.value = patient.age;
  editPatientGender.value = patient.gender;
  document.getElementById("editPatientDate").value = formatDate(patient.created_at);
  
  editTestSearch.value = "";
  editTestResults.innerHTML = "";
  document.getElementById("editDoctorSearch").value = "";
  document.getElementById("editDiscount").value = 0;
  document.getElementById("editAmountPaid").value = 0;
  document.getElementById("editPaymentMode").value = "cash";

  const banner = document.getElementById("editBillChangedBanner");
  if (banner) banner.hidden = true;

  const evtContainer = document.getElementById("existingVisitTests");
  if (evtContainer) evtContainer.innerHTML = `<div class="empty-state">Loading latest visit...</div>`;

  const historyContainer = document.getElementById("patientVisitHistory");
  if (historyContainer) historyContainer.innerHTML = `<div class="empty-state">Loading history...</div>`;

  renderEditSelectedTests();
  renderEditSelectedDoctor();
  renderEditSelectedAssociate();

  patientEditForm.hidden = false;
  document.getElementById("patientEditEmptyState").hidden = true;
  if (deleteSelectedPatientBtn) {
    deleteSelectedPatientBtn.hidden = !hasPermission("delete_patients");
  }

  // Load existing visit tests in the background
  const preferredVisitQuery = preferredVisitId ? `?visitId=${encodeURIComponent(preferredVisitId)}` : "";
  API.request(`/api/visits/latest-for-patient/${patient.id}${preferredVisitQuery}`)
    .then(data => {
      if (data.visit) {
        activeEditVisitId = data.visit.id;
        existingVisitTestsList = data.tests || [];
        originalVisitTotal = Number(data.visit.total || 0);
        document.getElementById("editDiscount").value = data.visit.discount || 0;
        document.getElementById("editAmountPaid").value = data.visit.amount_paid || 0;
        document.getElementById("editPaymentMode").value = data.visit.payment_mode || "cash";

        // Pre-fill doctor from existing visit
        if (data.doctor) {
          editSelectedDoctor = data.doctor;
          const editDoctorSearchEl = document.getElementById("editDoctorSearch");
          if (editDoctorSearchEl) editDoctorSearchEl.value = data.doctor.name;
        }

        // Pre-fill associate from existing visit
        if (data.visit.sample_source) {
          editSampleSourceInput.value = data.visit.sample_source;
          if (data.visit.sample_source === "associate" && data.visit.associate_id) {
            editSelectedAssociateObj = associates.find(a => a.id === data.visit.associate_id) || null;
            if (editAssociateSelect) editAssociateSelect.value = data.visit.associate_id || "";
          } else {
            editSelectedAssociateObj = null;
            if (editAssociateSelect) editAssociateSelect.value = "";
          }
        }
        renderEditSelectedAssociate();

        // Show/hide print button based on billing permission
        const canBill = hasPermission("manage_billing");
        const printBtn = document.getElementById("printEditedBillBtn");
        if (printBtn) printBtn.hidden = !canBill;
      } else {
        existingVisitTestsList = [];
        originalVisitTotal = 0;
        activeEditVisitId = null;
        editSelectedDoctor = null;
      }
      
      renderEditSelectedDoctor();
      renderExistingVisitTests(existingVisitTestsList, activeEditVisitId);
      updateEditTotals();
    })
    .catch(err => {
      console.error("Latest visit load failed", err);
      if (evtContainer) evtContainer.innerHTML = `<div class="empty-state">Could not load latest visit details.</div>`;
    });

  // Load all visits for history
  API.request(`/api/visits/patient/${patient.id}`)
    .then(visits => {
      renderPatientHistory(visits);
    })
    .catch(err => {
      console.error("Visit history load failed", err);
      if (historyContainer) historyContainer.innerHTML = `<div class="empty-state">Could not load visit history.</div>`;
    });
}

async function reloadPatientSearch() {
  const query = document.getElementById("patientSearch").value.trim();
  const dateFrom = document.getElementById("patientSearchDateFrom")?.value || "";
  const dateTo = document.getElementById("patientSearchDateTo")?.value || "";
  
  let url = `/api/patients/search?q=${encodeURIComponent(query)}`;
  if (dateFrom) url += `&dateFrom=${encodeURIComponent(dateFrom)}`;
  if (dateTo) url += `&dateTo=${encodeURIComponent(dateTo)}`;

  try {
    const patients = await API.request(url);
    renderPatientSearchResults(patients);
  } catch (error) {
    patientSearchResults.innerHTML = `<div class="error">Error searching patients: ${error.message}</div>`;
  }
}

document.getElementById("patientSearch").addEventListener("input", reloadPatientSearch);
if (document.getElementById("patientSearchDateFrom")) {
  document.getElementById("patientSearchDateFrom").addEventListener("change", reloadPatientSearch);
}
if (document.getElementById("patientSearchDateTo")) {
  document.getElementById("patientSearchDateTo").addEventListener("change", reloadPatientSearch);
}

document.getElementById("patientEditForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedPatient) return;

  let editDoctorId = editSelectedDoctor?.id || null;
  let editDoctorSearchVal = document.getElementById("editDoctorSearch").value.trim();

  if (!editDoctorId && editDoctorSearchVal && editDoctorSearchVal.toLowerCase() !== "self") {
    let name = editDoctorSearchVal;
    let degree = "General";
    if (editDoctorSearchVal.includes("-")) {
      const parts = editDoctorSearchVal.split("-");
      name = parts[0].trim();
      degree = parts.slice(1).join("-").trim();
    }

    try {
      const docRes = await API.request("/api/doctors", {
        method: "POST",
        body: JSON.stringify({ name, specialization: degree, isAutoCreate: true })
      });
      editDoctorId = docRes.doctor.id;
    } catch (err) {
      showMessage("patientEditMessage", "Failed to auto-create doctor: " + err.message, true);
      return;
    }
  }

  const payload = {
    name: editPatientName.value.trim(),
    phone: editPatientPhone.value.trim(),
    age: Number(editPatientAge.value),
    gender: editPatientGender.value,
    tests: editSelectedTests.map((test) => ({ 
      id: test.id, 
      isOutside: !!test.isOutside, 
      externalLabName: test.externalLabName || null,
      isCustom: !!test.isCustom,
      customName: test.isCustom ? test.name : null,
      customPrice: test.isCustom ? test.price : null
    })),
    discount: Number(document.getElementById("editDiscount").value || 0),
    amountPaid: Number(document.getElementById("editAmountPaid").value || 0),
    paymentMode: document.getElementById("editPaymentMode").value,
    doctorId: editDoctorId,
    sampleSource: editSampleSourceInput.value,
    associateId: getEditSelectedAssociate()?.id || null,
    associateName: getEditSelectedAssociate() ? `${getEditSelectedAssociate().name} (${getEditSelectedAssociate().associate_code})` : "Direct at lab",
  };

  try {
    const data = await API.request(`/api/patients/${selectedPatient.id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    showMessage(
      "patientEditMessage",
      data.visit ? "Patient updated and tests registered" : "Patient updated successfully"
    );
    patientEditForm.hidden = true;
    document.getElementById("patientEditEmptyState").hidden = false;
    if (deleteSelectedPatientBtn) deleteSelectedPatientBtn.hidden = true;
    selectedPatient = null;
    editSelectedTests = [];
    editSelectedDoctor = null;
    editSelectedAssociateObj = null;
    renderEditSelectedTests();
    renderEditSelectedDoctor();
    editSampleSourceInput.value = "lab";
    renderEditSelectedAssociate();
    await reloadRecentVisits();
    await reloadResultsVisits();
    await reloadPatientSearch();
    if (typeof loadCollectionVisits === "function") {
      await loadCollectionVisits(document.getElementById("collectionSearchInput")?.value || "");
    }
  } catch (error) {
    showMessage("patientEditMessage", error.message, true);
  }
});

  editDoctorSearch?.addEventListener("input", (e) => searchEditDoctors(e.target.value));

  editSampleSourceInput?.addEventListener("change", () => {
    if (editSampleSourceInput.value === "lab") {
      editAssociateSelect.value = "";
      editSelectedAssociateObj = null;
    }
    renderEditSelectedAssociate();
  });

  editAssociateSelect?.addEventListener("change", () => {
    editSelectedAssociateObj = associates.find((a) => a.id === Number(editAssociateSelect.value)) || null;
    renderEditSelectedAssociate();
  });

  document.getElementById("cancelPatientEdit").addEventListener("click", () => {
    document.getElementById("patientEditForm").hidden = true;
    document.getElementById("patientEditEmptyState").hidden = false;
    if (deleteSelectedPatientBtn) deleteSelectedPatientBtn.hidden = true;
    activePatientId = null;
    activeEditVisitId = null;
    selectedPatient = null;
    existingVisitTestsList = [];
    originalVisitTotal = null;
    editSelectedTests = [];
    editSelectedDoctor = null;
    editSelectedAssociateObj = null;
    renderEditSelectedTests();
    renderEditSelectedDoctor();
    editSampleSourceInput.value = "lab";
    renderEditSelectedAssociate();
    showMessage("patientEditMessage", "");
    const banner = document.getElementById("editBillChangedBanner");
    if (banner) banner.hidden = true;
    const evtContainer = document.getElementById("existingVisitTests");
    if (evtContainer) evtContainer.innerHTML = "";
    reloadPatientSearch();
  });

  deleteSelectedPatientBtn?.addEventListener("click", async () => {
    if (!selectedPatient || !hasPermission("delete_patients")) return;

    const patientLabel = `${selectedPatient.name} (${selectedPatient.patient_code})`;
    if (!confirm(`Permanently delete ${patientLabel} and all linked visits, tests, results, bills, and reports? This cannot be undone.`)) {
      return;
    }

    try {
      await API.request(`/api/patients/${selectedPatient.id}`, { method: "DELETE" });
      showMessage("patientEditMessage", `Deleted ${patientLabel}`);
      document.getElementById("patientEditForm").hidden = true;
      document.getElementById("patientEditEmptyState").hidden = false;
      deleteSelectedPatientBtn.hidden = true;
      selectedPatient = null;
      activeEditVisitId = null;
      existingVisitTestsList = [];
      originalVisitTotal = null;
      editSelectedTests = [];
      editSelectedDoctor = null;
      editSelectedAssociateObj = null;
      renderEditSelectedTests();
      renderEditSelectedDoctor();
      editSampleSourceInput.value = "lab";
      renderEditSelectedAssociate();
      await reloadPatientSearch();
      await reloadResultsVisits();
      await reloadRecentVisits();
      if (typeof loadCollectionVisits === "function") {
        await loadCollectionVisits(document.getElementById("collectionSearchInput")?.value || "");
      }
    } catch (error) {
      showMessage("patientEditMessage", error.message, true);
    }
  });

  // Generate New Bill / Print New Bill buttons
  document.getElementById("generateEditedBillBtn")?.addEventListener("click", () => {
    if (activeEditVisitId) openHtmlBill(activeEditVisitId, false);
  });
  document.getElementById("printEditedBillBtn")?.addEventListener("click", () => {
    if (activeEditVisitId) openHtmlBill(activeEditVisitId, true);
  });

function getLocalDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().split("T")[0];
}

function setDefaultDateRange() {
  const today = new Date();
  const oneMonthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const offset = today.getTimezoneOffset() * 60000;
  
  const fromDateString = new Date(oneMonthAgo.getTime() - offset).toISOString().split("T")[0];
  const toDateString = new Date(today.getTime() - offset).toISOString().split("T")[0];
  
  document.getElementById("visitDateFrom").value = fromDateString;
  document.getElementById("visitDateTo").value = toDateString;
}

function setDefaultResultsDateRange() {
  const today = new Date();
  const oneMonthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const offset = today.getTimezoneOffset() * 60000;
  
  const fromDateString = new Date(oneMonthAgo.getTime() - offset).toISOString().split("T")[0];
  const toDateString = new Date(today.getTime() - offset).toISOString().split("T")[0];
  
  const from = document.getElementById("resultsSearchDateFrom");
  const to = document.getElementById("resultsSearchDateTo");
  if (from) from.value = fromDateString;
  if (to) to.value = toDateString;
}

function setDefaultCollectionDateRange() {
  const today = new Date();
  const oneMonthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const offset = today.getTimezoneOffset() * 60000;
  const fromDateString = new Date(oneMonthAgo.getTime() - offset).toISOString().split("T")[0];
  const toDateString = new Date(today.getTime() - offset).toISOString().split("T")[0];
  
  const from = document.getElementById("collectionDateFrom");
  const to = document.getElementById("collectionDateTo");
  if (from) from.value = fromDateString;
  if (to) to.value = toDateString;
}

function getLocalDatetime() {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
}

// Result Entry Functionality
let activeResultsVisitId = null;

const resultsSearchInput = document.getElementById("resultsSearchInput");
const resultsSearchDateFrom = document.getElementById("resultsSearchDateFrom");
const resultsSearchDateTo = document.getElementById("resultsSearchDateTo");
const resultsSearchResults = document.getElementById("resultsSearchResults");
const resultsVisitDetails = document.getElementById("resultsVisitDetails");
const resultsSaveAllBtn = document.getElementById("resultsSaveAllBtn");
const resultsFinalizeBtn = document.getElementById("resultsFinalizeBtn");
const resultsPrintBtn = document.getElementById("resultsPrintBtn");
const resultsViewReportBtn = document.getElementById("resultsViewReportBtn");
if (resultsViewReportBtn && !hasPermission("view_reports")) {
  resultsViewReportBtn.style.display = "none";
}
const resultsMessage = document.getElementById("resultsMessage");
const resultsActions = document.getElementById("resultsActions");

async function loadResultsVisits(search = "", dateFrom = "", dateTo = "") {
  let url = `/api/visits?query=${encodeURIComponent(search)}`;
  if (dateFrom) url += `&dateFrom=${encodeURIComponent(dateFrom)}`;
  if (dateTo) url += `&dateTo=${encodeURIComponent(dateTo)}`;

  const data = await API.request(url);
  
  // Filter visits to only show those that have at least one pathology test
  // and filter the test summary string for each visit.
  const filteredVisits = data.visits
    .map(visit => {
      const testsArr = (visit.tests || "").split(", ");
      const pathTests = testsArr.filter(t => isPathologyTest(t, "")); // We don't have category here, but name check is fallback
      return { ...visit, tests: pathTests.join(", "), pathCount: pathTests.length };
    })
    .filter(visit => visit.pathCount > 0);

  if (!filteredVisits.length) {
    resultsSearchResults.innerHTML = `<div class="empty-state">No visits requiring result entry found for this period.</div>`;
    return;
  }

  resultsSearchResults.innerHTML = filteredVisits
    .map(
      (visit) => `
        <div class="list-item" data-visit-id="${visit.id}" style="position: relative; cursor: pointer;" tabindex="0">
          <div style="position: absolute; top: 18px; right: 18px; width: 12px; height: 12px; border-radius: 50%; background-color: ${visit.status === 'reported' ? 'var(--primary)' : 'var(--danger)'}; box-shadow: 0 0 8px 1px ${visit.status === 'reported' ? 'var(--primary)' : 'var(--danger)'};" title="${visit.status === 'reported' ? 'Report Ready' : 'Report Not Ready'}"></div>
          <div style="padding-right: 20px;">
            <strong>${visit.bill_no} • ${visit.patient_name}</strong><br />
            <span>${visit.tests || "No pathology tests"} • ${visit.status} • ${formatDate(visit.created_at)}</span>
            ${visit.has_outside ? `<span class="pill" style="margin-left: 8px; background: #fff1f2; color: #e11d48; font-size: 0.7rem; padding: 2px 6px;">Contains Outside Report</span>` : ""}
          </div>
        </div>
      `
    )
    .join("");

  resultsSearchResults.querySelectorAll("[data-visit-id]").forEach((button) => {
    button.addEventListener("click", () => loadResultsVisit(button.dataset.visitId));
  });
}

async function loadResultsVisit(visitId) {
  activeResultsVisitId = visitId;
  const data = await API.request(`/api/visits/${visitId}`);
  const reportData = await API.request(`/api/visits/${visitId}/report`).catch(() => null);
  const user = getUser();
  const canViewReports = hasPermission("view_reports");

  const pathologyTests = data.tests.filter(t => isPathologyTest(t.name, t.category));

  if (pathologyTests.length === 0) {
    resultsVisitDetails.innerHTML = `<div class="empty-state">No pathology tests (Blood/Urine/Stool) found in this visit.</div>`;
    resultsActions.hidden = true;
    return;
  }

  resultsVisitDetails.innerHTML = pathologyTests
    .map(
      (test) => `
        <form class="result-card" data-result-form data-visit-id="${visitId}" data-visit-test-id="${test.id}">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <strong>${test.name}</strong><br />
              <span>Status: ${test.status} • Entered by: ${test.technician_name || "Unassigned"}</span>
            </div>
            ${test.is_outside ? `<div class="pill" style="background: var(--danger-bg); color: var(--danger); border: 1px solid var(--danger); font-size: 0.75rem; font-weight: bold;">OUTSIDE REPORT: ${escapeHtml(test.external_lab_name || "Serum")}</div>` : ""}
          </div>
          ${test.status === "reported" ? `<div class="inline-note">Already included in finalized report.</div>` : ""}
          <div class="stack" id="results-parameters-${test.id}"></div>
          <button class="secondary-btn" type="submit" ${test.status === "reported" ? "disabled" : ""}>
            ${test.is_outside ? "Mark as Received / Save" : "Save results"}
          </button>
        </form>
      `
    )
    .join("");

  for (const test of pathologyTests) {
    const testCatalog = await API.request(`/api/tests?query=${encodeURIComponent(test.name)}`);
    const matched = testCatalog.tests.find((item) => item.test_id === test.test_id || item.name === test.name);
    const holder = document.getElementById(`results-parameters-${test.id}`);
    holder.innerHTML = (matched?.parameters || [])
      .map((parameter) => renderResultParameterField(parameter, test.results || []))
      .join("");

    attachParameterCalculations(holder);
  }

  resultsVisitDetails.querySelectorAll("[data-result-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await saveResultsForm(form);
        showMessage("resultsMessage", "Results saved");
      } catch (error) {
        showMessage("resultsMessage", error.message, true);
      }
    });
  });

  resultsActions.hidden = false;
  resultsSaveAllBtn.disabled = false;
  resultsFinalizeBtn.disabled = false;
  resultsPrintBtn.disabled = !reportData?.report?.finalized;
  resultsViewReportBtn.disabled = !canViewReports || !reportData?.report?.finalized;
}

async function saveResultsForm(form) {
  const visitId = form.dataset.visitId || activeResultsVisitId;
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

async function reloadResultsVisits() {
  const search = resultsSearchInput.value;
  const dateFrom = resultsSearchDateFrom.value;
  const dateTo = resultsSearchDateTo.value;
  return await loadResultsVisits(search, dateFrom, dateTo);
}

resultsSearchInput.addEventListener("input", () => reloadResultsVisits());
resultsSearchDateFrom.addEventListener("change", () => reloadResultsVisits());
resultsSearchDateTo.addEventListener("change", () => reloadResultsVisits());

resultsFinalizeBtn.addEventListener("click", async () => {
  if (!activeResultsVisitId) return;
  try {
    const data = await API.request(`/api/visits/${activeResultsVisitId}/finalize-report`, { method: "POST" });
    resultsPrintBtn.disabled = false;
    resultsViewReportBtn.disabled = !hasPermission("view_reports");
    showMessage("resultsMessage", `Report finalized${data.doctorCreated ? ` • ${data.doctor.name} was added to Doctor Setup.` : ""}`);
    reloadResultsVisits();
    loadReceptionSummary();
  } catch (error) {
    showMessage("resultsMessage", error.message, true);
  }
});

resultsPrintBtn.addEventListener("click", async () => {
  if (!activeResultsVisitId) return;
  try {
    await API.request(`/api/visits/${activeResultsVisitId}/print`, { method: "POST" });
    openHtmlReport(activeResultsVisitId, true);
    showMessage("resultsMessage", "Report opened for printing");
  } catch (error) {
    showMessage("resultsMessage", error.message, true);
  }
});

resultsViewReportBtn.addEventListener("click", () => {
  if (activeResultsVisitId && hasPermission("view_reports")) {
    openHtmlReport(activeResultsVisitId, false);
  }
});

resultsSaveAllBtn.addEventListener("click", async () => {
  if (!activeResultsVisitId) return;
  
  const forms = resultsVisitDetails.querySelectorAll("[data-result-form]");
  if (!forms.length) {
    showMessage("resultsMessage", "No result forms to save", true);
    return;
  }

  try {
    let saved = 0;
    for (const form of forms) {
      const visitTestId = Number(form.dataset.visitTestId);
      const parameters = Array.from(form.querySelectorAll("[data-parameter-row]")).map((row) => ({
        parameter_name: row.dataset.parameterName,
        value: row.querySelector("input, textarea")?.value || "",
        unit: row.dataset.unit,
        normal_range: row.dataset.range,
      }));

      // Only save if there are values entered
      if (parameters.some(p => p.value)) {
        await saveResultsForm(form);
        saved++;
      }
    }

    if (saved > 0) {
      showMessage("resultsMessage", `${saved} test result(s) saved successfully`);
    } else {
      showMessage("resultsMessage", "No results with values to save", true);
    }
  } catch (error) {
    showMessage("resultsMessage", error.message, true);
  }
});

// Removed duplicate setDefaultResultsDateRange

const accountsDateInput = document.getElementById("accountsDate");
const refreshAccountsBtn = document.getElementById("refreshAccountsBtn");
const expenseForm = document.getElementById("expenseForm");
const expenseList = document.getElementById("expenseList");
const actualCashAmount = document.getElementById("actualCashAmount");
const actualOnlineAmount = document.getElementById("actualOnlineAmount");
let latestDailyAccounts = null;

// Removed duplicate getLocalDate

function formatPaymentMode(mode) {
  if (mode === "upi") return "UPI";
  if (mode === "card") return "Card";
  return "Cash";
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function renderDailyAccounts(data) {
  latestDailyAccounts = data;

  setText("accountsTotalSales", currency(data.sales?.total || 0));
  setText("accountsBillCount", `${data.sales?.billCount || 0} bills`);
  setText("accountsDuesCleared", currency(data.duesCleared?.total || 0));
  setText("accountsExpenses", currency(data.expenses?.total || 0));
  setText("accountsExpectedTotal", currency(data.expected?.total || 0));
  setText("accountsExpectedCash", currency(data.expected?.cash || 0));
  setText("accountsExpectedOnline", currency(data.expected?.online || 0));
  setText(
    "accountsCashBreakdown",
    `${currency(data.sales?.cash || 0)} sales + ${currency(data.duesCleared?.cash || 0)} dues - ${currency(data.expenses?.cash || 0)} expenses`
  );
  setText(
    "accountsOnlineBreakdown",
    `${currency(data.sales?.online || 0)} sales + ${currency(data.duesCleared?.online || 0)} dues - ${currency(data.expenses?.online || 0)} expenses`
  );

  const expenses = data.expenseRows || [];
  const dateLabel = data.date ? new Date(data.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }) : "today";
  setText("expenseCount", `${expenses.length} ${expenses.length === 1 ? "entry" : "entries"} for ${dateLabel}`);

  if (!expenses.length) {
    expenseList.innerHTML = `<div class="empty-state">No expenses entered for this date.</div>`;
  } else {
    const runningTotal = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    expenseList.innerHTML = expenses
      .map(
        (expense) => `
          <div class="list-item">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
              <div>
                <strong>${escapeHtml(expense.category || "General")}</strong>
                ${expense.vendor_name ? `<span style="color:var(--muted);font-size:0.85rem;"> &bull; ${escapeHtml(expense.vendor_name)}</span>` : ""}
                ${expense.notes ? `<div style="font-size:0.83rem;color:var(--muted);margin-top:2px;">${escapeHtml(expense.notes)}</div>` : ""}
                <div style="font-size:0.78rem;color:var(--muted);margin-top:2px;">${escapeHtml(expense.paid_from || "reception")} &bull; ${new Date(expense.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
              </div>
              <div style="text-align:right;flex-shrink:0;">
                <strong style="font-size:1rem;">${currency(expense.amount)}</strong><br/>
                <span style="font-size:0.82rem;color:var(--muted);">${formatPaymentMode(expense.payment_mode)}</span>
              </div>
            </div>
            <div class="actions-row" style="margin-top:8px;">
              <button class="danger-btn" data-delete-expense="${expense.id}" type="button">Delete</button>
            </div>
          </div>
        `
      )
      .join("") + `<div class="list-item" style="background:var(--bg-alt);font-weight:700;display:flex;justify-content:space-between;"><span>Total Expenses</span><span>${currency(runningTotal)}</span></div>`;

    expenseList.querySelectorAll("[data-delete-expense]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!confirm("Delete this expense?")) return;
        try {
          const response = await API.request(`/api/accounts/expenses/${button.dataset.deleteExpense}`, { method: "DELETE" });
          renderDailyAccounts(response.accounts);
          await loadReceptionSummary();
          showMessage("expenseMessage", "Expense deleted.");
        } catch (error) {
          showMessage("expenseMessage", error.message, true);
        }
      });
    });
  }

  updateAccountVariance();
}

async function loadDailyAccounts() {
  if (getUser()?.role !== "receptionist" || !accountsDateInput) return;

  const date = accountsDateInput.value || getLocalDate();
  accountsDateInput.value = date;

  try {
    const data = await API.request(`/api/accounts/daily?date=${encodeURIComponent(date)}`);
    renderDailyAccounts(data);
  } catch (error) {
    showMessage("expenseMessage", error.message, true);
  }
}

function updateAccountVariance() {
  if (!latestDailyAccounts) return;

  const hasActuals = actualCashAmount.value || actualOnlineAmount.value;
  if (!hasActuals) {
    setText("cashVariance", currency(0));
    setText("onlineVariance", currency(0));
    setText("totalVariance", currency(0));
    setText("accountsCheckMessage", "");
    return;
  }

  const actualCash = Number(actualCashAmount.value || 0);
  const actualOnline = Number(actualOnlineAmount.value || 0);
  const cashDifference = actualCash - Number(latestDailyAccounts.expected?.cash || 0);
  const onlineDifference = actualOnline - Number(latestDailyAccounts.expected?.online || 0);
  const totalDifference = cashDifference + onlineDifference;

  setText("cashVariance", currency(cashDifference));
  setText("onlineVariance", currency(onlineDifference));
  setText("totalVariance", currency(totalDifference));

  setText("accountsCheckMessage", hasActuals && totalDifference === 0 ? "Balanced" : "");
}

function initializeAccounts() {
  if (!accountsDateInput) return;

  accountsDateInput.value = getLocalDate();
  refreshAccountsBtn.addEventListener("click", () => loadDailyAccounts());
  accountsDateInput.addEventListener("change", () => loadDailyAccounts());
  actualCashAmount.addEventListener("input", updateAccountVariance);
  actualOnlineAmount.addEventListener("input", updateAccountVariance);

  expenseForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      // Preserve selected date before form.reset() clears all inputs
      const selectedDate = accountsDateInput.value || getLocalDate();

      const response = await API.request("/api/accounts/expenses", {
        method: "POST",
        body: JSON.stringify({
          expenseDate: selectedDate,
          amount: Number(document.getElementById("expenseAmount").value || 0),
          paymentMode: document.getElementById("expensePaymentMode").value,
          paidFrom: document.getElementById("expensePaidFrom").value,
          category: document.getElementById("expenseCategory").value.trim(),
          vendorId: document.getElementById("expenseVendor").value || null,
          notes: document.getElementById("expenseNotes").value.trim(),
        }),
      });

      expenseForm.reset();
      // Restore the date after reset so the user stays on the same working day
      accountsDateInput.value = selectedDate;

      renderDailyAccounts(response.accounts);
      await loadReceptionSummary();
      showMessage("expenseMessage", "Expense added.");
    } catch (error) {
      showMessage("expenseMessage", error.message, true);
    }
  });

  const saveAccountCheckBtn = document.getElementById("saveAccountCheckBtn");
  if (saveAccountCheckBtn) {
    saveAccountCheckBtn.addEventListener("click", async () => {
      if (!latestDailyAccounts) {
        showMessage("accountsSubmitMessage", "Load accounts first before saving.", true);
        return;
      }

      const cashCounted = Number(actualCashAmount.value || 0);
      const onlineCounted = Number(actualOnlineAmount.value || 0);
      const cashExpected = Number(latestDailyAccounts.expected?.cash || 0);
      const onlineExpected = Number(latestDailyAccounts.expected?.online || 0);
      const totalExpected = Number(latestDailyAccounts.expected?.total || 0);
      const cashVariance = cashCounted - cashExpected;
      const onlineVariance = onlineCounted - onlineExpected;
      const totalVariance = cashVariance + onlineVariance;

      try {
        await API.request("/api/accounts/submit", {
          method: "POST",
          body: JSON.stringify({
            submissionDate: accountsDateInput.value || getLocalDate(),
            cashExpected,
            onlineExpected,
            totalExpected,
            cashCounted,
            onlineCounted,
            cashVariance,
            onlineVariance,
            totalVariance,
          }),
        });
        showMessage("accountsSubmitMessage", "Account check saved successfully.");
      } catch (error) {
        showMessage("accountsSubmitMessage", error.message, true);
      }
    });
  }
}



async function loadVendorsForExpenses() {
  const select = document.getElementById("expenseVendor");
  if (!select) return;
  try {
    const data = await API.request("/api/accounts/vendors");
    const vendors = data.vendors || [];
    select.innerHTML = '<option value="">-- No vendor --</option>' + 
      vendors.map(v => `<option value="${v.id}">${v.name}</option>`).join("");
  } catch (error) {
    console.error("Error loading vendors:", error);
  }
}

async function loadReceptionSummary() {
  const user = getUser();
  try {
    if (["blood_sample_technician", "usg_technician", "mri_technician", "ct_technician"].includes(user?.role)) {
      document.getElementById("receptionistStatsGrid").style.display = "none";
      document.getElementById("technicianStatsGrid").style.display = "grid";
      
      const data = await API.request("/api/visits/technician-summary");
      document.getElementById("summaryPendingReports").textContent = data.pendingReports || 0;
      document.getElementById("summaryTodaySamples").textContent = data.todaySamples || 0;
      document.getElementById("summaryTotalReported").textContent = data.totalReported || 0;
    } else {
      document.getElementById("technicianStatsGrid").style.display = "none";
      document.getElementById("receptionistStatsGrid").style.display = "grid";
      
      const data = await API.request("/api/visits/reception-summary");
      document.getElementById("summaryLabBills").textContent = data.labBills || 0;
      document.getElementById("summaryTotalSales").textContent = currency(data.totalSales || 0);
      document.getElementById("summaryTotalMoney").textContent = currency(data.totalDuesCleared ?? data.totalMoney ?? 0);
    }
  } catch (error) {
    console.error("Error loading summary:", error);
  }
}

// Collection & Delivery Logic
const collectionSearchInput = document.getElementById("collectionSearchInput");
const collectionDateFrom = document.getElementById("collectionDateFrom");
const collectionDateTo = document.getElementById("collectionDateTo");
const collectionList = document.getElementById("collectionList");
const paymentForm = document.getElementById("paymentForm");
const paymentVisitDetails = document.getElementById("paymentVisitDetails");
const paymentVisitId = document.getElementById("paymentVisitId");
const paymentAmount = document.getElementById("paymentAmount");
const paymentMessage = document.getElementById("paymentMessage");

collectionList.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;

  const billPreviewButton = event.target.closest("[data-bill-preview]");
  if (billPreviewButton && collectionList.contains(billPreviewButton)) {
    openHtmlBill(billPreviewButton.dataset.billPreview, false);
    return;
  }

  const billPrintButton = event.target.closest("[data-bill-print]");
  if (billPrintButton && collectionList.contains(billPrintButton)) {
    openHtmlBill(billPrintButton.dataset.billPrint, true);
  }
});

async function loadCollectionVisits(search = "", dateFrom = "", dateTo = "") {
  let url = `/api/visits?query=${encodeURIComponent(search)}`;
  if (dateFrom) url += `&dateFrom=${encodeURIComponent(dateFrom)}`;
  if (dateTo) url += `&dateTo=${encodeURIComponent(dateTo)}`;
  
  const data = await API.request(url);
  
  // Filter for visits that either have due amount or are ready (reported)
  const relevantVisits = data.visits.filter(v => v.amount_due > 0 || v.status === "reported");

  if (!relevantVisits.length) {
    collectionList.innerHTML = `<div class="empty-state">No matching visits found with due amounts or ready reports.</div>`;
    return;
  }

  const user = getUser();
  const canManageBilling = hasPermission("manage_billing");
  const canViewReports = hasPermission("view_reports");
  const canPrintReports = hasPermission("print_reports");
  const canCollectPayments = (isAdministrativeRole(user?.role) || user?.role === "receptionist") && canManageBilling;

  collectionList.innerHTML = relevantVisits
    .map(
      (visit) => `
        <div class="list-item" style="position: relative;">
          <div style="position: absolute; top: 18px; right: 18px; width: 12px; height: 12px; border-radius: 50%; background-color: ${visit.status === 'reported' ? 'var(--primary)' : 'var(--danger)'}; box-shadow: 0 0 8px 1px ${visit.status === 'reported' ? 'var(--primary)' : 'var(--danger)'};" title="${visit.status === 'reported' ? 'Report Ready' : 'Report Not Ready'}"></div>
          <div style="padding-right: 20px;">
            <strong>${visit.bill_no} • ${visit.patient_name}</strong><br />
            <span>${visit.tests || "No tests"} • Due: <strong>${currency(visit.amount_due)}</strong></span>
          </div>
          <div class="actions-row">
            ${canManageBilling ? `<button class="secondary-btn" data-bill-preview="${visit.id}" type="button">Preview Bill</button>` : ""}
            ${canManageBilling ? `<button class="ghost-btn" data-bill-print="${visit.id}" type="button">Print Bill</button>` : ""}
            ${visit.amount_due > 0 && canCollectPayments ? `<button class="primary-btn" data-collect-payment="${visit.id}" data-due="${visit.amount_due}" data-bill="${visit.bill_no}" data-patient="${visit.patient_name}" type="button">Collect Due</button>` : ""}
            ${visit.amount_paid > 0 && canCollectPayments ? `<button class="ghost-btn" data-issue-refund="${visit.id}" data-bill="${visit.bill_no}" data-patient="${visit.patient_name}" data-paid="${visit.amount_paid}" type="button">Refund</button>` : ""}
            ${visit.status === "reported" && canViewReports ? `<button class="secondary-btn" data-view-report="${visit.id}" type="button">View Report</button>` : ""}
            ${visit.status === "reported" && canPrintReports ? `<button class="ghost-btn" data-print-report="${visit.id}" type="button">Print Report</button>` : ""}
          </div>
        </div>
      `
    )
    .join("");

  collectionList.querySelectorAll("[data-collect-payment]").forEach((button) => {
    button.addEventListener("click", () => {
      paymentForm.hidden = false;
      refundForm.hidden = true;
      paymentVisitId.value = button.dataset.collectPayment;
      paymentAmount.value = button.dataset.due;
      paymentAmount.max = button.dataset.due;
      paymentVisitDetails.textContent = `${button.dataset.patient} (Bill: ${button.dataset.bill}) - Due: ${currency(button.dataset.due)}`;
      paymentMessage.textContent = "";
      paymentForm.scrollIntoView({ behavior: "smooth" });
    });
  });

  collectionList.querySelectorAll("[data-issue-refund]").forEach((button) => {
    button.addEventListener("click", () => {
      refundForm.hidden = false;
      paymentForm.hidden = true;
      document.getElementById("refundVisitId").value = button.dataset.issueRefund;
      document.getElementById("refundBillNo").value = button.dataset.bill;
      document.getElementById("refundAmount").value = "";
      document.getElementById("refundNote").value = "";
      document.getElementById("refundVisitDetails").textContent = `${button.dataset.patient} (Bill: ${button.dataset.bill}) — Paid: ${currency(button.dataset.paid)}`;
      document.getElementById("refundMessage").textContent = "";
      refundForm.scrollIntoView({ behavior: "smooth" });
    });
  });

  collectionList.querySelectorAll("[data-view-report]").forEach((button) => {
    button.addEventListener("click", () => openHtmlReport(button.dataset.viewReport, false));
  });

  collectionList.querySelectorAll("[data-print-report]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await API.request(`/api/visits/${button.dataset.printReport}/print`, { method: "POST" });
        openHtmlReport(button.dataset.printReport, true);
      } catch (error) {
        showMessage("collectionMessage", error.message, true);
      }
    });
  });

}

document.getElementById("cancelPaymentBtn").addEventListener("click", () => {
  paymentForm.hidden = true;
  paymentVisitId.value = "";
  paymentAmount.value = "";
});

paymentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const visitId = paymentVisitId.value;
  const amount = paymentAmount.value;
  const mode = document.getElementById("paymentCollectionMode").value;

  if (!visitId || !amount) return;

  const popup = window.open("", "_blank");
  if (popup) popup.document.write("Processing payment...");

  try {
    await API.request(`/api/visits/${visitId}/payment`, {
      method: "PATCH",
      body: JSON.stringify({ amountPaid: amount, paymentMode: mode }),
    });

    showMessage("paymentMessage", "Payment collected successfully.");
    paymentForm.hidden = true;
    paymentVisitId.value = "";
    paymentAmount.value = "";
    
    // Reload lists
    loadCollectionVisits(collectionSearchInput.value.trim(), collectionDateFrom.value, collectionDateTo.value);
    reloadRecentVisits();
    loadReceptionSummary();
    loadDailyAccounts();

    // Auto-generate and print the bill
    openHtmlBill(visitId, true, popup);
  } catch (error) {
    if (popup) popup.close();
    showMessage("paymentMessage", error.message, true);
  }
});

// Refund form wiring
const refundForm = document.getElementById("refundForm");

document.getElementById("cancelRefundBtn").addEventListener("click", () => {
  refundForm.hidden = true;
});

refundForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const billNo = document.getElementById("refundBillNo").value;
  const amount = Number(document.getElementById("refundAmount").value);
  const mode = document.getElementById("refundPaymentMode").value;
  const note = document.getElementById("refundNote").value.trim();

  if (!amount || amount <= 0) {
    showMessage("refundMessage", "Enter a valid refund amount.", true);
    return;
  }

  try {
    await API.request("/api/accounts/expenses", {
      method: "POST",
      body: JSON.stringify({
        expenseDate: getLocalDate(),
        amount,
        paymentMode: mode,
        paidFrom: "reception",
        category: "Patient Refund",
        notes: `Bill ${billNo}${note ? " — " + note : ""}`,
      }),
    });

    showMessage("refundMessage", "Refund logged successfully. It will appear in today's Financial Report.");
    document.getElementById("refundAmount").value = "";
    document.getElementById("refundNote").value = "";
    loadDailyAccounts();
    loadReceptionSummary();
  } catch (error) {
    showMessage("refundMessage", error.message, true);
  }
});

async function reloadCollectionVisits() {
  const search = collectionSearchInput.value.trim();
  const dateFrom = collectionDateFrom.value;
  const dateTo = collectionDateTo.value;
  return await loadCollectionVisits(search, dateFrom, dateTo);
}

collectionSearchInput.addEventListener("input", reloadCollectionVisits);
collectionDateFrom.addEventListener("change", reloadCollectionVisits);
collectionDateTo.addEventListener("change", reloadCollectionVisits);

// Removed duplicate setDefaultCollectionDateRange

// -- Price Inquiry ----------------------------------------------------------
function mapToInquiryCategory(test) {
  const cat = (test.category || "").toUpperCase();
  const name = (test.name || "").toUpperCase();
  
  if (cat === "MRI") return "MRI";
  if (cat === "CT SCAN") return "CT Scan";
  
  // USG detection
  if (name.includes("USG") || name.includes("ULTRASOUND") || name.includes("SONO")) return "USG";
  if (cat.includes("RADIOLOGY") || cat.includes("IMAGING")) {
    if (name.includes("USG") || name.includes("ULTRASOUND")) return "USG";
    if (cat === "CT SCAN") return "CT Scan";
    if (cat === "MRI") return "MRI";
  }

  // Outside categories (Biopsy, Histopathology, Specialized tests)
  const outsideCats = ["BIOPSY", "HISTOPATHOLOGY", "CYTOLOGY", "GENETICS", "MOLECULAR", "MICROBIOLOGY"];
  if (outsideCats.some(oc => cat.includes(oc))) return "Outside";
  if (name.includes("OUTSIDE")) return "Outside";

  // Blood categories
  const bloodCats = ["HEMATOLOGY", "HAEMATOLOGY", "BIOCHEMISTRY", "SEROLOGY", "HORMONES", "ELECTROLYTES", "ENDOCRINOLOGY", "IMMUNOLOGY", "CHEMISTRY", "CLINICAL PATHOLOGY", "PROFILE"];
  if (bloodCats.some(bc => cat.includes(bc))) return "Blood";

  return "Blood"; // Fallback
}


let priceInquiryTests = [];
let priceInquiryQuote = [];
let priceInquiryInitialized = false;

async function initPriceInquiry() {
  try {
    const data = await API.request("/api/tests?query=");
    priceInquiryTests = (data.tests || []).map(t => ({
      ...t,
      inquiryCategory: mapToInquiryCategory(t)
    }));

    const categories = ["Blood", "Outside", "CT Scan", "USG", "MRI"];
    const catSelect = document.getElementById("priceInquiryCategory");
    if (catSelect) {
      const selectedCategory = catSelect.value;
      catSelect.innerHTML = '<option value="">All Categories</option>' +
        categories.map(c => `<option value="${c}">${c}</option>`).join("");
      catSelect.value = categories.includes(selectedCategory) ? selectedCategory : "";
    }

    if (!priceInquiryInitialized) {
      priceInquiryInitialized = true;

      if (catSelect) catSelect.addEventListener("change", renderPriceInquiryList);

      const searchInput = document.getElementById("priceInquirySearch");
      if (searchInput) searchInput.addEventListener("input", renderPriceInquiryList);

      const tabGroup = document.getElementById("priceInquiryTabGroup");
      if (tabGroup) {
        tabGroup.querySelectorAll(".tab-btn").forEach(btn => {
          btn.addEventListener("click", () => setPriceInquiryMode(btn.dataset.priceTab));
        });
      }

      const outsideAddBtn = document.getElementById("addPriceInquiryOutsideTestBtn");
      if (outsideAddBtn) outsideAddBtn.addEventListener("click", addPriceInquiryOutsideTest);

      const clearBtn = document.getElementById("clearQuoteBtn");
      if (clearBtn) clearBtn.addEventListener("click", () => {
        priceInquiryQuote = [];
        renderQuoteList();
      });

      const copyBtn = document.getElementById("copyQuoteBtn");
      if (copyBtn) copyBtn.addEventListener("click", copyQuoteToClipboard);
    }
  } catch (err) {
    console.error("Error initializing price inquiry:", err);
  }

  renderPriceInquiryList();
  renderQuoteList();
}

let priceInquiryMode = "inlab";

function setPriceInquiryMode(mode) {
  priceInquiryMode = mode;
  document.querySelectorAll("#priceInquiryTabGroup .tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.priceTab === mode);
  });
  const inlabContent = document.getElementById("inlabInquiryContent");
  const outsideContent = document.getElementById("outsideInquiryContent");
  if (inlabContent) inlabContent.hidden = mode !== "inlab";
  if (outsideContent) outsideContent.hidden = mode !== "outside";
  if (mode === "inlab") renderPriceInquiryList();
}

function addPriceInquiryOutsideTest() {
  const nameInput = document.getElementById("priceInquiryOutsideTestName");
  const priceInput = document.getElementById("priceInquiryOutsideTestPrice");
  const labInput = document.getElementById("priceInquiryOutsideLabName");
  if (!nameInput || !priceInput || !labInput) return;

  const name = nameInput.value.trim();
  const price = Number(priceInput.value || 0);
  const outsideLab = labInput.value.trim() || "Outside";

  if (!name || price <= 0) {
    alert("Please enter a valid outside test name and price.");
    return;
  }

  priceInquiryQuote.push({
    id: `custom-${Date.now()}-${Math.random()}`,
    name,
    code: "OUTSIDE",
    category: outsideLab,
    price,
    isCustom: true,
    outsideLab
  });

  nameInput.value = "";
  priceInput.value = "";
  renderQuoteList();
}

function renderPriceInquiryList() {
  const catEl = document.getElementById("priceInquiryCategory");
  const searchEl = document.getElementById("priceInquirySearch");
  const list = document.getElementById("priceInquiryList");
  if (!list || !catEl || !searchEl) return;

  const category = catEl.value;
  const search = searchEl.value.toLowerCase().trim();
  
  let filtered = priceInquiryTests;
  if (category) filtered = filtered.filter(t => t.inquiryCategory === category);
  if (search) filtered = filtered.filter(t => 
    t.name.toLowerCase().includes(search) || 
    (t.code && t.code.toLowerCase().includes(search)) ||
    (t.category && t.category.toLowerCase().includes(search))
  );
  
  // Sort alphabetically
  filtered.sort((a, b) => a.name.localeCompare(b.name));
  
  list.innerHTML = filtered.map(t => `
    <div class="list-item">
      <div>
        <strong>${escapeHtml(t.name)}</strong> (${escapeHtml(t.code || "-")})<br/>
        <span>${escapeHtml(t.category)} • <strong>${currency(t.price)}</strong></span>
      </div>
      <button class="secondary-btn" data-add-to-quote="${t.id}">Add to Quote</button>
    </div>
  `).join("");
  
  list.querySelectorAll("[data-add-to-quote]").forEach(btn => {
    btn.addEventListener("click", () => {
      const test = priceInquiryTests.find(t => t.id === Number(btn.dataset.addToQuote));
      if (test) {
        priceInquiryQuote.push(test);
        renderQuoteList();
      }
    });
  });
}

function renderQuoteList() {
  const list = document.getElementById("quoteList");
  const totalEl = document.getElementById("quoteTotal");
  const countEl = document.getElementById("quoteCount");
  if (!list || !totalEl || !countEl) return;
  
  if (priceInquiryQuote.length === 0) {
    list.innerHTML = '<div class="empty-state">Add tests from the left to calculate total quote.</div>';
    totalEl.textContent = currency(0);
    countEl.textContent = "0 tests selected";
    return;
  }
  
  list.innerHTML = priceInquiryQuote.map((t, index) => `
    <div class="list-item">
      <div>
        <strong>${escapeHtml(t.name)}</strong><br/>
        <span>${escapeHtml(t.isCustom ? `Outside ${t.outsideLab || "Lab"}` : `${t.category || "Lab"}`)} • ${currency(t.price)}</span>
      </div>
      <button class="ghost-btn" data-remove-quote="${index}">&times;</button>
    </div>
  `).join("");
  
  const total = priceInquiryQuote.reduce((s, t) => s + Number(t.price), 0);
  totalEl.textContent = currency(total);
  countEl.textContent = priceInquiryQuote.length + " tests selected";
  
  list.querySelectorAll("[data-remove-quote]").forEach(btn => {
    btn.addEventListener("click", () => {
      priceInquiryQuote.splice(Number(btn.dataset.removeQuote), 1);
      renderQuoteList();
    });
  });
}

function copyQuoteToClipboard() {
  if (priceInquiryQuote.length === 0) return;
  const total = priceInquiryQuote.reduce((s, t) => s + Number(t.price), 0);
  const text = `Test Quote:\n${priceInquiryQuote.map(t => `- ${t.name}: ${currency(t.price)}`).join("\n")}\nTotal: ${currency(total)}`;
  navigator.clipboard.writeText(text).then(() => alert("Quote copied to clipboard!")).catch(err => console.error("Failed to copy quote", err));
}


(async function init() {
  try {
    if (window.location.hash === "" || window.location.hash === "#") {
      window.location.hash = "#new-visit";
    }

    initializeNavigation();
    if (newPatientBillingHistoryCard) {
      newPatientBillingHistoryCard.hidden = getUser()?.role !== "receptionist";
    }
    initializeAccounts();
    renderSelectedDoctor();
    renderSelectedTests();
    renderEditSelectedTests();
    renderGeneratedBillActions();
    
    const regTimeInput = document.getElementById("registrationTime");
    if (regTimeInput) regTimeInput.value = getLocalDatetime();

    if (hasPermission("manage_tests") && openTestCatalogBtn) {
      openTestCatalogBtn.hidden = false;
      openTestCatalogBtn.addEventListener("click", () => {
        window.location.href = "test-catalog.html";
      });
    }

    setDefaultDateRange();
    setDefaultResultsDateRange();
    setDefaultCollectionDateRange();
    
    // loadAssociates called at top level
    
    reloadRecentVisits().catch(e => console.error("Recent visits load failed", e));
    loadVendorsForExpenses().catch(e => console.error("Vendors load failed", e));
    reloadPatientSearch().catch(e => console.error("Patient search load failed", e));
    reloadResultsVisits().catch(e => console.error("Results visits load failed", e));
    loadReceptionSummary().catch(e => console.error("Summary load failed", e));

    if (window.location.hash === "#daily-accounts") {
      loadDailyAccounts().catch(e => console.error("Daily accounts load failed", e));
    }
  } catch (err) {
    console.error("Initialization error:", err);
  }
})();
