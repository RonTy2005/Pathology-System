const currentAdminUser = protectPage(["admin", "manager"]);

const overviewCards = document.getElementById("overviewCards");
const userList = document.getElementById("userList");
const doctorList = document.getElementById("doctorList");
const auditLog = document.getElementById("auditLog");
const associateList = document.getElementById("associateList");
const testList = document.getElementById("testList");
const permissionGrid = document.getElementById("permissionGrid");
const accessControlGrid = document.getElementById("accessControlGrid");
const idCardCanvas = document.getElementById("idCardCanvas");
const idCardSummary = document.getElementById("idCardSummary");
const idCardSearch = document.getElementById("idCardSearch");
const idCardSearchResults = document.getElementById("idCardSearchResults");
const testCatalogSearch = document.getElementById("testCatalogSearch");
const usernameInput = document.getElementById("newUsername");
const passwordInput = document.getElementById("newPassword");
const usernameLabel = document.getElementById("usernameLabel");
const passwordLabel = document.getElementById("passwordLabel");
const credentialHelp = document.getElementById("credentialHelp");
const workspaceEmptyState = document.getElementById("workspaceEmptyState");
const financialDateFrom = document.getElementById("financialDateFrom");
const financialDateTo = document.getElementById("financialDateTo");
const financialSummaryCards = document.getElementById("financialSummaryCards");
const doctorCommissionList = document.getElementById("doctorCommissionList");
const associateCommissionList = document.getElementById("associateCommissionList");
const dueReportDoctorFilter = document.getElementById("dueReportDoctorFilter");
const dueReportSummaryCards = document.getElementById("dueReportSummaryCards");
const dueReportList = document.getElementById("dueReportList");
const salaryForm = document.getElementById("salaryForm");
const salaryPaymentForm = document.getElementById("salaryPaymentForm");
const salaryList = document.getElementById("salaryList");
const salarySummaryCards = document.getElementById("salarySummaryCards");
const auditDueReportDateFrom = document.getElementById("auditDueReportDateFrom");
const auditDueReportDateTo = document.getElementById("auditDueReportDateTo");
const auditDueReportSummary = document.getElementById("auditDueReportSummary");
const auditDueReportList = document.getElementById("auditDueReportList");
const patientDataDateFrom = document.getElementById("patientDataDateFrom");
const patientDataDateTo = document.getElementById("patientDataDateTo");
const downloadPatientDataCsvBtn = document.getElementById("downloadPatientDataCsvBtn");
const patientDataMessage = document.getElementById("patientDataMessage");

const editingDoctorId = document.getElementById("editingDoctorId");
const doctorNameInput = document.getElementById("doctorName");
const doctorPhoneInput = document.getElementById("doctorPhone");
const doctorSpecializationInput = document.getElementById("doctorSpecialization");
const doctorCommissionInput = document.getElementById("doctorCommission");
const doctorCommissionRules = document.getElementById("doctorCommissionRules");
const addDoctorRuleBtn = document.getElementById("addDoctorRuleBtn");
const saveDoctorBtn = document.getElementById("saveDoctorBtn");
const clearDoctorFormBtn = document.getElementById("clearDoctorFormBtn");

const ROLE_DEFAULTS = {
  na: [],
  receptionist: ["manage_patients", "manage_billing", "view_reports"],
  blood_sample_technician: ["manage_patients", "manage_billing", "view_reports", "enter_results", "finalize_reports", "print_reports"],
  usg_technician: ["manage_patients", "manage_billing", "view_reports", "enter_results", "finalize_reports", "print_reports"],
  mri_technician: ["manage_patients", "manage_billing", "view_reports", "enter_results", "finalize_reports", "print_reports"],
  ct_technician: ["view_reports"],
  manager: [
    "manage_patients",
    "manage_billing",
    "view_reports",
    "download_reports",
    "print_reports",
    "manage_tests",
    "manage_doctors",
    "manage_associates",
  ],
  admin: [
    "manage_patients",
    "manage_billing",
    "delete_patients",
    "view_reports",
    "download_reports",
    "enter_results",
    "finalize_reports",
    "print_reports",
    "manage_users",
    "manage_tests",
    "manage_doctors",
    "manage_associates",
    "manage_id_cards",
  ],
};

const PERMISSION_LABELS = [
  ["manage_patients", "Patient registration"],
  ["manage_billing", "Billing and bill access"],
  ["delete_patients", "Delete patients"],
  ["view_reports", "View reports"],
  ["download_reports", "WhatsApp PDF"],
  ["enter_results", "Enter test results"],
  ["finalize_reports", "Finalize reports"],
  ["print_reports", "Print reports"],
  ["manage_users", "Manage users"],
  ["manage_tests", "Manage tests"],
  ["manage_doctors", "Manage doctors"],
  ["manage_associates", "Manage associates"],
  ["manage_id_cards", "Edit ID cards"],
];
const PERMISSION_LABEL_MAP = Object.fromEntries(PERMISSION_LABELS);

const ACCESS_CONTROL_LABELS = [
  ["multiple_report_print", "Multiple report printing of a patient"],
  ["multiple_report_edit", "Editing report of a patient multiple times"],
  ["multiple_bill_print", "Multiple bill print of a patient"],
  ["add_doctor", "Entry of new doctor"],
  ["add_associate", "Entry of associate"],
  ["edit_patient_details", "Edit patient details"],
];

const ROLE_ACCESS_CONTROL_DEFAULTS = {
  na: {
    multiple_report_print: false,
    multiple_report_edit: false,
    multiple_bill_print: false,
    add_doctor: false,
    add_associate: false,
    edit_patient_details: false,
  },
  receptionist: {
    multiple_report_print: false,
    multiple_report_edit: false,
    multiple_bill_print: false,
    add_doctor: false,
    add_associate: false,
    edit_patient_details: true,
  },
  blood_sample_technician: {
    multiple_report_print: false,
    multiple_report_edit: false,
    multiple_bill_print: false,
    add_doctor: false,
    add_associate: false,
    edit_patient_details: false,
  },
  usg_technician: {
    multiple_report_print: false,
    multiple_report_edit: false,
    multiple_bill_print: false,
    add_doctor: false,
    add_associate: false,
    edit_patient_details: false,
  },
  mri_technician: {
    multiple_report_print: false,
    multiple_report_edit: false,
    multiple_bill_print: false,
    add_doctor: false,
    add_associate: false,
    edit_patient_details: false,
  },
  ct_technician: {
    multiple_report_print: false,
    multiple_report_edit: false,
    multiple_bill_print: false,
    add_doctor: false,
    add_associate: false,
    edit_patient_details: false,
  },
  manager: {
    multiple_report_print: true,
    multiple_report_edit: false,
    multiple_bill_print: true,
    add_doctor: true,
    add_associate: true,
    edit_patient_details: true,
  },
  admin: {
    multiple_report_print: false,
    multiple_report_edit: false,
    multiple_bill_print: false,
    add_doctor: true,
    add_associate: true,
    edit_patient_details: true,
  },
};

const ID_CARD_BACKGROUND_SRC = "assets/we-care-id-card-bg.jpg";
const ID_CARD_ADDRESS = "Kalna, Purba Bardhaman";
const ID_CARD_PHONE = "7872122767";

let selectedProfileImage = "";
let selectedUserForCard = null;
let usersCache = [];
let doctorsCache = [];
let testsCache = [];
let idCardBackgroundPromise = null;
let sectionNavigationInitialized = false;
let testCategories = [];

const ADMIN_ONLY_WINDOWS = new Set([
  "#window-employee-management",
  "#window-id-card-studio",
  "#window-system-actions",
  "#window-due-reports-audit",
]);

function isDefaultSystemAdministrator() {
  return currentAdminUser?.username === "admin";
}

function isAdminRole() {
  return currentAdminUser?.role === "admin";
}

function canOpenWindow(hash) {
  return isAdminRole() || !ADMIN_ONLY_WINDOWS.has(hash);
}

function configureSectionAccess() {
  if (isAdminRole()) return;

  document.querySelectorAll(".sidebar-nav a").forEach((link) => {
    if (ADMIN_ONLY_WINDOWS.has(link.getAttribute("href"))) {
      link.hidden = true;
    }
  });
}

function canManageTests() {
  return isDefaultSystemAdministrator() || hasPermission("manage_tests");
}

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

function getSelectedPermissions() {
  return Array.from(permissionGrid.querySelectorAll("input[type='checkbox']:checked")).map((input) => input.value);
}

function getSelectedAccessControls() {
  return ACCESS_CONTROL_LABELS.reduce((controls, [key]) => {
    controls[key] = Boolean(accessControlGrid.querySelector(`input[value='${key}']`)?.checked);
    return controls;
  }, {});
}

function setPermissionSelection(selectedPermissions) {
  permissionGrid.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.checked = selectedPermissions.includes(input.value);
  });
}

function renderPermissionGrid(role = document.getElementById("role").value, selectedPermissions = ROLE_DEFAULTS[role] || []) {
  permissionGrid.innerHTML = PERMISSION_LABELS
    .map(
      ([value, label]) => `
        <label class="permission-item">
          <input type="checkbox" value="${value}" ${selectedPermissions.includes(value) ? "checked" : ""} />
          <span>${label}</span>
        </label>
      `
    )
    .join("");
}

function renderAccessControlGrid(selectedControls = {}) {
  accessControlGrid.innerHTML = ACCESS_CONTROL_LABELS
    .map(
      ([value, label]) => `
        <label class="permission-item">
          <input type="checkbox" value="${value}" ${selectedControls[value] ? "checked" : ""} />
          <span>${label}</span>
        </label>
      `
    )
    .join("");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read image"));
    reader.readAsDataURL(file);
  });
}

function buildIdCardData(user) {
  return {
    name: user.full_name || user.fullName || user.username || "",
    role: user.employment_title || user.employmentTitle || user.role || "",
    employeeCode: user.employee_code || user.employeeCode || "",
    joiningDate: user.joining_date || user.joiningDate || "",
    username: user.username || "",
    profileImage: user.profile_image || user.profileImage || "",
  };
}

function loadCanvasImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load image: ${src}`));
    image.src = src;
  });
}

function getIdCardBackground() {
  if (!idCardBackgroundPromise) {
    idCardBackgroundPromise = loadCanvasImage(ID_CARD_BACKGROUND_SRC).catch((error) => {
      idCardBackgroundPromise = null;
      throw error;
    });
  }

  return idCardBackgroundPromise;
}

function drawCoverImage(ctx, image, x, y, width, height) {
  const targetRatio = width / height;
  const sourceRatio = image.width / image.height;
  let sourceWidth = image.width;
  let sourceHeight = image.height;
  let sourceX = 0;
  let sourceY = 0;

  if (sourceRatio > targetRatio) {
    sourceWidth = image.height * targetRatio;
    sourceX = (image.width - sourceWidth) / 2;
  } else {
    sourceHeight = image.width / targetRatio;
    sourceY = (image.height - sourceHeight) / 2;
  }

  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

async function drawIdCard(user) {
  const ctx = idCardCanvas.getContext("2d");
  const card = buildIdCardData(user);
  let background = null;

  ctx.clearRect(0, 0, idCardCanvas.width, idCardCanvas.height);
  ctx.fillStyle = "#f8fbff";
  ctx.fillRect(0, 0, idCardCanvas.width, idCardCanvas.height);

  try {
    background = await getIdCardBackground();
    drawCoverImage(ctx, background, 0, 0, idCardCanvas.width, idCardCanvas.height);
  } catch (_error) {
    const fallback = ctx.createLinearGradient(0, 0, idCardCanvas.width, idCardCanvas.height);
    fallback.addColorStop(0, "#e7f1fb");
    fallback.addColorStop(1, "#bfd5ef");
    ctx.fillStyle = fallback;
    ctx.fillRect(0, 0, idCardCanvas.width, idCardCanvas.height);
  }

  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.fillRect(0, 0, idCardCanvas.width, idCardCanvas.height);

  drawRoundedRect(ctx, 34, 34, 832, 472, 30);
  ctx.fillStyle = "rgba(255,255,255,0.90)";
  ctx.fill();
  ctx.strokeStyle = "rgba(31, 78, 136, 0.22)";
  ctx.lineWidth = 2;
  ctx.stroke();

  drawRoundedRect(ctx, 48, 48, 804, 108, 24);
  ctx.fillStyle = "rgba(11, 55, 105, 0.92)";
  ctx.fill();

  ctx.fillStyle = "#dd4042";
  ctx.fillRect(48, 128, 804, 28);

  drawRoundedRect(ctx, 66, 64, 140, 74, 18);
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.fill();
  ctx.strokeStyle = "rgba(15, 63, 120, 0.18)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (background) {
    ctx.save();
    drawRoundedRect(ctx, 72, 70, 128, 62, 16);
    ctx.clip();
    ctx.drawImage(
      background,
      background.width * 0.26,
      background.height * 0.18,
      background.width * 0.48,
      background.height * 0.28,
      72,
      70,
      128,
      62
    );
    ctx.restore();
  } else {
    ctx.fillStyle = "#0f3f78";
    ctx.font = "700 20px Trebuchet MS";
    ctx.fillText("WC", 116, 107);
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 30px Trebuchet MS";
  ctx.fillText("We Care Diagnostic Centre", 228, 93);
  ctx.font = "600 17px Trebuchet MS";
  ctx.fillStyle = "#dce9f9";
  ctx.fillText("Professional Staff Identity Card", 229, 121);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 14px Trebuchet MS";
  ctx.fillText(ID_CARD_ADDRESS, 610, 84);
  ctx.fillText(`Phone: ${ID_CARD_PHONE}`, 610, 107);
  ctx.fillStyle = "#ffe6e6";
  ctx.font = "700 13px Trebuchet MS";
  ctx.fillText("AUTHORIZED PERSONNEL ONLY", 610, 130);

  drawRoundedRect(ctx, 58, 180, 210, 258, 24);
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.fill();
  ctx.strokeStyle = "rgba(31, 78, 136, 0.18)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  drawRoundedRect(ctx, 290, 180, 538, 258, 24);
  ctx.fillStyle = "rgba(12, 48, 93, 0.91)";
  ctx.fill();

  ctx.fillStyle = "#d73b3e";
  ctx.fillRect(290, 180, 538, 10);

  ctx.fillStyle = "#dbeafe";
  ctx.font = "700 14px Trebuchet MS";
  ctx.fillText("EMPLOYEE DETAILS", 320, 210);

  const renderText = () => {
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 36px Trebuchet MS";
    ctx.fillText(card.name || "Unnamed Staff", 320, 254);
    ctx.font = "600 21px Trebuchet MS";
    ctx.fillStyle = "#cfe2ff";
    ctx.fillText(String(card.role || "staff").toUpperCase(), 320, 290);

    ctx.fillStyle = "#ffffff";
    ctx.font = "600 18px Trebuchet MS";
    ctx.fillText(`Employee ID`, 320, 334);
    ctx.fillText(`Username`, 320, 372);
    ctx.fillText(`Joining Date`, 320, 410);

    ctx.fillStyle = "#ffe8b3";
    ctx.font = "700 19px Trebuchet MS";
    ctx.fillText(`: ${card.employeeCode || "-"}`, 468, 334);
    ctx.fillText(`: ${card.username || "-"}`, 468, 372);
    ctx.fillText(`: ${card.joiningDate || "-"}`, 468, 410);

    ctx.fillStyle = "#dbeafe";
    ctx.font = "500 14px Trebuchet MS";
    ctx.fillText("If found, please return to We Care Diagnostic Centre.", 320, 463);
  };

  ctx.fillStyle = "#0f3f78";
  ctx.font = "700 15px Trebuchet MS";
  ctx.fillText("Photo identification", 74, 462);
  ctx.font = "500 13px Trebuchet MS";
  ctx.fillStyle = "#47698f";
  ctx.fillText("This card is valid only for official work.", 74, 484);

  ctx.fillStyle = "#0f3f78";
  ctx.fillRect(48, 456, 804, 24);
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 13px Trebuchet MS";
  ctx.fillText(`Address: ${ID_CARD_ADDRESS}`, 68, 472);
  ctx.fillText(`Contact: ${ID_CARD_PHONE}`, 606, 472);

  if (!card.profileImage) {
    ctx.fillStyle = "#cbd5e1";
    drawRoundedRect(ctx, 71, 194, 184, 226, 20);
    ctx.fill();
    ctx.fillStyle = "#334155";
    ctx.font = "600 22px Trebuchet MS";
    ctx.fillText("No image", 112, 313);
    renderText();
    return;
  }

  try {
    const image = await loadCanvasImage(card.profileImage);
    ctx.save();
    drawRoundedRect(ctx, 71, 194, 184, 226, 20);
    ctx.clip();
    drawCoverImage(ctx, image, 71, 194, 184, 226);
    ctx.restore();

    ctx.strokeStyle = "rgba(15, 63, 120, 0.18)";
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, 71, 194, 184, 226, 20);
    ctx.stroke();
    renderText();
  } catch (_error) {
    ctx.fillStyle = "#cbd5e1";
    drawRoundedRect(ctx, 71, 194, 184, 226, 20);
    ctx.fill();
    ctx.fillStyle = "#334155";
    ctx.font = "600 22px Trebuchet MS";
    ctx.fillText("No image", 112, 313);
    renderText();
  }
}

function setCardUser(user) {
  selectedUserForCard = user;
  if (!user) {
    idCardSummary.textContent = "Search an employee by name or username to generate the ID card.";
    idCardSummary.className = "selection-card empty";
    drawIdCard({});
    return;
  }

  idCardSummary.className = "selection-card";
  idCardSummary.innerHTML = `
    <strong>${user.full_name || user.fullName || user.username}</strong><br />
    <span>${user.employment_title || user.employmentTitle || user.role} • ${user.employee_code || user.employeeCode || "-"} • Joined ${formatDate(user.joining_date || user.joiningDate)}</span>
  `;
  drawIdCard(user);
}

function normalizeSearchText(value) {
  return String(value || "").trim().toLowerCase();
}

function renderIdCardSearchResults(query = "") {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    idCardSearchResults.innerHTML = "";
    return;
  }

  const matches = usersCache
    .filter((user) => {
      const fullName = normalizeSearchText(user.full_name || user.fullName);
      const username = normalizeSearchText(user.username);
      return fullName.includes(normalizedQuery) || username.includes(normalizedQuery);
    })
    .slice(0, 8);

  if (!matches.length) {
    idCardSearchResults.innerHTML = `
      <div class="list-item">
        <strong>No matching employee</strong><br />
        <span>Try searching with full name or username.</span>
      </div>
    `;
    return;
  }

  idCardSearchResults.innerHTML = matches
    .map(
      (user) => `
        <button class="list-item result-btn" data-id-card-user="${user.id}" type="button">
          <strong>${user.full_name || user.username}</strong><br />
          <span>${user.username} • ${user.employment_title || user.role} • ${user.employee_code || "-"}</span>
        </button>
      `
    )
    .join("");

  idCardSearchResults.querySelectorAll("[data-id-card-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      const dataForUser = await API.request(`/api/users/${button.dataset.idCardUser}`);
      setCardUser(dataForUser.user);
      idCardSearch.value = dataForUser.user.full_name || dataForUser.user.username || "";
      idCardSearchResults.innerHTML = "";
    });
  });
}

function renderPermissionGrid(role = document.getElementById("role")?.value || "na", permissions = ROLE_DEFAULTS[role] || []) {
  const selectedPermissions = Array.isArray(permissions) ? permissions : [];
  permissionGrid.innerHTML = PERMISSION_LABELS.map(([key, label]) => `
    <label class="permission-item">
      <input type="checkbox" data-permission="${key}" ${selectedPermissions.includes(key) ? 'checked' : ''} />
      <span>${label}</span>
    </label>
  `).join('');
}

function setPermissionSelection(permissions = []) {
  const selectedPermissions = Array.isArray(permissions) ? permissions : [];
  PERMISSION_LABELS.forEach(([key]) => {
    const checkbox = permissionGrid.querySelector(`[data-permission="${key}"]`);
    if (checkbox) checkbox.checked = selectedPermissions.includes(key);
  });
}

function getSelectedPermissions() {
  return Array.from(permissionGrid.querySelectorAll('input[data-permission]:checked')).map(cb => cb.dataset.permission);
}

function resetUserForm() {
  document.getElementById("userForm").reset();
  document.getElementById("editingUserId").value = "";
  usernameInput.disabled = false;
  usernameInput.required = true;
  passwordInput.required = true;
  passwordInput.disabled = false;
  document.getElementById("saveUserBtn").textContent = "Create user";
  selectedProfileImage = "";
  usernameLabel.textContent = "Username";
  passwordLabel.textContent = "Password";
  usernameInput.placeholder = "";
  passwordInput.placeholder = "";
  credentialHelp.textContent = "Set the username and password for the new employee account.";
  applyRoleDefaults(document.getElementById("role").value);
}

function configureCredentialFieldsForEdit(user) {
  const canRecoverLogin = isDefaultSystemAdministrator() && !user.is_protected_system_admin;

  usernameLabel.textContent = canRecoverLogin ? "Username / Login ID" : "Username";
  passwordLabel.textContent = canRecoverLogin ? "Reset password" : "Password";
  usernameInput.disabled = !canRecoverLogin;
  usernameInput.required = true;
  passwordInput.disabled = !canRecoverLogin;
  passwordInput.required = false;
  passwordInput.value = "";
  usernameInput.placeholder = canRecoverLogin ? "Update login ID if user forgot it" : "";
  passwordInput.placeholder = canRecoverLogin ? "Leave blank to keep current password" : "";
  credentialHelp.textContent = canRecoverLogin
    ? "Default system administrator can update the login ID and set a new password for this user."
    : "Login ID and password reset are available only to the default system administrator.";
}

function renderPermissionGrid(role = document.getElementById("role")?.value || "na", permissions = ROLE_DEFAULTS[role] || []) {
  const selectedPermissions = Array.isArray(permissions) ? permissions : [];
  permissionGrid.innerHTML = PERMISSION_LABELS.map(([key, label]) => `
    <label class="permission-item">
      <input type="checkbox" data-permission="${key}" ${selectedPermissions.includes(key) ? 'checked' : ''} />
      <span>${label}</span>
    </label>
  `).join('');
}

function setPermissionSelection(permissions = []) {
  const selectedPermissions = Array.isArray(permissions) ? permissions : [];
  PERMISSION_LABELS.forEach(([key]) => {
    const checkbox = permissionGrid.querySelector(`[data-permission="${key}"]`);
    if (checkbox) checkbox.checked = selectedPermissions.includes(key);
  });
}

function getSelectedPermissions() {
  return Array.from(permissionGrid.querySelectorAll('input[data-permission]:checked')).map(cb => cb.dataset.permission);
}

function renderAccessControlGrid(accessControls = {}) {
  accessControlGrid.innerHTML = ACCESS_CONTROL_LABELS.map(([key, label]) => `
    <label class="permission-item">
      <input type="checkbox" data-access-control="${key}" ${accessControls[key] ? 'checked' : ''} />
      <span>${label}</span>
    </label>
  `).join('');
}

function getSelectedAccessControls() {
  const controls = {};
  ACCESS_CONTROL_LABELS.forEach(([key]) => {
    const checkbox = accessControlGrid.querySelector(`[data-access-control="${key}"]`);
    if (checkbox) controls[key] = checkbox.checked;
  });
  return controls;
}

function summarizeAccessControls(accessControls = {}) {
  return ACCESS_CONTROL_LABELS
    .filter(([key]) => accessControls[key])
    .map(([, label]) => label)
    .join(", ");
}

function summarizePermissions(permissions = []) {
  const selectedPermissions = Array.isArray(permissions) ? permissions : [];
  return selectedPermissions.map((permission) => PERMISSION_LABEL_MAP[permission] || permission).join(", ");
}

function getPermissionsForEdit(user) {
  const savedPermissions = Array.isArray(user.permissions) ? user.permissions : [];
  const roleDefaults = ROLE_DEFAULTS[user.role] || [];
  return savedPermissions.length ? savedPermissions : roleDefaults;
}

function applyRoleDefaults(role) {
  renderPermissionGrid(role, ROLE_DEFAULTS[role] || []);
  renderAccessControlGrid(ROLE_ACCESS_CONTROL_DEFAULTS[role] || {});
}

function resetTestForm() {
  document.getElementById("testForm").reset();
  document.getElementById("editingTestId").value = "";
  document.getElementById("saveTestBtn").textContent = "Add test";
}

function setActiveNavLink(hash) {
  const links = document.querySelectorAll(".sidebar-nav a");
  links.forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === hash);
  });
}

function updateWorkspaceEmptyState() {
  const windows = document.querySelectorAll(".task-window");
  const openWindows = Array.from(windows).filter((windowElement) => !windowElement.hidden);
  if (workspaceEmptyState) {
    workspaceEmptyState.hidden = openWindows.length > 0;
  }
}

function openTaskWindow(hash) {
  if (!canOpenWindow(hash)) {
    openTaskWindow("#window-overview");
    return;
  }

  const target = document.querySelector(hash);
  if (!target) {
    return;
  }
  
  const windows = document.querySelectorAll(".task-window");
  windows.forEach((windowElement) => {
    windowElement.hidden = windowElement !== target;
  });
  target.hidden = false;
  
  setActiveNavLink(hash);
  updateWorkspaceEmptyState();
  requestAnimationFrame(() => target.scrollIntoView({ behavior: "auto", block: "start" }));

  // Auto-refresh data to ensure it's always up-to-date
  if (hash === '#window-overview') loadDashboard().catch(console.error);
  if (hash === '#window-employee-management') loadUsers().catch(console.error);
  if (hash === '#window-id-card-studio') loadUsers().catch(console.error);
  if (hash === '#window-financial-reports') loadFinancialReport().catch(console.error);
  if (hash === '#window-full-financial-report') setDefaultFinancialReportDates();
  if (hash === '#window-vendor-management') loadVendors().catch(console.error);
  if (hash === '#window-associate-setup') loadAssociates().catch(console.error);
  if (hash === '#window-doctor-setup') loadDoctors().catch(console.error);
  if (hash === '#window-test-catalog') loadTests().catch(console.error);
  if (hash === '#window-daily-accounts-log') loadDailyAccountsLog().catch(console.error);
  if (hash === '#window-expense-reports') populateExpenseCategoryOptions().catch(console.error);
  if (hash === '#window-due-reports-audit') {
    setDefaultAuditDueReportDates();
    loadDueReportsAudit().catch(console.error);
  }
}

let salesChart = null;
let revenueChart = null;
let loadingCharts = false;

async function loadCharts() {
  if (loadingCharts) return;
  loadingCharts = true;
  try {
    const data = await API.request("/api/dashboard/charts");
    
    // 1. Sales Trend Chart
    const trendEl = document.getElementById('salesTrendChart');
    if (!trendEl) return;
    const trendCtx = trendEl.getContext('2d');
    if (salesChart) salesChart.destroy();
    
    salesChart = new Chart(trendCtx, {
      type: 'line',
      data: {
        labels: data.salesTrend.map(d => d.date.split('-').slice(1).reverse().join('/')),
        datasets: [{
          label: 'Daily Revenue (₹)',
          data: data.salesTrend.map(d => d.daily_sales),
          borderColor: '#0f766e',
          backgroundColor: 'rgba(15, 118, 110, 0.1)',
          fill: true,
          tension: 0.4,
          borderWidth: 3,
          pointRadius: 4,
          pointBackgroundColor: '#0f766e'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: { grid: { display: false } }
        }
      }
    });

    // 2. Revenue Breakdown Chart
    const revEl = document.getElementById('revenueBreakdownChart');
    if (!revEl) return;
    const revCtx = revEl.getContext('2d');
    if (revenueChart) revenueChart.destroy();
    
    const breakdown = data.revenueBreakdown;
    revenueChart = new Chart(revCtx, {
      type: 'doughnut',
      data: {
        labels: ['Cash', 'Online', 'Dues Cleared'],
        datasets: [{
          data: [breakdown.cash, breakdown.online, breakdown.duesCleared],
          backgroundColor: ['#0f766e', '#d97706', '#0891b2'],
          hoverOffset: 4,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15, font: { size: 11 } } }
        },
        cutout: '70%'
      }
    });
  } catch (error) {
    console.error('Failed to load charts:', error);
  } finally {
    loadingCharts = false;
  }
}

function closeTaskWindow(hash) {
  const target = document.querySelector(hash);
  if (!target) return;
  target.hidden = true;
  updateWorkspaceEmptyState();
}

function initializeSectionNavigation() {
  const links = document.querySelectorAll(".sidebar-nav a");
  if (!links.length || sectionNavigationInitialized) return;
  sectionNavigationInitialized = true;

  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const hash = link.getAttribute("href");
      openTaskWindow(hash);
    });
  });

  document.querySelectorAll("[data-close-window]").forEach((button) => {
    button.addEventListener("click", () => {
      closeTaskWindow(button.dataset.closeWindow);
    });
  });

  configureSectionAccess();

  const requestedHash = window.location.hash || "#window-overview";
  const initialHash = canOpenWindow(requestedHash) ? requestedHash : "#window-overview";
  openTaskWindow(initialHash);
}

async function loadDashboard() {
  const data = await API.request("/api/dashboard/overview");
  overviewCards.innerHTML = [
    ["Patients today", data.overview.patientsToday],
    ["Pending reports", data.overview.pendingReports],
    ["Total due", currency(data.overview.dueAmount)],
    ["Active doctors", data.overview.activeDoctors],
  ]
    .map(
      ([label, value]) => `
        <article class="panel">
          <div class="eyebrow">${label}</div>
          <h2>${value}</h2>
        </article>
      `
    )
    .join("");

  await loadCharts();

  auditLog.innerHTML = data.recentLogs
    .map(
      (log) => `
        <div class="list-item">
          <strong>${log.action}</strong><br />
          <span>${log.full_name || "System"} • ${log.entity_type} • ${log.created_at}</span>
        </div>
      `
    )
    .join("");
}

function getFinancialQueryString({ includeDoctorFilter = false } = {}) {
  const params = new URLSearchParams();
  if (financialDateFrom.value) params.set("dateFrom", financialDateFrom.value);
  if (financialDateTo.value) params.set("dateTo", financialDateTo.value);
  if (includeDoctorFilter && dueReportDoctorFilter?.value) {
    params.set("doctorId", dueReportDoctorFilter.value);
  }
  return params.toString();
}

function setDefaultFinancialDateRange() {
  const today = new Date();
  const oneMonthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  financialDateFrom.value = oneMonthAgo.toISOString().split("T")[0];
  financialDateTo.value = today.toISOString().split("T")[0];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderDueReportDoctorFilter() {
  if (!dueReportDoctorFilter) return;

  const selectedDoctorId = dueReportDoctorFilter.value;
  dueReportDoctorFilter.innerHTML = `
    <option value="">All doctors</option>
    ${doctorsCache
      .map((doctor) => `<option value="${doctor.id}">${escapeHtml(doctor.name)}</option>`)
      .join("")}
  `;
  dueReportDoctorFilter.value = doctorsCache.some((doctor) => String(doctor.id) === selectedDoctorId)
    ? selectedDoctorId
    : "";
}

function renderCommissionList(container, rows, emptyText, type) {
  if (!rows.length) {
    container.innerHTML = `<div class="empty-state">${emptyText}</div>`;
    return;
  }

  container.innerHTML = rows
    .map((row) => {
      const hasDueReports = type === "doctor" && Number(row.dueReportCount || 0) > 0;
      return `
        <div class="list-item">
          <strong>${row.name}</strong><br />
          <span>${row.visitCount} visit(s) • Sales ${currency(row.totalSales)} • Commission ${Number(row.commission_percent || 0).toFixed(2)}%</span><br />
          <span>Payable: <strong>${currency(row.commissionAmount)}</strong></span>
          ${hasDueReports ? `
            <br />
            <span>Ready due reports: <strong>${row.dueReportCount}</strong> | Patient due ${currency(row.dueReportAmount)} | Commission tied to due ${currency(row.dueReportCommissionAmount)}</span>
          ` : ""}
          <div class="actions-row" style="margin-top: 8px;">
            <button class="secondary-btn" data-download-commission="${row.id}" data-type="${type}" type="button">Download ${type} report</button>
          </div>
        </div>
      `;
    })
    .join("");

  container.querySelectorAll("[data-download-commission]").forEach((button) => {
    button.addEventListener("click", () => {
      downloadCommissionReport(button.dataset.type, button.dataset.downloadCommission);
    });
  });
}

function setDefaultAuditDueReportDates() {
  if (!auditDueReportDateFrom.value) {
    const today = new Date();
    const oneMonthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    auditDueReportDateFrom.value = oneMonthAgo.toISOString().split("T")[0];
    auditDueReportDateTo.value = today.toISOString().split("T")[0];
  }
}

async function loadDueReportsAudit() {
  const params = new URLSearchParams();
  if (auditDueReportDateFrom.value) params.set("dateFrom", auditDueReportDateFrom.value);
  if (auditDueReportDateTo.value) params.set("dateTo", auditDueReportDateTo.value);
  
  const query = params.toString();
  const data = await API.request(`/api/dashboard/due-reports${query ? `?${query}` : ""}`);
  
  renderDueReportAuditSummary(data.summary || {});
  renderDueReportAuditList(data.reports || []);
}

function renderDueReportAuditSummary(summary = {}) {
  if (!auditDueReportSummary) return;

  auditDueReportSummary.innerHTML = [
    ["Unpaid Reports", Number(summary.dueReportCount || 0)],
    ["Total Due Amount", currency(summary.totalDue)],
    ["Total Bill Value", currency(summary.totalSales)],
  ]
    .map(
      ([label, value]) => `
        <article class="panel">
          <div class="eyebrow">${label}</div>
          <h2>${value}</h2>
        </article>
      `
    )
    .join("");
}

function renderDueReportAuditList(reports = []) {
  if (!auditDueReportList) return;

  if (!reports.length) {
    auditDueReportList.innerHTML = `<div class="empty-state">No unpaid reports found for this date range.</div>`;
    return;
  }

  auditDueReportList.innerHTML = reports
    .map((report) => {
      const isPrinted = (report.technician_print_count || 0) > 0 || (report.admin_print_count || 0) > 0;
      const printSummary = `Tech prints: ${report.technician_print_count || 0} | Admin prints: ${report.admin_print_count || 0}`;
      
      return `
        <div class="list-item ${isPrinted ? 'warning-border' : ''}">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <strong>${escapeHtml(report.patient_name)} (${escapeHtml(report.patient_code)})</strong><br />
              <span class="helper">Bill: ${escapeHtml(report.bill_no)} | Visit: ${formatDate(report.visitDate)}</span><br />
              <span class="helper">Tests: ${escapeHtml(report.tests || "-")}</span><br />
              <span class="helper">Report: ${escapeHtml(report.report_no || "N/A")} | Status: <strong class="pill ${report.status === 'reported' ? 'success' : 'warning'}">${report.status === 'reported' ? 'Finalized' : 'Pending'}</strong></span>
            </div>
            <div style="text-align: right;">
              <span class="eyebrow">Amount Due</span>
              <h3 style="color: #dc2626; margin: 0;">${currency(report.amount_due)}</h3>
              <span class="helper">Total bill: ${currency(report.total)}</span>
            </div>
          </div>
          <div class="audit-info" style="margin-top: 10px; padding: 10px; background: rgba(0,0,0,0.03); border-radius: 8px; border-left: 4px solid ${isPrinted ? '#dc2626' : '#16a34a'};">
            <div style="display: flex; align-items: center; gap: 8px;">
               <strong>${isPrinted ? '🚨 POTENTIAL ABUSE: Report printed before full payment' : '✅ Report not yet printed'}</strong>
            </div>
            <span class="helper">${printSummary}</span>
          </div>
          <div class="actions-row" style="margin-top: 12px;">
            <button class="secondary-btn" data-view-report="${report.id}" type="button">View Report</button>
          </div>
        </div>
      `;
    })
    .join("");

  auditDueReportList.querySelectorAll("[data-view-report]").forEach((button) => {
    button.addEventListener("click", () => {
      openHtmlReport(button.dataset.viewReport, false);
    });
  });
}

async function loadFinancialReport() {
  const query = getFinancialQueryString();
  const data = await API.request(`/api/dashboard/financials${query ? `?${query}` : ""}`);
  const sales = data.sales || {};

  financialSummaryCards.innerHTML = [
    ["Total sales", currency(sales.totalSales)],
    ["Direct at lab", `${currency(sales.directSales)} (${sales.directVisits || 0})`],
    ["Associate sales", `${currency(sales.associateSales)} (${sales.associateVisits || 0})`],
    ["Total due", currency(sales.totalDue)],
  ]
    .map(
      ([label, value]) => `
        <article class="metric-card">
          <div class="eyebrow">${label}</div>
          <h2>${value}</h2>
        </article>
      `
    )
    .join("");

  renderCommissionList(doctorCommissionList, data.doctorCommissions || [], "No doctor commission in this date range.", "doctor");
  renderCommissionList(associateCommissionList, data.associateCommissions || [], "No associate commission in this date range.", "associate");
  showMessage("financialReportMessage", "Financial report updated");
}

async function downloadCommissionReport(type, id = null) {
  const query = getFinancialQueryString();
  const url = `/api/dashboard/commission-report?type=${type}${id ? `&id=${id}` : ""}${query ? `&${query}` : ""}`;
  const token = localStorage.getItem("labToken");
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Unable to download commission report");
  }

  const blob = await response.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${type}${id ? `-${id}` : ""}-commission-report.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function loadUsers() {
  const data = await API.request("/api/users");
  usersCache = data.users;
  userList.innerHTML = data.users
    .map(
      (user) => `
        <div class="list-item">
          <div class="list-item-main">
            <strong>${user.full_name || user.username}</strong>
            ${user.is_protected_system_admin ? '<span class="pill warning" style="margin-left: 8px;">System Admin</span>' : ""}
            <br />
            <span>${user.username} • ${user.employment_title || user.role} • ${user.employee_code || "-"} • Joined ${formatDate(user.joining_date)}</span><br />
            <small>${summarizePermissions(user.permissions) || "No permissions set"}</small>
          </div>

          <div class="actions-row">
            ${user.is_protected_system_admin
              ? '<button class="secondary-btn" type="button" disabled title="System account cannot be edited">Edit locked</button>'
              : `<button class="secondary-btn" data-edit-user="${user.id}" type="button">Edit access</button>`}
            
            <button class="ghost-btn" data-card-user="${user.id}" type="button">Open ID card</button>
            
            ${user.is_protected_system_admin
              ? '<button class="danger-btn" type="button" disabled title="System account cannot be deleted">Delete locked</button>'
              : `<button class="danger-btn" data-delete-user="${user.id}" type="button">Delete</button>`}
          </div>
        </div>
      `
    )
    .join("");


  userList.querySelectorAll("[data-edit-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      const dataForUser = await API.request(`/api/users/${button.dataset.editUser}`);
      const user = dataForUser.user;
      document.getElementById("editingUserId").value = user.id;
      document.getElementById("fullName").value = user.full_name || "";
      document.getElementById("employeeCode").value = user.employee_code || "";
      document.getElementById("joiningDate").value = user.joining_date || "";
      document.getElementById("employmentTitle").value = user.employment_title || "";
      document.getElementById("role").value = user.role;
      usernameInput.value = user.username || "";
      document.getElementById("saveUserBtn").textContent = "Update user";
      selectedProfileImage = user.profile_image || "";
      applyRoleDefaults(user.role);
      setPermissionSelection(getPermissionsForEdit(user));
      renderAccessControlGrid(user.access_controls || {});
      configureCredentialFieldsForEdit(user);
      showMessage("userMessage", `Editing ${user.full_name || user.username}`);
      openTaskWindow("#window-employee-management");
    });
  });

  userList.querySelectorAll("[data-card-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      const dataForUser = await API.request(`/api/users/${button.dataset.cardUser}`);
      setCardUser(dataForUser.user);
      openTaskWindow("#window-id-card-studio");
    });
  });

  // Delete user handlers
  userList.querySelectorAll("[data-delete-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      const userId = button.dataset.deleteUser;
      const user = usersCache.find(u => u.id == userId);
      const userLabel = user?.full_name || user?.username || "this user";
      if (!confirm(`Are you sure you want to delete "${userLabel}"? This action cannot be undone.`)) {
        return;
      }
      try {
        await API.request(`/api/users/${userId}?_=${Date.now()}`, { method: "DELETE" });
        showMessage("userMessage", "Employee deleted successfully");
        usersCache = [];
        await loadUsers();
      } catch (error) {
        console.error('Delete user error:', error);
        showMessage("userMessage", error.message, true);
      }
    });
  });
}

async function loadDoctors() {
  const data = await API.request("/api/doctors");
  doctorsCache = data.doctors || [];
  renderDueReportDoctorFilter();

  doctorList.innerHTML = doctorsCache
    .map((doctor) => {
      let rulesSummary = "";
      try {
        const rules = JSON.parse(doctor.commission_rules || "{}");
        const entries = Object.entries(rules);
        if (entries.length) {
          rulesSummary = `<br/><small class="muted">Custom Rules: ${entries
            .map(([cat, r]) => `${cat}: ${r.type === "percent" ? `${r.value}%` : currency(r.value)}`)
            .join(", ")}</small>`;
        }
      } catch (e) {}

      return `
        <div class="list-item">
          <strong>${doctor.name}</strong><br />
          <span>${doctor.specialization || "General"} • ${doctor.referred_patients} patients • Commission ${currency(doctor.commission_amount)}</span>
          ${rulesSummary}
          <div class="actions-row">
            <button class="secondary-btn" data-edit-doctor="${doctor.id}" type="button">Edit</button>
            <button class="danger-btn" data-delete-doctor="${doctor.id}" type="button">Delete</button>
          </div>
        </div>
      `;
    })
    .join("");

  doctorList.querySelectorAll("[data-edit-doctor]").forEach((button) => {
    button.addEventListener("click", () => {
      const doctor = doctorsCache.find((d) => d.id == button.dataset.editDoctor);
      if (!doctor) return;

      editingDoctorId.value = doctor.id;
      doctorNameInput.value = doctor.name;
      doctorPhoneInput.value = doctor.phone || "";
      doctorSpecializationInput.value = doctor.specialization || "";
      doctorCommissionInput.value = doctor.commission_percent || 0;
      saveDoctorBtn.textContent = "Update Doctor";

      doctorCommissionRules.innerHTML = "";
      try {
        const rules = JSON.parse(doctor.commission_rules || "{}");
        Object.entries(rules).forEach(([category, rule]) => {
          addDoctorCommissionRule({ category, ...rule });
        });
      } catch (e) {}

      showMessage("doctorMessage", `Editing ${doctor.name}`);
      openTaskWindow("#window-doctor-setup");
    });
  });

  doctorList.querySelectorAll("[data-delete-doctor]").forEach((button) => {
    button.addEventListener("click", async () => {
      const doctorId = button.dataset.deleteDoctor;
      const doctor = doctorsCache.find((d) => d.id == doctorId);
      if (!confirm(`Permanently delete doctor "${doctor.name}"? This cannot be undone.`)) return;
      try {
        await API.request(`/api/doctors/${doctorId}?_=${Date.now()}`, { method: "DELETE" });
        await loadDoctors();
      } catch (error) {
        console.error("Delete doctor error:", error);
        alert(error.message);
      }
    });
  });
}

function addDoctorCommissionRule(rule = {}) {
  const ruleDiv = document.createElement("div");
  ruleDiv.className = "inline-grid rule-row";
  ruleDiv.style.alignItems = "flex-end";
  ruleDiv.style.gap = "8px";
  ruleDiv.style.background = "rgba(0,0,0,0.02)";
  ruleDiv.style.padding = "10px";
  ruleDiv.style.borderRadius = "8px";
  ruleDiv.style.marginTop = "8px";

  const categoryOptions = testCategories
    .map((cat) => `<option value="${cat}" ${rule.category === cat ? "selected" : ""}>${cat}</option>`)
    .join("");

  ruleDiv.innerHTML = `
    <label class="field">
      <span>Category</span>
      <select class="rule-category" required>
        <option value="">Select Category</option>
        ${categoryOptions}
      </select>
    </label>
    <label class="field">
      <span>Type</span>
      <select class="rule-type" required>
        <option value="percent" ${rule.type === "percent" ? "selected" : ""}>Percentage (%)</option>
        <option value="fixed" ${rule.type === "fixed" ? "selected" : ""}>Fixed (Rs.)</option>
      </select>
    </label>
    <label class="field">
      <span>Value</span>
      <input type="number" step="0.1" class="rule-value" value="${rule.value || ""}" required />
    </label>
    <button class="ghost-btn danger remove-rule-btn" type="button" style="margin-bottom: 8px;">&times;</button>
  `;

  ruleDiv.querySelector(".remove-rule-btn").addEventListener("click", () => ruleDiv.remove());
  doctorCommissionRules.appendChild(ruleDiv);
}

function getDoctorCommissionRules() {
  const rules = {};
  doctorCommissionRules.querySelectorAll(".rule-row").forEach((row) => {
    const category = row.querySelector(".rule-category").value;
    const type = row.querySelector(".rule-type").value;
    const value = Number(row.querySelector(".rule-value").value || 0);
    if (category) {
      rules[category] = { type, value };
    }
  });
  return Object.keys(rules).length ? JSON.stringify(rules) : null;
}

function resetDoctorForm() {
  document.getElementById("doctorForm").reset();
  editingDoctorId.value = "";
  doctorCommissionRules.innerHTML = "";
  saveDoctorBtn.textContent = "Add Doctor";
  showMessage("doctorMessage", "");
}

async function loadAssociates() {
  const data = await API.request("/api/associates?includeInactive=1");
  associateList.innerHTML = data.associates.filter(a => a.active).map(
    (associate) => `
      <div class="list-item">
        <strong>${associate.name}</strong><br />
        <span>${associate.associate_code} • ${associate.associate_type} • ${associate.phone || "No phone"}</span><br />
        <span>Commission ${Number(associate.commission_percent || 0).toFixed(2)}%</span>
        <div class="actions-row">
          <button class="secondary-btn" data-edit-associate="${associate.id}" type="button">Edit</button>
          <button class="secondary-btn" data-ledger-associate="${associate.id}" type="button">Ledger</button>
          <button class="danger-btn" data-delete-associate="${associate.id}" type="button">Delete</button>
        </div>
      </div>
    `
  ).join("");

  associateList.querySelectorAll("[data-ledger-associate]").forEach((button) => {
    button.addEventListener("click", () => {
      const assocId = button.dataset.ledgerAssociate;
      const assoc = data.associates.find(a => a.id == assocId);
      if (assoc) {
        document.getElementById("ledgerAssociateName").textContent = assoc.name;
        document.getElementById("ledgerAssociateId").value = assoc.id;
        document.getElementById("assocPaymentDate").value = new Date().toISOString().split('T')[0];
        loadAssociateLedger(assocId);
        openTaskWindow("#window-associate-ledger");
      }
    });
  });

  associateList.querySelectorAll("[data-edit-associate]").forEach((button) => {
    button.addEventListener("click", () => {
      const assoc = data.associates.find((a) => a.id == button.dataset.editAssociate);
      if (!assoc) return;

      document.getElementById("editingAssociateId").value = assoc.id;
      document.getElementById("associateCode").value = assoc.associate_code || "";
      document.getElementById("associateName").value = assoc.name || "";
      document.getElementById("associateType").value = assoc.associate_type || "collector";
      document.getElementById("associatePhone").value = assoc.phone || "";
      document.getElementById("associateCommission").value = assoc.commission_percent || 0;
      document.getElementById("associateNotes").value = assoc.notes || "";
      document.getElementById("saveAssociateBtn").textContent = "Update associate";
      document.getElementById("clearAssociateFormBtn").hidden = false;
      
      showMessage("associateMessage", `Editing ${assoc.name}`);
      openTaskWindow("#window-associate-setup");
    });
  });

  // Delete associate handlers
  associateList.querySelectorAll("[data-delete-associate]").forEach((button) => {
    button.addEventListener("click", async () => {
      const assocId = button.dataset.deleteAssociate;
      const assoc = data.associates.find(a => a.id == assocId);
      if (!confirm(`Deactivate associate "${assoc.name}"?`)) return;
      try {
        await API.request(`/api/associates/${assocId}?_=${Date.now()}`, { method: "DELETE" });
        await loadAssociates();
      } catch (error) {
        console.error('Delete associate error:', error);
        alert(error.message);
      }
    });
  });
}

async function loadAssociateLedger(associateId) {
  try {
    const data = await API.request(`/api/associates/${associateId}/ledger`);
    const { payments, summary } = data;

    const summaryCards = document.getElementById("associateLedgerSummary");
    summaryCards.innerHTML = [
      ["Total Lab Share", currency(summary.totalLabShare)],
      ["Total Paid to Lab", currency(summary.totalPaid)],
      ["Balance Owed", currency(summary.balance)],
    ].map(([label, value]) => `
      <article class="metric-card">
        <div class="eyebrow">${label}</div>
        <h2 style="${label === 'Balance Owed' && summary.balance > 0 ? 'color: #dc2626' : ''}">${value}</h2>
      </article>
    `).join("");

    const paymentList = document.getElementById("associatePaymentList");
    if (!payments.length) {
      paymentList.innerHTML = `<div class="empty-state">No payment history found.</div>`;
    } else {
      paymentList.innerHTML = payments.map(p => `
        <div class="list-item">
          <div style="display: flex; justify-content: space-between;">
            <strong>${currency(p.amount)}</strong>
            <span>${p.payment_date}</span>
          </div>
          <span class="helper">Mode: ${p.payment_mode} | Recorded by: ${p.collector_name}</span>
          ${p.notes ? `<br/><small class="muted">Note: ${p.notes}</small>` : ''}
        </div>
      `).join("");
    }
  } catch (error) {
    showMessage("ledgerMessage", error.message, true);
  }
}

async function loadTests() {
  const data = await API.request("/api/tests");
  testsCache = data.tests || [];
  renderTestList();
}

function renderTestList(query = "") {
  if (!testList) return;
  const canEditTests = canManageTests();
  const normalizedQuery = normalizeSearchText(query);

  const filteredTests = testsCache.filter((test) => {
    if (!normalizedQuery) return true;
    const name = normalizeSearchText(test.name);
    const code = normalizeSearchText(test.code);
    const category = normalizeSearchText(test.category);
    return name.includes(normalizedQuery) || code.includes(normalizedQuery) || category.includes(normalizedQuery);
  });

  if (!filteredTests.length) {
    testList.innerHTML = `<div class="empty-state">No tests found matching "${escapeHtml(query)}".</div>`;
    return;
  }

  testList.innerHTML = filteredTests
    .map((test) => {
      const parameterSummary = (test.parameters || []).length
        ? test.parameters
            .map((parameter) => `${parameter.parameter_name}${parameter.unit ? ` (${parameter.unit})` : ""}${parameter.normal_range ? ` - ${parameter.normal_range}` : ""}`)
            .join(", ")
        : "No parameter details added";

      return `
        <div class="list-item">
          <strong>${test.name}</strong><br />
          <span>${test.code || "No code"} • ${test.category || "General"} • ${test.sample_type || "Sample type not set"}</span><br />
          <span>Price: ${currency(test.price)} • Process: ${test.turnaround_hours || 24} hours</span><br />
          <span>${parameterSummary}</span>
          <div class="actions-row">
            <button class="secondary-btn" data-preview-test="${test.id}" type="button">Preview Report</button>
            ${canEditTests
              ? `
                <button class="secondary-btn" data-edit-test="${test.id}" type="button">Edit test</button>
                <button class="danger-btn" data-delete-test="${test.id}" type="button">Delete test</button>
              `
              : '<button class="secondary-btn" type="button" disabled>Edit locked</button>'}
          </div>
        </div>
      `;
    })
    .join("");

  testList.querySelectorAll("[data-edit-test]").forEach((button) => {
    button.addEventListener("click", () => {
      const test = filteredTests.find((item) => item.id === Number(button.dataset.editTest));
      if (!test) return;

      document.getElementById("editingTestId").value = test.id;
      document.getElementById("testName").value = test.name || "";
      document.getElementById("testCode").value = test.code || "";
      document.getElementById("testCategory").value = test.category || "";
      document.getElementById("testSampleType").value = test.sample_type || "";
      document.getElementById("testPrice").value = test.price || 0;
      document.getElementById("testTurnaroundHours").value = test.turnaround_hours || 24;
      document.getElementById("testParameters").value = (test.parameters || [])
        .map((parameter) => `${parameter.parameter_name}|${parameter.unit || ""}|${parameter.normal_range || ""}`)
        .join("\n");
      document.getElementById("saveTestBtn").textContent = "Update test";
      showMessage("testMessage", `Editing ${test.name}`);
      openTaskWindow("#window-test-catalog");
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
      const test = filteredTests.find((item) => item.id === Number(button.dataset.deleteTest));
      if (!test) return;

      if (!confirm(`Permanently delete "${test.name}" from the test catalog? This cannot be undone.`)) {
        return;
      }

      try {
        await API.request(`/api/tests/${test.id}?_=${Date.now()}`, { method: "DELETE" });
        if (document.getElementById("editingTestId").value === String(test.id)) {
          resetTestForm();
        }
        showMessage("testMessage", `Deleted ${test.name} from the catalog.`);
        await loadTests();
      } catch (error) {
        showMessage("testMessage", error.message, true);
      }
    });
  });
}

async function importTestCatalog() {
  if (!canManageTests()) {
    showMessage("importTestMessage", "You do not have permission to import tests.", true);
    return;
  }

  const fileInput = document.getElementById("testImportFile");
  const file = fileInput.files?.[0];
  if (!file) {
    showMessage("importTestMessage", "Choose a JSON file containing tests to import.", true);
    return;
  }

  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const tests = Array.isArray(payload) ? payload : payload.tests;
    if (!Array.isArray(tests) || !tests.length) {
      throw new Error("Import file must be a JSON array of test objects.");
    }

    await API.request("/api/tests/import", {
      method: "POST",
      body: JSON.stringify({ tests }),
    });

    showMessage("importTestMessage", "Test catalog imported successfully.");
    fileInput.value = "";
    await loadTests();
  } catch (error) {
    showMessage("importTestMessage", error.message || "Unable to import tests.", true);
  }
}

document.getElementById("role").addEventListener("change", (event) => {
  applyRoleDefaults(event.target.value);
});

document.getElementById("employmentTitle").addEventListener("change", (event) => {
  if (event.target.value === "Others (type custom title)") {
    event.target.value = "";
  }
});

idCardSearch.addEventListener("input", (event) => {
  renderIdCardSearchResults(event.target.value);
});

testCatalogSearch?.addEventListener("input", (event) => {
  renderTestList(event.target.value);
});

document.getElementById("profileImage").addEventListener("change", async (event) => {
  const [file] = event.target.files || [];
  if (!file) {
    selectedProfileImage = "";
    return;
  }

  try {
    selectedProfileImage = await readFileAsDataUrl(file);
    const draftUser = {
      full_name: document.getElementById("fullName").value.trim() || "Preview User",
      role: document.getElementById("role").value,
      employment_title: document.getElementById("employmentTitle").value.trim(),
      employee_code: document.getElementById("employeeCode").value.trim(),
      joining_date: document.getElementById("joiningDate").value,
      username: document.getElementById("newUsername").value.trim(),
      profile_image: selectedProfileImage,
    };
    setCardUser(draftUser);
  } catch (error) {
    showMessage("userMessage", error.message, true);
  }
});

document.getElementById("resetUserBtn").addEventListener("click", () => {
  resetUserForm();
  showMessage("userMessage", "Form cleared");
});

document.getElementById("resetTestBtn").addEventListener("click", () => {
  resetTestForm();
  showMessage("testMessage", "Test form cleared");
});

document.getElementById("userForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const editingUserId = document.getElementById("editingUserId").value;
  const payload = {
    fullName: document.getElementById("fullName").value.trim(),
    employeeCode: document.getElementById("employeeCode").value.trim(),
    joiningDate: document.getElementById("joiningDate").value,
    employmentTitle: document.getElementById("employmentTitle").value.trim(),
    role: document.getElementById("role").value,
    permissions: getSelectedPermissions(),
    accessControls: getSelectedAccessControls(),
    profileImage: selectedProfileImage || null,
  };

  if (!editingUserId) {
    payload.username = usernameInput.value.trim();
    payload.password = passwordInput.value;
  } else if (isDefaultSystemAdministrator()) {
    payload.username = usernameInput.value.trim();
    if (passwordInput.value) {
      payload.password = passwordInput.value;
    }
  }

  try {
    if (editingUserId) {
      await API.request(`/api/users/${editingUserId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      alert("User updated successfully");
    } else {
      await API.request("/api/users", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      alert("User created successfully");
    }

    resetUserForm();
    await loadUsers();
  } catch (error) {
    showMessage("userMessage", error.message, true);
  }
});

