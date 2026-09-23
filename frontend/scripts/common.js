const API = {
  async request(path, options = {}) {
    const token = localStorage.getItem("labToken");
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(path, { ...options, headers });
    const contentType = response.headers.get("content-type") || "";

    if (!response.ok) {
      let errorBody;
      if (contentType.includes("application/json")) {
        errorBody = await response.json();
      } else {
        const responseText = await response.text();
        const missingRoute = /Cannot (?:GET|POST|PATCH|PUT|DELETE)\s+([^<\s]+)/i.test(responseText);
        errorBody = {
          message: missingRoute
            ? "The app server needs to be restarted to finish applying this update."
            : responseText,
        };
      }

      if (response.status === 401 && path !== "/api/auth/login") {
        clearSession();
        if (!window.location.pathname.endsWith("login.html")) {
          window.location.href = "login.html?session=expired";
        }
        throw new Error("Your session expired. Please sign in again.");
      }

      if (response.status === 423 && errorBody.code === "SUBSCRIPTION_EXPIRED") {
        const user = getUser();
        if (user?.role === "superadmin") {
          localStorage.setItem("labSubscriptionExpired", "1");
          if (!window.location.pathname.endsWith("subscription.html")) {
            window.location.href = "subscription.html";
          }
        } else {
          clearSession();
          if (!window.location.pathname.endsWith("login.html")) {
            window.location.href = "login.html?subscription=expired";
          }
        }
      }

      throw new Error(errorBody.message || "Request failed");
    }

    if (contentType.includes("application/json")) {
      return response.json();
    }

    return response.text();
  },
};

const DEFAULT_BUSINESS_NAME = "Your Diagnostic Centre";
let currentBusinessName = DEFAULT_BUSINESS_NAME;

function getBusinessName() {
  return currentBusinessName;
}

function setBusinessName(value) {
  const nextBusinessName = String(value || "").trim() || DEFAULT_BUSINESS_NAME;
  currentBusinessName = nextBusinessName;
  document.querySelectorAll(".brand, [data-business-name]").forEach((element) => {
    element.textContent = nextBusinessName;
  });
  return currentBusinessName;
}

async function loadBusinessBranding() {
  try {
    const response = await fetch("/api/settings/branding");
    if (!response.ok) return;
    const settings = await response.json();
    setBusinessName(settings.businessName);
  } catch (_error) {
    // Keep the installed default visible if branding cannot be loaded.
  }
}

loadBusinessBranding();

function saveSession(data) {
  localStorage.setItem("labToken", data.token);
  localStorage.setItem("labUser", JSON.stringify(data.user));
  if (data.setupRequired) {
    localStorage.setItem("labSetupRequired", "1");
  } else {
    localStorage.removeItem("labSetupRequired");
  }
  if (data.subscriptionExpired) {
    localStorage.setItem("labSubscriptionExpired", "1");
  } else {
    localStorage.removeItem("labSubscriptionExpired");
  }
}

function getUser() {
  const raw = localStorage.getItem("labUser");
  return raw ? JSON.parse(raw) : null;
}

function clearSession() {
  localStorage.removeItem("labToken");
  localStorage.removeItem("labUser");
  localStorage.removeItem("labSetupRequired");
  localStorage.removeItem("labSubscriptionExpired");
}

function hasPermission(permission) {
  const user = getUser();
  if (!user || !Array.isArray(user.permissions)) return false;
  return user.permissions.includes(permission);
}

function hasAccessControl(control) {
  const user = getUser();
  if (!user || !user.accessControls) return false;
  return !!user.accessControls[control];
}

function isAdministrativeRole(role = getUser()?.role) {
  return role === "superadmin" || role === "admin";
}

function hasRoleAccess(allowedRoles, role = getUser()?.role) {
  return allowedRoles.includes(role) || (allowedRoles.includes("admin") && isAdministrativeRole(role));
}