document.getElementById("associateForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const editingId = document.getElementById("editingAssociateId").value;
    const payload = {
      associateCode: document.getElementById("associateCode").value.trim(),
      name: document.getElementById("associateName").value.trim(),
      associateType: document.getElementById("associateType").value,
      phone: document.getElementById("associatePhone").value.trim(),
      commissionPercent: Number(document.getElementById("associateCommission").value || 0),
      notes: document.getElementById("associateNotes").value.trim(),
    };

    if (editingId) {
      await API.request(`/api/associates/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      showMessage("associateMessage", "Associate updated successfully");
    } else {
      await API.request("/api/associates", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showMessage("associateMessage", "Associate added successfully");
    }
    
    document.getElementById("clearAssociateFormBtn").click();
    await loadAssociates();
  } catch (error) {
    showMessage("associateMessage", error.message, true);
  }
});

document.getElementById("clearAssociateFormBtn")?.addEventListener("click", () => {
  document.getElementById("associateForm").reset();
  document.getElementById("editingAssociateId").value = "";
  document.getElementById("saveAssociateBtn").textContent = "Add associate";
  document.getElementById("clearAssociateFormBtn").hidden = true;
  showMessage("associateMessage", "");
});

document.getElementById("doctorForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const id = editingDoctorId.value;
  const payload = {
    name: doctorNameInput.value.trim(),
    phone: doctorPhoneInput.value.trim(),
    specialization: doctorSpecializationInput.value.trim(),
    commissionPercent: Number(doctorCommissionInput.value || 0),
    commissionRules: getDoctorCommissionRules(),
  };

  try {
    if (id) {
      await API.request(`/api/doctors/${id}`, {
        method: "PUT",
        body: JSON.stringify({ ...payload, active: true }),
      });
      showMessage("doctorMessage", "Doctor updated successfully");
    } else {
      await API.request("/api/doctors", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showMessage("doctorMessage", "Doctor added successfully");
    }
    resetDoctorForm();
    await loadDoctors();
  } catch (error) {
    showMessage("doctorMessage", error.message, true);
  }
});

addDoctorRuleBtn?.addEventListener("click", () => addDoctorCommissionRule());
clearDoctorFormBtn?.addEventListener("click", resetDoctorForm);

document.getElementById("testForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!canManageTests()) {
    showMessage("testMessage", "You do not have permission to manage tests", true);
    return;
  }

  const editingTestId = document.getElementById("editingTestId").value;
  const payload = {
    name: document.getElementById("testName").value.trim(),
    code: document.getElementById("testCode").value.trim(),
    category: document.getElementById("testCategory").value.trim(),
    sampleType: document.getElementById("testSampleType").value.trim(),
    price: Number(document.getElementById("testPrice").value || 0),
    turnaroundHours: Number(document.getElementById("testTurnaroundHours").value || 24),
    parameters: parseParameterText(document.getElementById("testParameters").value),
  };

  try {
    if (editingTestId) {
      await API.request(`/api/tests/${editingTestId}`, {
        method: "PUT",
        body: JSON.stringify({
          ...payload,
          active: true,
        }),
      });
      alert("Test updated successfully");
    } else {
      await API.request("/api/tests", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      alert("Test added to catalog");
    }
    resetTestForm();
    await loadTests();
  } catch (error) {
    showMessage("testMessage", error.message, true);
  }
});

document.getElementById("backupBtn").addEventListener("click", async () => {
  try {
    const data = await API.request("/api/backup", { method: "POST" });
    showMessage("backupMessage", `Backup created: ${data.backupFile}`);
  } catch (error) {
    showMessage("backupMessage", error.message, true);
  }
});

document.getElementById("downloadIdCardBtn").addEventListener("click", async () => {
  if (!selectedUserForCard) {
    alert("Select a user first");
    return;
  }

  await drawIdCard(selectedUserForCard);
  const link = document.createElement("a");
  link.href = idCardCanvas.toDataURL("image/png");
  link.download = `${selectedUserForCard.employee_code || selectedUserForCard.username || "staff-id-card"}.png`;
  link.click();
});

document.getElementById("refreshFinancialReportBtn").addEventListener("click", async () => {
  try {
    await loadFinancialReport();
  } catch (error) {
    showMessage("financialReportMessage", error.message, true);
  }
});

dueReportDoctorFilter?.addEventListener("change", async () => {
  try {
    await loadDueReports();
    showMessage("financialReportMessage", "Due report filter updated");
  } catch (error) {
    showMessage("financialReportMessage", error.message, true);
  }
});

document.getElementById("downloadDoctorCommissionBtn").addEventListener("click", async () => {
  try {
    await downloadCommissionReport("doctor");
  } catch (error) {
    showMessage("financialReportMessage", error.message, true);
  }
});

document.getElementById("downloadAssociateCommissionBtn").addEventListener("click", async () => {
  try {
    await downloadCommissionReport("associate");
  } catch (error) {
    showMessage("financialReportMessage", error.message, true);
  }
});

document.getElementById("associatePaymentForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("ledgerAssociateId").value;
  const payload = {
    amount: Number(document.getElementById("assocPaymentAmount").value),
    paymentDate: document.getElementById("assocPaymentDate").value,
    paymentMode: document.getElementById("assocPaymentMode").value,
    notes: document.getElementById("assocPaymentNotes").value.trim(),
  };

  try {
    await API.request(`/api/associates/${id}/payments`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    showMessage("ledgerMessage", "Payment recorded successfully");
    document.getElementById("associatePaymentForm").reset();
    document.getElementById("assocPaymentDate").value = new Date().toISOString().split('T')[0];
    await loadAssociateLedger(id);
  } catch (error) {
    showMessage("ledgerMessage", error.message, true);
  }
});



async function loadDailyAccountsLog() {
  const dateFrom = document.getElementById("accountsLogDateFrom")?.value;
  const dateTo = document.getElementById("accountsLogDateTo")?.value;
  const logList = document.getElementById("accountsLogList");
  if (!logList) return;

  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  const data = await API.request(`/api/accounts/submissions?${params.toString()}`);
  const submissions = data.submissions || [];

  if (!submissions.length) {
    logList.innerHTML = `<div class="empty-state">No account submissions found for this date range.</div>`;
    showMessage("accountsLogMessage", "");
    return;
  }

  logList.innerHTML = submissions.map((s) => {
    const balanced = Math.abs(s.total_variance) < 0.01;
    const varianceColor = balanced ? "var(--primary)" : "var(--danger)";
    const varianceLabel = balanced ? "✓ Balanced" : `⚠ Variance: ${currency(s.total_variance)}`;

    // Format submission time in local-friendly format
    const submittedAt = s.submitted_at
      ? new Date(s.submitted_at + (s.submitted_at.endsWith('Z') ? '' : 'Z')).toLocaleString('en-IN', {
          dateStyle: 'medium', timeStyle: 'short'
        })
      : '—';

    return `
      <div class="list-item" style="position: relative;">
        <div style="position: absolute; top: 18px; right: 18px; width: 12px; height: 12px; border-radius: 50%; background: ${varianceColor}; box-shadow: 0 0 8px 1px ${varianceColor};"
             title="${varianceLabel}"></div>
        <div style="padding-right: 20px;">
          <strong>${s.full_name || s.username}</strong>
          <span style="margin-left: 8px; font-size: 0.8rem; color: var(--muted);">${s.employment_title || 'Receptionist'}</span><br />
          <span>📅 ${s.submission_date} &nbsp;|&nbsp; 🕐 Submitted: ${submittedAt}</span><br />
          <div style="margin-top: 6px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; font-size: 0.88rem;">
            <div><span style="color: var(--muted);">Cash Expected</span><br /><strong>${currency(s.cash_expected)}</strong></div>
            <div><span style="color: var(--muted);">Cash Counted</span><br /><strong>${currency(s.cash_counted)}</strong></div>
            <div><span style="color: var(--muted);">Cash Diff</span><br /><strong style="color: ${Math.abs(s.cash_variance) < 0.01 ? 'var(--primary)' : 'var(--danger)'}">${currency(s.cash_variance)}</strong></div>
            <div><span style="color: var(--muted);">Online Expected</span><br /><strong>${currency(s.online_expected)}</strong></div>
            <div><span style="color: var(--muted);">Online Counted</span><br /><strong>${currency(s.online_counted)}</strong></div>
            <div><span style="color: var(--muted);">Online Diff</span><br /><strong style="color: ${Math.abs(s.online_variance) < 0.01 ? 'var(--primary)' : 'var(--danger)'}">${currency(s.online_variance)}</strong></div>
          </div>
          <div style="margin-top: 8px; font-size: 0.9rem;">
            <span>Total Expected: <strong>${currency(s.total_expected)}</strong></span>
            &nbsp;|&nbsp;
            <span style="color: ${varianceColor}; font-weight: 700;">${varianceLabel}</span>
          </div>
          ${s.notes ? `<div style="margin-top: 4px; font-size: 0.82rem; color: var(--muted);">Note: ${s.notes}</div>` : ''}
        </div>
      </div>
    `;
  }).join("");

  showMessage("accountsLogMessage", `${submissions.length} submission(s) found`);
}

async function populateExpenseCategoryOptions() {
  const datalist = document.getElementById("expenseReportCategoryOptions");
  if (!datalist) return;

  try {
    // Fetch all expenses without filter to get distinct categories
    const data = await API.request("/api/accounts/expenses");
    const categories = [...new Set(
      (data.expenses || []).map(e => e.category).filter(Boolean)
    )].sort();

    datalist.innerHTML = categories.map(c => `<option value="${c}"></option>`).join("");
  } catch (_) {
    // silently ignore — datalist is optional enhancement
  }
}

async function loadExpenseReport() {
  const category = document.getElementById("expenseReportCategory")?.value?.trim() || "";
  const dateFrom = document.getElementById("expenseReportDateFrom")?.value || "";
  const dateTo = document.getElementById("expenseReportDateTo")?.value || "";
  const summaryCards = document.getElementById("expenseReportSummaryCards");
  const reportList = document.getElementById("expenseReportList");

  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  const data = await API.request(`/api/accounts/expenses?${params.toString()}`);
  const expenses = data.expenses || [];
  const summary = data.summary || {};

  // Summary cards
  summaryCards.style.display = "grid";
  summaryCards.innerHTML = [
    ["Total Spent", currency(summary.total), `${summary.count || 0} entries`],
    ["Cash Expenses", currency(summary.cash), ""],
    ["Online Expenses", currency(summary.online), "UPI / Card"],
  ].map(([label, value, sub]) => `
    <article class="metric-card">
      <div class="eyebrow">${label}</div>
      <h2>${value}</h2>
      ${sub ? `<div class="helper" style="margin-top: 4px; font-size: 0.82rem;">${sub}</div>` : ""}
    </article>
  `).join("");

  if (!expenses.length) {
    reportList.innerHTML = `<div class="empty-state">No expenses found for the selected criteria.</div>`;
    showMessage("expenseReportMessage", "No results found.");
    return;
  }

  reportList.innerHTML = expenses.map((e) => {
    const enteredAt = e.created_at
      ? new Date(e.created_at + (e.created_at.endsWith("Z") ? "" : "Z")).toLocaleString("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "—";

    const modeLabel = e.payment_mode === "upi" ? "UPI" : e.payment_mode === "card" ? "Card" : "Cash";
    const modeColor = e.payment_mode === "cash" ? "var(--primary)" : "var(--accent)";

    return `
      <div class="list-item">
        <strong>${currency(e.amount)}</strong>
        <span style="margin-left: 8px; font-size: 0.8rem; font-weight: 700; color: ${modeColor};">${modeLabel}</span><br />
        <span>📂 ${e.category || "General"} ${e.notes ? `— ${e.notes}` : ""}</span><br />
        <span style="font-size: 0.85rem; color: var(--muted);">
          📅 ${e.expense_date} &nbsp;|&nbsp; 🕐 Entered: ${enteredAt} &nbsp;|&nbsp; By: ${e.full_name || e.username || "—"}
        </span>
      </div>
    `;
  }).join("");

  showMessage("expenseReportMessage", `${expenses.length} expense(s) found`);
}


// -- Vendor Management -----------------------------------------------------

let vendorsList = [];

async function loadVendors() {
  const data = await API.request("/api/accounts/vendors");
  vendorsList = data.vendors || [];
  renderVendorList(vendorsList);
}

function renderVendorList(vendors) {
  const list = document.getElementById("vendorList");
  if (!list) return;
  if (!vendors.length) {
    list.innerHTML = `<div class="empty-state">No vendors yet. Add one above.</div>`;
    return;
  }
  list.innerHTML = vendors.map(v => `
    <div class="list-item">
      <strong>${v.name}</strong>
      ${v.category ? `<span style="margin-left:8px;font-size:0.8rem;color:var(--muted);">${v.category}</span>` : ""}
      <br/>
      <span>${v.contact_person || ""} ${v.phone ? "� " + v.phone : ""}</span>
      ${v.notes ? `<br/><span style="font-size:0.82rem;color:var(--muted);">${v.notes}</span>` : ""}
      <div class="actions-row" style="margin-top:8px;">
        <button class="secondary-btn" data-edit-vendor="${v.id}" type="button">Edit</button>
        <button class="ghost-btn" data-deactivate-vendor="${v.id}" type="button">Remove</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll("[data-edit-vendor]").forEach(btn => {
    btn.addEventListener("click", () => {
      const v = vendorsList.find(x => x.id === Number(btn.dataset.editVendor));
      if (!v) return;
      document.getElementById("vendorFormId").value = v.id;
      document.getElementById("vendorName").value = v.name;
      document.getElementById("vendorContact").value = v.contact_person || "";
      document.getElementById("vendorPhone").value = v.phone || "";
      document.getElementById("vendorCategory").value = v.category || "";
      document.getElementById("vendorNotes").value = v.notes || "";
      document.getElementById("vendorSubmitBtn").textContent = "Update Vendor";
    });
  });

  list.querySelectorAll("[data-deactivate-vendor]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Remove this vendor from the active list?")) return;
      try {
        await API.request(`/api/accounts/vendors/${btn.dataset.deactivateVendor}`, { method: "DELETE" });
        await loadVendors();
        showMessage("vendorMessage", "Vendor removed.");
      } catch (e) {
        showMessage("vendorMessage", e.message, true);
      }
    });
  });
}