function protectPage(allowedRoles) {
  const user = getUser();
  if (!user) {
    window.location.href = "login.html";
    return null;
  }

  if (allowedRoles && allowedRoles.length > 0 && !hasRoleAccess(allowedRoles, user.role)) {
    window.location.href = "login.html";
    return null;
  }

  if (user.role === "superadmin" && localStorage.getItem("labSetupRequired") === "1"
    && !window.location.pathname.endsWith("setup.html")) {
    window.location.href = "setup.html";
    return null;
  }

  if (user.role === "superadmin"
    && localStorage.getItem("labSubscriptionExpired") === "1"
    && !window.location.pathname.endsWith("subscription.html")
    && !window.location.pathname.endsWith("setup.html")) {
    window.location.href = "subscription.html";
    return null;
  }

  // Covers an existing browser session after the app has been newly installed
  // or restored from a backup, where the setup flag was not stored locally.
  if (user.role === "superadmin" && !window.location.pathname.endsWith("setup.html")) {
    API.request("/api/settings/business")
      .then((settings) => {
        if (settings && !settings.setupCompleted) {
          localStorage.setItem("labSetupRequired", "1");
          window.location.href = "setup.html";
        }
      })
      .catch(() => {});
  }

  const currentUser = document.getElementById("currentUser");
  if (currentUser) {
    currentUser.textContent = `Welcome, ${user.username}!`;
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await API.request("/api/auth/logout", { method: "POST" });
      } catch (_error) {
        // ignore
      } finally {
        clearSession();
        window.location.href = "login.html";
      }
    });
  }

  // Sidebar navigation: show/hide sections
  // Skip for reception.html as it has its own logic
  if (!window.location.pathname.includes("reception.html")) {
    const allSections = document.querySelectorAll("main .panel, main section[id]");
    const navLinks = document.querySelectorAll(".sidebar-nav a");

    const showSection = (targetId) => {
      allSections.forEach(section => {
        if (section.id) section.hidden = section.id !== targetId;
      });
      navLinks.forEach(link => {
        const href = link.getAttribute("href") || "";
        link.classList.toggle("active", href === `#${targetId}`);
      });
    };

    navLinks.forEach(link => {
      link.addEventListener("click", e => {
        const href = link.getAttribute("href") || "";
        if (href.startsWith("#")) {
          e.preventDefault();
          const targetId = href.slice(1);
          showSection(targetId);
          link.dispatchEvent(new CustomEvent("sectionActivated", { bubbles: true, detail: { sectionId: targetId } }));
        }
      });
    });

    const activeLink = document.querySelector(".sidebar-nav a.active");
    if (activeLink) {
      const href = activeLink.getAttribute("href") || "";
      if (href.startsWith("#")) showSection(href.slice(1));
    } else if (navLinks.length > 0) {
      const firstHref = navLinks[0].getAttribute("href") || "";
      if (firstHref.startsWith("#")) showSection(firstHref.slice(1));
    }
  }

  return user;
}

// Alias for compatibility
function initPage(role) { return protectPage(role ? [role] : []); }

function getRoleHome(role, user) {
  switch (role) {
    case "superadmin":
    case "admin": return "admin.html";
    case "manager": return "admin.html";
    case "receptionist": return "reception.html";
    case "na": return Array.isArray(user?.permissions) && user.permissions.includes("collect_due_payments")
      ? "reception.html#due-collection"
      : "login.html";
    case "blood_sample_technician": return "reception.html#results-entry";
    case "ct_technician": return "ct_technician.html";
    case "mri_technician": return "mri_technician.html";
    case "usg_technician": return "usg_technician.html";
    default: return "login.html";
  }
}

function currency(value) {
  return `Rs. ${Number(value || 0).toFixed(2)}`;
}

function formatDate(dateString) {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  } catch (_error) {
    return dateString;
  }
}

function isPathologyTest(testName = "", testCategory = "") {
  return ReportEligibility.isPathologyTest(testName, testCategory);
}

function showMessage(elementId, message, isError = false) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = message;
  element.className = `message ${isError ? "error" : "success"}`;
  setTimeout(() => {
    element.textContent = "";
    element.className = "message";
  }, 4000);
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function createHiddenPrintFrame() {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;visibility:hidden;";
  document.body.appendChild(frame);
  return frame;
}

function printHtmlInHiddenFrame(frame, html) {
  const printWindow = frame?.contentWindow;
  const printDocument = frame?.contentDocument || printWindow?.document;
  if (!printWindow || !printDocument) {
    frame?.remove();
    throw new Error("Unable to prepare the print document.");
  }

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    frame.remove();
  };

  printDocument.open();
  printDocument.write(html);
  printDocument.close();
  printWindow.addEventListener("afterprint", cleanup, { once: true });

  const imageLoads = Array.from(printDocument.images || []).map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    });
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, 1200));

  Promise.race([Promise.all(imageLoads), timeout])
    .then(() => {
      printWindow.focus();
      printWindow.print();
      // Browsers that do not emit afterprint still release the hidden frame.
      setTimeout(cleanup, 60000);
    })
    .catch(cleanup);
}

function openHtmlReport(visitId, shouldPrint = false, includeLetterhead = null) {
  const token = localStorage.getItem("labToken");
  const printFrame = shouldPrint ? createHiddenPrintFrame() : null;
  const popup = shouldPrint ? null : window.open("", "_blank", "width=900,height=700");
  if (!shouldPrint && !popup) return alert("Please allow popups for this site.");

  if (popup) popup.document.write("<html><body><p>Loading report...</p></body></html>");
  const letterheadQuery = includeLetterhead === false ? "&letterhead=0" : includeLetterhead === true ? "&letterhead=1" : "";
  const printModeQuery = shouldPrint ? "&print=1" : "";
  fetch(`/api/visits/${visitId}/report?format=html${letterheadQuery}${printModeQuery}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(r => r.ok ? r.text() : Promise.reject("Failed"))
    .then(html => {
      if (printFrame) {
        printHtmlInHiddenFrame(printFrame, html);
        return;
      }
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
    })
    .catch(() => { printFrame?.remove(); popup?.close(); alert("Unable to open report"); });
}

function openHtmlBill(visitId, shouldPrint = false, existingPopup = null) {
  const token = localStorage.getItem("labToken");
  const printFrame = shouldPrint && !existingPopup ? createHiddenPrintFrame() : null;
  const popup = existingPopup || (printFrame ? null : window.open("", "_blank", "width=900,height=700"));
  if (!popup && !printFrame) return alert("Please allow popups for this site.");

  if (popup && !existingPopup) {
    popup.document.write("<html><body><p>Loading bill...</p></body></html>");
  }

  fetch(`/api/visits/${visitId}/bill?format=html`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(r => r.ok ? r.text() : Promise.reject("Failed"))
    .then(html => {
      if (printFrame) {
        printHtmlInHiddenFrame(printFrame, html);
        return;
      }
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      if (shouldPrint) setTimeout(() => popup.print(), 250);
    })
    .catch(() => {
      printFrame?.remove();
      if (!existingPopup) popup?.close();
      alert("Unable to open bill");
    });
}

async function shareBillViaWhatsApp(visitId) {
  const whatsappWindow = window.open("about:blank", "_blank");
  try {
    const bill = await API.request(`/api/visits/${visitId}/bill-share`);
    const rawPhone = String(bill.patientPhone || "").replace(/\D/g, "");
    if (!rawPhone) {
      throw new Error("Add the patient's phone number before sharing the bill.");
    }

    const whatsappPhone = rawPhone.length === 10
      ? `91${rawPhone}`
      : rawPhone.length === 11 && rawPhone.startsWith("0")
        ? `91${rawPhone.slice(1)}`
        : rawPhone;
    const message = [
      `Dear ${bill.patientName || "Patient"},`,
      `Your bill receipt for ${bill.billNo || "your visit"} is ready.`,
      `Open or download it securely here: ${bill.billUrl}`,
    ].join("\n");

    const whatsappUrl = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`;
    if (whatsappWindow) {
      whatsappWindow.location.replace(whatsappUrl);
    } else {
      window.location.href = whatsappUrl;
    }
  } catch (error) {
    whatsappWindow?.close();
    alert(error.message || "Unable to prepare the bill for WhatsApp.");
  }
}