document.getElementById("vendorForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("vendorFormId").value;
  const payload = {
    name: document.getElementById("vendorName").value.trim(),
    contactPerson: document.getElementById("vendorContact").value.trim(),
    phone: document.getElementById("vendorPhone").value.trim(),
    category: document.getElementById("vendorCategory").value.trim(),
    notes: document.getElementById("vendorNotes").value.trim(),
  };
  try {
    if (id) {
      await API.request(`/api/accounts/vendors/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      showMessage("vendorMessage", "Vendor updated.");
    } else {
      await API.request("/api/accounts/vendors", { method: "POST", body: JSON.stringify(payload) });
      showMessage("vendorMessage", "Vendor added.");
    }
    await loadVendors();
    resetVendorForm();
  } catch (err) {
    showMessage("vendorMessage", err.message, true);
  }
});

function resetVendorForm() {
  document.getElementById("vendorForm").reset();
  document.getElementById("vendorFormId").value = "";
  document.getElementById("vendorSubmitBtn").textContent = "Add Vendor";
  showMessage("vendorMessage", "");
}

document.getElementById("clearVendorFormBtn")?.addEventListener("click", resetVendorForm);

// -- Full Financial Report -------------------------------------------------

function setDefaultFinancialReportDates() {
  const to = new Date();
  const from = new Date(to.getFullYear(), 0, 1); // Jan 1 this year
  const fmt = d => d.toISOString().split("T")[0];
  const fromEl = document.getElementById("finReportDateFrom");
  const toEl = document.getElementById("finReportDateTo");
  if (fromEl && !fromEl.value) fromEl.value = fmt(from);
  if (toEl && !toEl.value) toEl.value = fmt(to);
}

document.getElementById("loadFinReportBtn")?.addEventListener("click", async () => {
  try {
    await loadFullFinancialReport();
  } catch (err) {
    showMessage("finReportMessage", err.message, true);
  }
});

document.getElementById("downloadFinReportBtn")?.addEventListener("click", () => {
  const from = document.getElementById("finReportDateFrom")?.value;
  const to = document.getElementById("finReportDateTo")?.value;
  const params = new URLSearchParams();
  if (from) params.set("dateFrom", from);
  if (to) params.set("dateTo", to);
  window.location.href = `/api/accounts/financial-report/download?${params}`;
});

document.getElementById("printFinReportBtn")?.addEventListener("click", () => {
  const from = document.getElementById("finReportDateFrom")?.value || "";
  const to = document.getElementById("finReportDateTo")?.value || "";
  const cards = document.getElementById("finReportCards")?.innerHTML || "";
  const cats = document.getElementById("finReportCategoryList")?.innerHTML || "";
  const vendors = document.getElementById("finReportVendorList")?.innerHTML || "";
  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html><head><title>Financial Report ${from} to ${to}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 32px; color: #111; }
    h1 { font-size: 1.4rem; margin-bottom: 4px; }
    .period { color: #666; margin-bottom: 24px; font-size: 0.9rem; }
    .cards { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin-bottom: 24px; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 16px; }
    .card .label { font-size: 0.8rem; color: #666; margin-bottom: 4px; }
    .card .value { font-size: 1.3rem; font-weight: 700; }
    .section { margin-top: 24px; }
    .section h2 { font-size: 1rem; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
    .list-item { border: 1px solid #eee; border-radius: 6px; padding: 10px 14px; margin-bottom: 6px; }
    @media print { body { padding: 16px; } }
  </style></head><body>
  <h1>Financial Report</h1>
  <div class="period">Period: ${from} to ${to}</div>
  <div class="cards">${cards}</div>
  <div class="section"><h2>Expense by Category</h2>${cats}</div>
  <div class="section"><h2>Expense by Vendor</h2>${vendors}</div>
  <script>window.onload = () => window.print();<\/script>
  </body></html>`);
  win.document.close();
});

async function loadFullFinancialReport() {
  const from = document.getElementById("finReportDateFrom")?.value;
  const to = document.getElementById("finReportDateTo")?.value;
  const params = new URLSearchParams();
  if (from) params.set("dateFrom", from);
  if (to) params.set("dateTo", to);

  const data = await API.request(`/api/accounts/financial-report?${params}`);

  const summary = document.getElementById("finReportSummary");
  if (summary) summary.style.display = "block";

  const netColor = data.netRevenue >= 0 ? "var(--primary)" : "var(--danger)";

  document.getElementById("finReportCards").innerHTML = [
    ["Gross Sales", currency(data.grossSales), "Total bill value issued"],
    ["Refunds", currency(data.sales.refunds), "Patient refunds"],
    ["Total Sales (collected)", currency(data.sales.total), `${data.sales.billCount} bills (after refunds)`],
    ["Dues Cleared", currency(data.duesCleared.total), "From older bills"],
    ["Total Collected", currency(data.totalCollected), "Sales + dues"],
    ["Total Expenses", currency(data.expenses.total), `Cash: ${currency(data.expenses.cash)} | Online: ${currency(data.expenses.online)}`],
    ["Outstanding Dues", currency(data.outstandingDues), "Unpaid bills in period"],
    ["Net Revenue", currency(data.netRevenue), "Collected minus expenses"],
  ].map(([label, value, sub], i) => `
    <article class="metric-card">
      <div class="eyebrow">${label}</div>
      <h2 style="${label === "Net Revenue" ? `color:${netColor}` : ""}">${value}</h2>
      <div style="font-size:0.8rem;color:var(--muted);margin-top:4px;">${sub}</div>
    </article>
  `).join("");

  const cats = Object.entries(data.expenses.byCategory).sort((a, b) => b[1].total - a[1].total);
  document.getElementById("finReportCategoryList").innerHTML = cats.length
    ? cats.map(([cat, v]) => `
        <div class="list-item">
          <strong>${cat}</strong><br/>
          <span>Total: <strong>${currency(v.total)}</strong> &nbsp;|&nbsp; Cash: ${currency(v.cash)} &nbsp;|&nbsp; Online: ${currency(v.online)}</span>
        </div>
      `).join("")
    : `<div class="empty-state">No expenses in this period.</div>`;

  const vends = Object.entries(data.expenses.byVendor).sort((a, b) => b[1] - a[1]);
  document.getElementById("finReportVendorList").innerHTML = vends.length
      ? vends.map(([name, total]) => `
          <div class="list-item">
            <strong>${name}</strong> &nbsp;|&nbsp; <strong>${currency(total)}</strong>
          </div>
        `).join("")
      : `<div class="empty-state">No vendor-linked expenses in this period.</div>`;

  // Expense by Source
  const sourceGrid = document.getElementById("finReportSourceList") || document.createElement("div");
  sourceGrid.id = "finReportSourceList";
  sourceGrid.className = "list";
  const sources = Object.entries(data.expenses.bySource).sort((a, b) => b[1] - a[1]);
  const sourceHTML = sources.length
    ? sources.map(([src, total]) => `
        <div class="list-item">
          <strong>${src.charAt(0).toUpperCase() + src.slice(1)}</strong>: ${currency(total)}
        </div>
    `).join("")
    : `<div class="empty-state">No sources found.</div>`;
  
  const sourceTitle = document.getElementById("finReportSourceTitle") || document.createElement("div");
  sourceTitle.id = "finReportSourceTitle";
  sourceTitle.className = "section-title tight";
  sourceTitle.style.marginTop = "16px";
  sourceTitle.innerHTML = "<h2>Expense by Source</h2>";

  const summaryEl = document.getElementById("finReportSummary");
  if (summaryEl && !document.getElementById("finReportSourceList")) {
    summaryEl.appendChild(sourceTitle);
    summaryEl.appendChild(sourceGrid);
  }
  if (document.getElementById("finReportSourceList")) {
    document.getElementById("finReportSourceList").innerHTML = sourceHTML;
  }

  showMessage("finReportMessage", `Report generated for ${from} to ${to}`);
}

// -- Salary Management -------------------------------------------------------

let salaryPaymentsList = [];
let employeesForSalaryCache = [];

// Initialize salary management when page loads
async function initSalaryManagement() {
  try {
    // Load employees for select dropdowns
    const response = await API.request("/api/users");
    employeesForSalaryCache = (response.users || []).filter(u => u.active);
    
    // Populate employee select dropdowns
    populateSalaryEmployeeSelects();
    
    // Load salary payments
    await loadSalaryPayments();
    
    // Setup event listeners
    setupSalaryEventListeners();
  } catch (error) {
    console.error("Error initializing salary management:", error);
    showMessage("salaryFormMessage", "Error loading salary data", "error");
  }
}

function populateSalaryEmployeeSelects() {
  const employeeSelect = document.getElementById("salaryEmployeeSelect");
  const filterSelect = document.getElementById("salaryListEmployeeFilter");
  
  if (employeeSelect) {
    employeeSelect.innerHTML = '<option value="">Select employee</option>' +
      employeesForSalaryCache.map(emp => {
        const displayName = emp.full_name && emp.full_name.trim() ? emp.full_name : emp.username;
        return `<option value="${emp.id}">${displayName} (${emp.username})</option>`;
      }).join("");
  }
  
  if (filterSelect) {
    filterSelect.innerHTML = '<option value="">All employees</option>' +
      employeesForSalaryCache.map(emp => {
        const displayName = emp.full_name && emp.full_name.trim() ? emp.full_name : emp.username;
        return `<option value="${emp.id}">${displayName}</option>`;
      }).join("");
  }
}

function setupSalaryEventListeners() {
  if (salaryForm) {
    salaryForm.addEventListener("submit", handleSalaryFormSubmit);
  }
  document.getElementById("clearSalaryFormBtn")?.addEventListener("click", () => {
    salaryForm.reset();
    document.getElementById("salaryFormId").value = "";
  });
  
  if (salaryPaymentForm) {
    salaryPaymentForm.addEventListener("submit", handleSalaryPaymentSubmit);
  }
  
  document.getElementById("applySalaryFiltersBtn")?.addEventListener("click", loadSalaryPayments);
  document.getElementById("saveSalaryBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    handleSalaryFormSubmit.call(salaryForm);
  });
  document.getElementById("markSalaryPaidBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    handleSalaryPaymentSubmit.call(salaryPaymentForm);
  });
}

async function loadSalaryPayments() {
  try {
    const userId = document.getElementById("salaryListEmployeeFilter")?.value || "";
    const paymentMonth = document.getElementById("salaryListMonthFilter")?.value || "";
    const isPaid = document.getElementById("salaryListStatusFilter")?.value !== "" ? 
      document.getElementById("salaryListStatusFilter").value : "";

    const params = new URLSearchParams();
    if (userId) params.set("userId", userId);
    if (paymentMonth) params.set("paymentMonth", paymentMonth);
    if (isPaid !== "") params.set("isPaid", isPaid);

    const data = await API.request(`/api/salaries?${params.toString()}`);
    salaryPaymentsList = data.salaryPayments || [];

    renderSalaryList(salaryPaymentsList);
    updateSalarySummary(salaryPaymentsList);
    populateSalaryPaymentSelect();

    showMessage("salaryListMessage", `${salaryPaymentsList.length} record(s) found`);
  } catch (error) {
    console.error("Error loading salary payments:", error);
    showMessage("salaryListMessage", "Error loading salary records", "error");
  }
}

function populateSalaryPaymentSelect() {
  const select = document.getElementById("salaryPaymentSelect");
  if (!select) return;

  const unpaidRecords = salaryPaymentsList.filter(sp => !sp.isPaid);
  
  select.innerHTML = unpaidRecords.length === 0 
    ? '<option value="">-- No unpaid salaries --</option>'
    : '<option value="">Select a salary to mark as paid</option>' +
      unpaidRecords.map(sp => {
        const displayName = sp.fullName && sp.fullName.trim() ? sp.fullName : sp.username;
        return `<option value="${sp.id}" data-amount="${sp.salaryAmount}">
          ${displayName} - ${sp.paymentMonth} (?${sp.salaryAmount.toFixed(2)})
        </option>`;
      }).join("");

  select.addEventListener("change", function() {
    if (this.value) {
      const selected = unpaidRecords.find(sp => sp.id == this.value);
      if (selected) {
        document.getElementById("salaryPaymentRecordId").value = selected.id;
        document.getElementById("salaryPaymentPaidAmount").value = selected.salaryAmount.toFixed(2);
        document.getElementById("salaryPaymentPaymentDate").valueAsDate = new Date();
      }
    }
  });
}