async function downloadBillPdf(visitId, billNo = "") {
  if (typeof html2pdf !== "function") {
    throw new Error("The PDF generator is not available. Refresh the page and try again.");
  }

  const billHtml = await API.request(`/api/visits/${visitId}/bill?format=html`);
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;visibility:hidden;";
  document.body.appendChild(iframe);

  try {
    const documentFrame = iframe.contentDocument || iframe.contentWindow?.document;
    if (!documentFrame) throw new Error("Unable to prepare the bill PDF.");
    documentFrame.open();
    documentFrame.write(billHtml);
    documentFrame.close();

    await new Promise((resolve) => setTimeout(resolve, 500));
    const billContent = documentFrame.body;
    if (!billContent?.querySelector(".bill-slip, .receipt")) throw new Error("The bill layout could not be prepared.");

    const cleanBillNo = String(billNo || `visit-${visitId}`).replace(/[^a-z0-9_-]/gi, "_");
    await html2pdf()
      .set({
        margin: 0,
        filename: `Bill_${cleanBillNo}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false, scrollY: 0, scrollX: 0 },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(billContent)
      .save();
  } finally {
    document.body.removeChild(iframe);
  }
}

async function shareAndDownloadReport(visitId, includeLetterhead = null, shareViaWhatsApp = true, patientPhoneInput = "") {
  try {
    const user = getUser();
    if (!user) throw new Error("Please log in first");
    if (shareViaWhatsApp && !hasPermission("share_whatsapp_pdf")) {
      throw new Error("You need WhatsApp Report PDF permission to share a report.");
    }
    if (!shareViaWhatsApp && !hasPermission("download_reports")) {
      throw new Error("You need Download Report PDF permission to download a report.");
    }

    const data = await API.request(`/api/visits/${visitId}`);
    const visit = data.visit;
    const tests = data.tests || [];
    const patientPhone = visit.phone;
    const billNo = visit.bill_no;
    const patientName = visit.patient_name;

    const total = Number(visit.total_amount || 0);
    const paid = Number(visit.amount_paid || 0);
    if (paid < total) {
      const proceed = confirm(`Patient has an outstanding balance of ${currency(total - paid)}. Proceed anyway?`);
      if (!proceed) return;
    }

    const hasPathology = tests.some(t => isPathologyTest(t.name, t.category));
    if (!hasPathology) return alert("WhatsApp Sharing is only for Pathology/Blood reports.");

    let whatsappShare = null;
    if (shareViaWhatsApp) {
      let patientPhone = String(patientPhoneInput || visit.phone || "").trim();
      if (!patientPhone) {
        patientPhone = window.prompt("Enter the patient's WhatsApp phone number. It will be saved to this patient record.", "") || "";
      }
      patientPhone = patientPhone.trim();
      if (!patientPhone) return;

      const contact = await API.request(`/api/visits/${visitId}/report-contact`, {
        method: "PATCH",
        body: JSON.stringify({ phone: patientPhone }),
      });
      const phoneDigits = String(contact.patientPhone || patientPhone).replace(/\D/g, "");
      const whatsappPhone = phoneDigits.length === 10
        ? `91${phoneDigits}`
        : phoneDigits.length === 11 && phoneDigits.startsWith("0")
          ? `91${phoneDigits.slice(1)}`
          : phoneDigits;
      if (whatsappPhone.length < 7 || whatsappPhone.length > 15) {
        throw new Error("Enter a valid patient WhatsApp number.");
      }

      whatsappShare = {
        phone: whatsappPhone,
        message: [
          `Dear ${contact.patientName || patientName || "Patient"},`,
          `Your lab report for Bill ${contact.billNo || billNo || ""} is ready.`,
          `The PDF has been saved to this computer. Attach it in WhatsApp, or open the secure report here: ${contact.reportUrl}`,
        ].join("\n"),
      };
    }

    const letterheadQuery = includeLetterhead === false ? "&letterhead=0" : includeLetterhead === true ? "&letterhead=1" : "";
    const whatsappQuery = shareViaWhatsApp ? "&whatsapp=1" : "";
    const reportHtml = await API.request(`/api/visits/${visitId}/report?format=html&pdf=1${whatsappQuery}${letterheadQuery}&actions=0`);
    const pdfFileName = `Report_${billNo}_${patientName.replace(/\s+/g, '_')}.pdf`;

    if (window.labLmsDesktop?.saveReportPdf) {
      const saved = await window.labLmsDesktop.saveReportPdf(reportHtml, pdfFileName);
      if (saved?.canceled) return;
      if (whatsappShare) {
        window.open(`https://wa.me/${whatsappShare.phone}?text=${encodeURIComponent(whatsappShare.message)}`, "_blank", "noopener");
      }
      return;
    }

    const opt = {
      margin: 0,
      filename: pdfFileName,
      image: { type: 'jpeg', quality: 1.0 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        allowTaint: false,
        scrollY: 0,
        scrollX: 0,
        windowWidth: 794,
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    };

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:none;';
    document.body.appendChild(iframe);

    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      iframeDoc.open();
      const pdfLayoutOverrides = `
        <style>
          html { padding: 0 !important; background: #fff !important; }
          body { margin: 0 !important; width: 210mm !important; background: #fff !important; box-shadow: none !important; }
          body.multi-report { width: 210mm !important; min-height: 0 !important; padding: 0 !important; }
          .multi-report-page { width: 210mm !important; min-height: 297mm !important; margin: 0 !important; box-shadow: none !important; }
          .report-view-controls, .view-only-print-notice { display: none !important; }
        </style>`;
      iframeDoc.write(reportHtml.replace(/<\/head>/i, `${pdfLayoutOverrides}</head>`));
      iframeDoc.close();

      await Promise.race([
        Promise.all(Array.from(iframeDoc.images).map((image) => image.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              image.addEventListener("load", resolve, { once: true });
              image.addEventListener("error", resolve, { once: true });
            }))),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);

      // html2pdf clones only the supplied body into the parent document. Carry
      // the report's own styles with that body so A4, letterhead and signature
      // sizing survive the clone in ordinary web browsers.
      Array.from(iframeDoc.head.querySelectorAll("style")).forEach((style) => {
        iframeDoc.body.insertBefore(style.cloneNode(true), iframeDoc.body.firstChild);
      });
      await html2pdf().from(iframeDoc.body).set(opt).save();
    } finally {
      document.body.removeChild(iframe);
    }

    if (whatsappShare) {
      window.open(`https://wa.me/${whatsappShare.phone}?text=${encodeURIComponent(whatsappShare.message)}`, "_blank", "noopener");
    }

  } catch (error) {
    console.error("Report sharing error:", error);
    alert(error.message || "Unable to generate or share report");
  }
}