function renderSalaryList(records) {
  if (!salaryList) return;

  if (records.length === 0) {
    salaryList.innerHTML = '<div class="empty-state">No salary records found. Create one above.</div>';
    return;
  }

  salaryList.innerHTML = records.map(sp => {
    const statusBadge = sp.isPaid 
      ? '<span style="color: var(--accent); font-weight: 600;">? PAID</span>'
      : '<span style="color: #ff6b6b; font-weight: 600;">UNPAID</span>';

    const paymentInfo = sp.isPaid 
      ? `Paid: ?${sp.paidAmount.toFixed(2)} via ${sp.paymentMode} on ${sp.paymentDate}`
      : `Not paid yet`;

    return `
      <div class="list-item salary-item" data-id="${sp.id}">
        <div style="display: flex; justify-content: space-between; align-items: start;">
          <div>
            <strong>${sp.fullName && sp.fullName.trim() ? sp.fullName : sp.username}</strong><br />
            <span style="font-size: 0.85rem; color: var(--muted);">
              ${sp.employmentTitle || "�"} | ID: ${sp.username}
            </span><br />
            <span style="font-weight: 600; margin-top: 4px; display: inline-block;">
              ${sp.paymentMonth} � ?${sp.salaryAmount.toFixed(2)}
            </span>
          </div>
          <div style="text-align: right;">
            ${statusBadge}<br />
            <span style="font-size: 0.85rem; color: var(--muted);">
              ${paymentInfo}
            </span>
          </div>
        </div>
        ${sp.notes ? `<div style="font-size: 0.85rem; color: var(--muted); margin-top: 4px;">?? ${sp.notes}</div>` : ""}
        <div style="display: flex; gap: 8px; margin-top: 8px;">
          <button class="ghost-btn small" data-action="edit" data-id="${sp.id}">Edit</button>
          ${!sp.isPaid ? `<button class="ghost-btn small" data-action="delete" data-id="${sp.id}">Delete</button>` : ""}
        </div>
      </div>
    `;
  }).join("");

  // Attach event listeners to edit/delete buttons
  salaryList.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const action = btn.dataset.action;
      const recordId = Number(btn.dataset.id);

      if (action === "edit") {
        const record = salaryPaymentsList.find(sp => sp.id === recordId);
        if (record) {
          document.getElementById("salaryEmployeeSelect").value = record.userId;
          document.getElementById("salaryPaymentMonth").value = record.paymentMonth;
          document.getElementById("salarySalaryAmount").value = record.salaryAmount;
          document.getElementById("salaryNotes").value = record.notes || "";
          document.getElementById("salaryFormId").value = recordId;
        }
      } else if (action === "delete") {
        if (confirm("Delete this salary record?")) {
          try {
            await API.request(`/api/salaries/${recordId}`, { method: "DELETE" });
            showMessage("salaryListMessage", "Record deleted successfully");
            await loadSalaryPayments();
          } catch (error) {
            showMessage("salaryListMessage", "Error deleting record", "error");
          }
        }
      }
    });
  });
}

function updateSalarySummary(records) {
  if (!salarySummaryCards) return;

  const totalSalaries = records.reduce((sum, sp) => sum + sp.salaryAmount, 0);
  const totalPaid = records.filter(sp => sp.isPaid).reduce((sum, sp) => sum + sp.salaryAmount, 0);
  const totalPending = totalSalaries - totalPaid;
  const paidCount = records.filter(sp => sp.isPaid).length;
  const pendingCount = records.filter(sp => !sp.isPaid).length;

  salarySummaryCards.innerHTML = [
    ["Total Salary Expense", currency(totalSalaries), `${records.length} records`],
    ["Paid Salaries", currency(totalPaid), `${paidCount} employees`],
    ["Pending Payment", currency(totalPending), `${pendingCount} employees`],
  ].map(([label, value, sub]) => `
    <article class="metric-card">
      <div class="eyebrow">${label}</div>
      <h2>${value}</h2>
      <div class="helper" style="margin-top: 4px; font-size: 0.82rem;">${sub}</div>
    </article>
  `).join("");
}

async function handleSalaryFormSubmit(e) {
  e.preventDefault();

  const recordId = document.getElementById("salaryFormId").value;
  const userId = Number(document.getElementById("salaryEmployeeSelect").value);
  const paymentMonth = document.getElementById("salaryPaymentMonth").value;
  const salaryAmount = Number(document.getElementById("salarySalaryAmount").value);
  const notes = document.getElementById("salaryNotes").value.trim();

  if (!userId || !paymentMonth || !salaryAmount) {
    showMessage("salaryFormMessage", "Please fill all required fields", "error");
    return;
  }

  try {
    let response;
    if (recordId) {
      // Update existing record
      response = await API.request(`/api/salaries/${recordId}`, {
        method: "PUT",
        body: JSON.stringify({ salaryAmount, notes }),
      });
    } else {
      // Create new record
      response = await API.request("/api/salaries", {
        method: "POST",
        body: JSON.stringify({ userId, paymentMonth, salaryAmount, notes }),
      });
    }

    showMessage("salaryFormMessage", response.message || "Record saved successfully");
    salaryForm.reset();
    document.getElementById("salaryFormId").value = "";
    await loadSalaryPayments();
  } catch (error) {
    showMessage("salaryFormMessage", error.message || "Error saving record", "error");
  }
}