function downloadReportPdf(visitId, includeLetterhead = null) {
  return shareAndDownloadReport(visitId, includeLetterhead, false);
}

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;

  const action = event.data?.action;
  const visitId = Number(event.data?.visitId);
  const patientPhone = String(event.data?.patientPhone || "").trim();
  if (event.data?.type !== "lab-lms-report-action" || !Number.isInteger(visitId) || visitId <= 0) return;

  if (action === "whatsapp") {
    shareAndDownloadReport(visitId, null, true, patientPhone);
    return;
  }

  if (action === "download") {
    downloadReportPdf(visitId).catch((error) => {
      alert(error.message || "Unable to download the report PDF.");
    });
  }
});

function normalizeCalculationParameterName(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function escapeResultFieldHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderResultParameterField(parameter, savedResults = []) {
  const parameterName = String(parameter.parameter_name || "");
  const isHeader = [
    "CBC (Complete Blood Count)",
    "TLC (Total Leukocytes Count)",
    "DLC (Differential Leukocytes Count)",
    "ESR (Erythrocyte Sedimentation Rate)",
    "RBC COUNT",
    "PROTHROMBIN TIME STUDIES"
  ].includes(parameterName);
  const savedResult = savedResults.find((result) =>
    normalizeCalculationParameterName(result.parameter_name) === normalizeCalculationParameterName(parameterName)
  );
  const normalizedParameterName = parameterName.toLowerCase();
  const value = savedResult?.value ?? (normalizedParameterName.includes("sample type")
    ? "Blood"
    : normalizedParameterName.includes("tuberculin dose")
      ? "0.1 mL of 1 TU PPD"
      : "");
  const entryMode = parameter.entry_mode === "calculated" ? "calculated" : "manual";
  const attributes = `data-parameter-row data-parameter-name="${escapeResultFieldHtml(parameterName)}" data-unit="${escapeResultFieldHtml(parameter.unit || "")}" data-range="${escapeResultFieldHtml(parameter.normal_range || "")}" data-entry-mode="${entryMode}" data-calculation-formula="${escapeResultFieldHtml(parameter.calculation_formula || "")}" data-calculation-precision="${escapeResultFieldHtml(parameter.calculation_precision ?? 2)}"`;
  const headerStyle = "grid-column: 1 / -1; background: #f8fafc; padding: 10px; border-radius: 4px; font-weight: bold; margin-top: 10px; border-bottom: 2px solid #ddd;";
  const isLongText = parameterName.toLowerCase().includes("peripheral smear")
    || [
      "clinical data",
      "clinical details",
      "clinical history",
      "specimen",
      "diagnosis",
      "final diagnosis",
      "note",
      "comment",
      "comments",
      "gross description",
      "microscopic description",
      "findings",
      "result / findings",
      "impression",
      "advice",
      "organism isolated",
      "antibiotic sensitivity",
      "drug sensitivity",
    ].includes(parameterName.toLowerCase());

  return `
    <label class="result-parameter ${isHeader ? "header-param" : ""}" ${attributes} style="${isHeader ? headerStyle : ""}">
      <span>${escapeResultFieldHtml(parameterName)}${isHeader ? "" : `<br /><small>${escapeResultFieldHtml(parameter.normal_range || "-")} ${escapeResultFieldHtml(parameter.unit || "")}</small>`}</span>
      ${isHeader ? "<span></span>" : (isLongText
        ? `<textarea placeholder="Enter result" style="width: 100%; min-height: 60px;">${escapeResultFieldHtml(value)}</textarea>`
        : `<input placeholder="Enter value" value="${escapeResultFieldHtml(value)}" />`)}
    </label>
  `;
}

function attachParameterCalculations(container) {
  const rows = Array.from(container.querySelectorAll("[data-parameter-row]"));
  const inputs = new Map();
  const calculatedRows = rows.filter((row) => row.dataset.entryMode === "calculated");

  rows.forEach((row) => {
    const input = row.querySelector("input, textarea");
    if (!input) return;

    inputs.set(normalizeCalculationParameterName(row.dataset.parameterName), input);
    input.addEventListener("input", calculate);
  });

  calculatedRows.forEach((row) => {
    const input = row.querySelector("input, textarea");
    if (!input) return;

    input.readOnly = true;
    input.classList.add("auto-calculated-input");
    input.placeholder = "Calculated automatically";
    input.title = "Calculated automatically from the source values for this test";

    const labelText = row.querySelector("span");
    if (labelText && !labelText.querySelector(".auto-calculated-note")) {
      const note = document.createElement("small");
      note.className = "auto-calculated-note";
      note.textContent = "Auto-calculated";
      labelText.append(note);
    }
  });

  function calculateFormula(formula) {
    const conditionalMatch = String(formula || "").trim().match(
      /^IF\s*\(\s*\{([^{}]+)\}\s*(>=|<=|>|<|==|=|!=)\s*(-?\d+(?:\.\d+)?)\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\)$/i
    );
    if (conditionalMatch) {
      const [, parameterName, operator, target, whenTrue, whenFalse] = conditionalMatch;
      const sourceValue = Number.parseFloat(inputs.get(normalizeCalculationParameterName(parameterName))?.value);
      if (!Number.isFinite(sourceValue)) return null;

      const targetValue = Number(target);
      const matches = {
        ">": sourceValue > targetValue,
        ">=": sourceValue >= targetValue,
        "<": sourceValue < targetValue,
        "<=": sourceValue <= targetValue,
        "=": sourceValue === targetValue,
        "==": sourceValue === targetValue,
        "!=": sourceValue !== targetValue,
      }[operator];
      return matches ? whenTrue : whenFalse;
    }

    let hasMissingValue = false;
    const expression = String(formula || "").replace(/\{([^{}]+)\}/g, (_match, parameterName) => {
      const value = Number.parseFloat(inputs.get(normalizeCalculationParameterName(parameterName))?.value);
      if (!Number.isFinite(value)) {
        hasMissingValue = true;
        return "0";
      }
      return String(value);
    });

    if (hasMissingValue || !expression || !/^[\d\s.+\-*\/()%]+$/.test(expression)) {
      return null;
    }

    try {
      const value = Function(`"use strict"; return (${expression});`)();
      return Number.isFinite(value) ? value : null;
    } catch (_error) {
      return null;
    }
  }

  function calculate() {
    // A calculated parameter can depend on another calculated parameter, so
    // repeat the pass until all formulas have had a chance to resolve.
    for (let pass = 0; pass < calculatedRows.length; pass += 1) {
      calculatedRows.forEach((row) => {
        const input = row.querySelector("input, textarea");
        if (!input) return;

        const value = calculateFormula(row.dataset.calculationFormula);
        if (value === null) {
          input.value = "";
          return;
        }

        if (typeof value === "string") {
          input.value = value;
          return;
        }

        const requestedPrecision = Number(row.dataset.calculationPrecision);
        const precision = Number.isInteger(requestedPrecision)
          ? Math.min(6, Math.max(0, requestedPrecision))
          : 2;
        input.value = value.toFixed(precision);
      });
    }
  }

  calculate();
  attachResultEntryKeyboardNavigation(container);
}

function attachResultEntryKeyboardNavigation(container) {
  const form = container?.closest?.("form[data-result-form]");
  if (!form || form.dataset.resultKeyboardNavigationBound === "true") return;
  form.dataset.resultKeyboardNavigationBound = "true";

  form.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;

    const currentField = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
      ? event.target
      : null;
    if (!currentField || currentField.readOnly || currentField.disabled) return;

    // Shift+Enter remains available for line breaks in longer narrative fields.
    if (currentField instanceof HTMLTextAreaElement && event.shiftKey) return;

    const editableFields = Array.from(form.querySelectorAll("[data-parameter-row] input, [data-parameter-row] textarea"))
      .filter((field) => !field.disabled && !field.readOnly && field.offsetParent !== null);
    const currentIndex = editableFields.indexOf(currentField);
    if (currentIndex < 0) return;

    event.preventDefault();
    const nextField = editableFields[currentIndex + 1];
    if (nextField) {
      nextField.focus({ preventScroll: true });
      nextField.select?.();
      nextField.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }

    const saveButton = form.querySelector('button[type="submit"]:not([disabled])');
    if (saveButton) {
      form.requestSubmit(saveButton);
    }
  });
}