async function handleSalaryPaymentSubmit(e) {
  e.preventDefault();

  const recordId = Number(document.getElementById("salaryPaymentRecordId").value);
  const paidAmount = Number(document.getElementById("salaryPaymentPaidAmount").value);
  const paymentMode = document.getElementById("salaryPaymentMode").value;
  const paymentDate = document.getElementById("salaryPaymentPaymentDate").value;
  const notes = document.getElementById("salaryPaymentNotes").value.trim();

  if (!recordId || !paidAmount || !paymentMode || !paymentDate) {
    showMessage("salaryPaymentMessage", "Please fill all required fields", "error");
    return;
  }

  try {
    const response = await API.request(`/api/salaries/${recordId}/mark-paid`, {
      method: "POST",
      body: JSON.stringify({ paidAmount, paymentMode, paymentDate, notes }),
    });

    showMessage("salaryPaymentMessage", response.message || "Salary marked as paid");
    salaryPaymentForm.reset();
    await loadSalaryPayments();
  } catch (error) {
    showMessage("salaryPaymentMessage", error.message || "Error marking as paid", "error");
  }
}

// Hook into window navigation to load salary data when needed
document.addEventListener("hashchange", function() {
  const hash = window.location.hash;
  if (hash === "#window-salary-management") {
    initSalaryManagement();
  }
});


(async function init() {
  try {
    applyRoleDefaults(document.getElementById("role").value);
    setCardUser(null);
    setDefaultFinancialDateRange();
    setDefaultFinancialReportDates();
    initializeSectionNavigation();

    document.getElementById("importTestsBtn")?.addEventListener("click", importTestCatalog);

    const loadAccountsLogBtn = document.getElementById("loadAccountsLogBtn");
    if (loadAccountsLogBtn) {
      loadAccountsLogBtn.addEventListener("click", async () => {
        try {
          await loadDailyAccountsLog();
        } catch (error) {
          showMessage("accountsLogMessage", error.message, true);
        }
      });
    }

    if (patientDataDateFrom && !patientDataDateFrom.value) {
      const todayStr = new Date().toISOString().split("T")[0];
      patientDataDateFrom.value = todayStr;
      patientDataDateTo.value = todayStr;
    }

    downloadPatientDataCsvBtn?.addEventListener("click", async () => {
      const from = patientDataDateFrom.value;
      const to = patientDataDateTo.value;
      const token = localStorage.getItem("labToken");
      const url = `/api/dashboard/patient-data-csv?dateFrom=${from}&dateTo=${to}`;

      try {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || "Unable to download patient data");
        }

        const blob = await response.blob();
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `patient-data-${from}-to-${to}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
        showMessage("patientDataMessage", "Download complete");
      } catch (error) {
        showMessage("patientDataMessage", error.message, true);
      }
    });

    const loadDueReportAuditBtn = document.getElementById("loadDueReportAuditBtn");
    if (loadDueReportAuditBtn) {
      loadDueReportAuditBtn.addEventListener("click", async () => {
        try {
          await loadDueReportsAudit();
        } catch (error) {
          showMessage("auditDueReportMessage", error.message, true);
        }
      });
    }

    const searchExpenseReportBtn = document.getElementById("searchExpenseReportBtn");
    if (searchExpenseReportBtn) {
      searchExpenseReportBtn.addEventListener("click", async () => {
        try {
          await loadExpenseReport();
        } catch (error) {
          showMessage("expenseReportMessage", error.message, true);
        }
      });
    }

    const startupLoads = [
      ["dashboard", loadDashboard],
      ["financial report", loadFinancialReport],
      ["doctors", async () => {
        const catData = await API.request("/api/tests/categories");
        testCategories = catData.categories || [];
        await loadDoctors();
      }],
      ["associates", loadAssociates],
      ["tests", loadTests],
    ];

    if (isAdminRole()) {
      startupLoads.push(["users", loadUsers]);
    }

    const results = await Promise.allSettled(
      startupLoads.map(async ([label, loader]) => {
        try {
          await loader();
        } catch (error) {
          throw new Error(`${label}: ${error.message}`);
        }
      })
    );

    results
      .filter((result) => result.status === "rejected")
      .forEach((result) => console.error("Admin startup load failed:", result.reason));
  } catch (error) {
    console.error("Admin initialization failed:", error);
  }
})();