function attachCBCAutoCalc(container) {
  const inputs = {};
  container.querySelectorAll("[data-parameter-row]").forEach(row => {
    const name = row.dataset.parameterName;
    const input = row.querySelector("input, textarea");
    if (input) {
      inputs[name] = input;
      input.addEventListener("input", calculate);
    }
  });

  const getInput = (...names) => names.map(name => inputs[name]).find(Boolean);
  const markAutoCalculated = input => {
    if (!input || input.dataset.autoCalculated === "true") return;

    input.readOnly = true;
    input.dataset.autoCalculated = "true";
    input.classList.add("auto-calculated-input");
    input.placeholder = "Calculated automatically";
    input.title = "Calculated automatically from the CBC source values";
    input.setAttribute("aria-label", `${input.getAttribute("aria-label") || "Result"} (calculated automatically)`);

    const label = input.closest("[data-parameter-row]");
    const labelText = label?.querySelector("span");
    if (labelText && !labelText.querySelector(".auto-calculated-note")) {
      const note = document.createElement("small");
      note.className = "auto-calculated-note";
      note.textContent = "Auto-calculated";
      labelText.append(note);
    }
  };

  // MCV and RDW are entered from the analyzer. The fields below are derived.
  const pcvInput = getInput("PCV (Packed Cell Volume)", "Hematocrit Value, Hct");
  const mchInput = getInput("MCH (Mean Corpuscular Haemoglobin)", "Mean Cell Haemoglobin, MCH");
  const mchcInput = getInput("MCHC (Mean Corpuscular Hb. Concentration)", "Mean Cell Haemoglobin CON, MCHC");
  const absoluteInputs = [
    getInput("Absolute Neutrophil Count", "Absolute Neutrophils"),
    getInput("Absolute Lymphocyte Count", "Absolute Lymphocytes"),
    getInput("Absolute Monocyte Count", "Absolute Monocytes"),
    getInput("Absolute Eosinophil Count", "Absolute Eosinophils"),
    getInput("Absolute Basophil Count", "Absolute Basophils")
  ];

  [pcvInput, mchInput, mchcInput, ...absoluteInputs].forEach(markAutoCalculated);

  function calculate() {
    const hb = parseFloat(inputs["Hb(Haemoglobin)"]?.value || inputs["Hemoglobin"]?.value);
    const rbc = parseFloat(inputs["Erythrocytes"]?.value || inputs["Total RBC Count"]?.value);
    const wbc = parseFloat(inputs["Leukocytes"]?.value || inputs["Total Leukocyte Count"]?.value);
    const mcv = parseFloat(inputs["MCV (Mean Corpuscular Volume)"]?.value || inputs["Mean Corpuscular Volume, MCV"]?.value);
    
    // PCV (%) = (RBC × MCV) / 10
    if (pcvInput && !isNaN(rbc) && !isNaN(mcv)) {
      pcvInput.value = ((rbc * mcv) / 10).toFixed(1);
    }

    // MCV (fL) = (PCV × 10) / RBC
    const currentPCV = parseFloat(pcvInput?.value);

    // MCH (pg) = (Hb × 10) / RBC
    if (mchInput && !isNaN(hb) && !isNaN(rbc) && rbc !== 0) {
      mchInput.value = ((hb * 10) / rbc).toFixed(1);
    }

    // MCHC (g/dL) = (Hb × 100) / PCV
    if (mchcInput && !isNaN(hb) && !isNaN(currentPCV) && currentPCV !== 0) {
      mchcInput.value = ((hb * 100) / currentPCV).toFixed(1);
    }

    // Absolute counts (support both new and old names)
    const wbcVal = parseFloat(inputs["Leukocytes"]?.value || inputs["Total Leukocyte Count"]?.value);
    const wbcToUse = !isNaN(wbcVal) ? wbcVal : wbc;

    const neutInput = inputs["Neutrophils"] || inputs["Neutrophil"];
    const lymphInput = inputs["Lymphocytes"] || inputs["Lymphocyte"];
    const monoInput = inputs["Monocytes"] || inputs["Monocyte"];
    const eoInput = inputs["Eosinophils"] || inputs["Eosinophil"];
    const basoInput = inputs["Basophils"] || inputs["Basophil"];

    [
      { pct: neutInput, abs: ["Absolute Neutrophil Count", "Absolute Neutrophils"] },
      { pct: lymphInput, abs: ["Absolute Lymphocyte Count", "Absolute Lymphocytes"] },
      { pct: monoInput, abs: ["Absolute Monocyte Count", "Absolute Monocytes"] },
      { pct: eoInput, abs: ["Absolute Eosinophil Count", "Absolute Eosinophils"] },
      { pct: basoInput, abs: ["Absolute Basophil Count", "Absolute Basophils"] }
    ].forEach(pair => {
      const pctVal = parseFloat(pair.pct?.value);
      const absoluteInput = pair.abs.map(name => inputs[name]).find(Boolean);
      if (absoluteInput && !isNaN(wbcToUse) && !isNaN(pctVal)) {
        absoluteInput.value = Math.round((wbcToUse * pctVal) / 100);
      }
    });
  }

  calculate();
}

function attachLFTAutoCalc(container) {
  const inputs = {};
  container.querySelectorAll("[data-parameter-row]").forEach(row => {
    const name = row.dataset.parameterName;
    const input = row.querySelector("input, textarea");
    if (input) {
      inputs[name] = input;
      input.addEventListener("input", calculate);
    }
  });

  function calculate() {
    const totalBil = parseFloat(inputs["Bilirubin Total"]?.value);
    const directBil = parseFloat(inputs["Bilirubin Direct"]?.value);
    const totalProt = parseFloat(inputs["Total Protein"]?.value);
    const albumin = parseFloat(inputs["Albumin"]?.value);

    // Bilirubin Indirect = Total - Direct
    if (inputs["Bilirubin Indirect"] && !isNaN(totalBil) && !isNaN(directBil)) {
      if (document.activeElement !== inputs["Bilirubin Indirect"] && (inputs["Bilirubin Indirect"].value === "" || !isNaN(parseFloat(inputs["Bilirubin Indirect"].value)))) {
        inputs["Bilirubin Indirect"].value = Math.max(0, totalBil - directBil).toFixed(2);
      }
    }

    // Globulin = Total Protein - Albumin
    if (inputs["Globulin"] && !isNaN(totalProt) && !isNaN(albumin)) {
      if (document.activeElement !== inputs["Globulin"] && (inputs["Globulin"].value === "" || !isNaN(parseFloat(inputs["Globulin"].value)))) {
        inputs["Globulin"].value = Math.max(0, totalProt - albumin).toFixed(2);
      }
    }

    // A/G Ratio = Albumin / Globulin
    const currentGlobulin = parseFloat(inputs["Globulin"]?.value);
    if (inputs["A G Ratio"] && !isNaN(albumin) && !isNaN(currentGlobulin) && currentGlobulin !== 0) {
      if (document.activeElement !== inputs["A G Ratio"] && (inputs["A G Ratio"].value === "" || !isNaN(parseFloat(inputs["A G Ratio"].value)))) {
        inputs["A G Ratio"].value = (albumin / currentGlobulin).toFixed(2);
      }
    }
  }
}

function attachPTAutoCalc(container) {
  const inputs = {};
  container.querySelectorAll("[data-parameter-row]").forEach(row => {
    const name = row.dataset.parameterName;
    const input = row.querySelector("input, textarea");
    if (input) {
      inputs[name] = input;
      input.addEventListener("input", calculate);
    }
  });

  function calculate() {
    const meanPT = parseFloat(inputs["Mean Normal Prothrombin Time (PT)"]?.value);
    const patientPT = parseFloat(inputs["Patient value"]?.value);
    const isi = 1.0; // Reagent-specific constant

    if (!isNaN(meanPT) && !isNaN(patientPT) && meanPT !== 0) {
      const ratio = patientPT / meanPT;
      if (inputs["Prothrombin Ratio (PR)"] && document.activeElement !== inputs["Prothrombin Ratio (PR)"]) {
        inputs["Prothrombin Ratio (PR)"].value = ratio.toFixed(2);
      }
      if (inputs["International Normalized Ratio (INR)"] && document.activeElement !== inputs["International Normalized Ratio (INR)"]) {
        inputs["International Normalized Ratio (INR)"].value = Math.pow(ratio, isi).toFixed(2);
      }
    }
  }
}
