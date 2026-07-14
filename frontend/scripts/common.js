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
      const errorBody = contentType.includes("application/json")
        ? await response.json()
        : { message: await response.text() };
      throw new Error(errorBody.message || "Request failed");
    }

    if (contentType.includes("application/json")) {
      return response.json();
    }

    return response.text();
  },
};

function saveSession(data) {
  localStorage.setItem("labToken", data.token);
  localStorage.setItem("labUser", JSON.stringify(data.user));
}

function getUser() {
  const raw = localStorage.getItem("labUser");
  return raw ? JSON.parse(raw) : null;
}

function clearSession() {
  localStorage.removeItem("labToken");
  localStorage.removeItem("labUser");
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

function protectPage(allowedRoles) {
  const user = getUser();
  if (!user) {
    window.location.href = "login.html";
    return null;
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    window.location.href = "login.html";
    return null;
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
    case "admin": return "admin.html";
    case "receptionist": return "reception.html";
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
  const name = (testName || "").toLowerCase();
  const cat = (testCategory || "").toLowerCase();
  const exclusions = [
    "ct scan", "mri", "x-ray", "xray", "radiology", "imaging",
    "cardiology", "neurology", "uroflowmetry", "tmt", "eeg", "ecg",
    "endoscopy", "coloscopy", "colonoscopy", "usg", "ultrasound",
    "biopsy", "histopathology", "cytology"
  ];
  return !exclusions.some(ex => name.includes(ex) || cat.includes(ex));
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

function openHtmlReport(visitId, shouldPrint = false) {
  const token = localStorage.getItem("labToken");
  const popup = window.open("", "_blank", "width=900,height=700");
  if (!popup) return alert("Please allow popups for this site.");

  popup.document.write("<html><body><p>Loading report...</p></body></html>");
  fetch(`/api/visits/${visitId}/report?format=html`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(r => r.ok ? r.text() : Promise.reject("Failed"))
    .then(html => {
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      if (shouldPrint) setTimeout(() => popup.print(), 250);
    })
    .catch(() => { popup.close(); alert("Unable to open report"); });
}

function openHtmlBill(visitId, shouldPrint = false, existingPopup = null) {
  const token = localStorage.getItem("labToken");
  const popup = existingPopup || window.open("", "_blank", "width=900,height=700");
  if (!popup) return alert("Please allow popups for this site.");

  if (!existingPopup) {
    popup.document.write("<html><body><p>Loading bill...</p></body></html>");
  }

  fetch(`/api/visits/${visitId}/bill?format=html`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(r => r.ok ? r.text() : Promise.reject("Failed"))
    .then(html => {
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      if (shouldPrint) setTimeout(() => popup.print(), 250);
    })
    .catch(() => {
      if (!existingPopup) popup.close();
      alert("Unable to open bill");
    });
}

async function shareAndDownloadReport(visitId) {
  try {
    const user = getUser();
    if (!user) throw new Error("Please log in first");

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

    const reportHtml = await API.request(`/api/visits/${visitId}/report?format=html`);

    const opt = {
      margin: 0,
      filename: `Report_${billNo}_${patientName.replace(/\s+/g, '_')}.pdf`,
      image: { type: 'jpeg', quality: 1.0 },
      html2canvas: { scale: 2, useCORS: true, logging: false, allowTaint: false, scrollY: 0, scrollX: 0 },
      jsPDF: { unit: 'mm', format: 'a3', orientation: 'portrait' }
    };

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:297mm;height:420mm;border:none;visibility:hidden;';
    document.body.appendChild(iframe);

    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      iframeDoc.open();
      iframeDoc.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 297mm; background: white; }
  .pdf-page {
    position: relative; width: 297mm; min-height: 420mm;
    background-color: white;
  }
  .pdf-content { position: relative; z-index: 1; padding: 3.5cm 1.2cm 1.5cm 1.2cm; }
  table { width: 100% !important; table-layout: fixed; word-break: break-word; }
  
  /* WhatsApp PDF Clean Styling */
  .category-header { 
    background-color: transparent !important; 
    color: #000 !important; 
    border-bottom: 2px solid #000 !important; 
    border-radius: 0 !important;
    padding: 8px 0 !important;
    margin: 20px 0 10px 0 !important;
    text-align: left !important;
  }
  .patient-info-bar { 
    background-color: transparent !important; 
    border: 1px solid #333 !important; 
    border-radius: 0 !important;
    color: #000 !important;
  }
  .info-label { color: #333 !important; }
  .info-value { color: #000 !important; }
  .test-name { 
    color: #000 !important; 
    background-color: #f2f2f2 !important; 
    border-bottom: 1px solid #333 !important;
  }
  thead th {
    border-top: 2px solid #000 !important;
    border-bottom: 1px solid #333 !important;
    background-color: #f9f9f9 !important;
    color: #000 !important;
  }
  .param-name { color: #000 !important; }
  .result-cell { color: #000 !important; }
  .range-col { color: #333 !important; }
</style></head><body><div class="pdf-page"><div class="pdf-content">${reportHtml}</div></div></body></html>`);
      iframeDoc.close();

      await new Promise(resolve => setTimeout(resolve, 1500)); // wait for external images to load
      const pageEl = iframeDoc.querySelector('.pdf-page');
      await html2pdf().from(pageEl).set(opt).save();
    } finally {
      document.body.removeChild(iframe);
    }

    if (patientPhone) {
      const mobile = patientPhone.replace(/\D/g, '').slice(-10);
      const message = `Dear ${patientName}, your lab report for Bill ${billNo} is ready. It has been downloaded to your device as a PDF.`;
      window.open(`https://wa.me/91${mobile}?text=${encodeURIComponent(message)}`, '_blank');
    }
  } catch (error) {
    console.error("Report sharing error:", error);
    alert(error.message || "Unable to generate or share report");
  }
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

  function calculate() {
    const hb = parseFloat(inputs["Hb(Haemoglobin)"]?.value || inputs["Hemoglobin"]?.value);
    const rbc = parseFloat(inputs["Erythrocytes"]?.value || inputs["Total RBC Count"]?.value);
    const wbc = parseFloat(inputs["Leukocytes"]?.value || inputs["Total Leukocyte Count"]?.value);
    const pcv = parseFloat(inputs["PCV (Packed Cell Volume)"]?.value || inputs["Hematocrit Value, Hct"]?.value);
    const mcv = parseFloat(inputs["MCV (Mean Corpuscular Volume)"]?.value || inputs["Mean Corpuscular Volume, MCV"]?.value);
    
    // PCV (%) = (RBC × MCV) / 10
    if (inputs["PCV (Packed Cell Volume)"] && !isNaN(rbc) && !isNaN(mcv)) {
      if (document.activeElement !== inputs["PCV (Packed Cell Volume)"] && (isNaN(pcv) || inputs["PCV (Packed Cell Volume)"].value === "")) {
        inputs["PCV (Packed Cell Volume)"].value = ((rbc * mcv) / 10).toFixed(1);
      }
    } else if (inputs["Hematocrit Value, Hct"] && !isNaN(rbc) && !isNaN(mcv)) {
      if (document.activeElement !== inputs["Hematocrit Value, Hct"] && (isNaN(pcv) || inputs["Hematocrit Value, Hct"].value === "")) {
        inputs["Hematocrit Value, Hct"].value = ((rbc * mcv) / 10).toFixed(1);
      }
    }

    // MCV (fL) = (PCV × 10) / RBC
    const currentPCV = parseFloat(inputs["PCV (Packed Cell Volume)"]?.value || inputs["Hematocrit Value, Hct"]?.value);
    if (inputs["MCV (Mean Corpuscular Volume)"] && !isNaN(currentPCV) && !isNaN(rbc) && rbc !== 0) {
      if (document.activeElement !== inputs["MCV (Mean Corpuscular Volume)"] && (isNaN(mcv) || inputs["MCV (Mean Corpuscular Volume)"].value === "")) {
        inputs["MCV (Mean Corpuscular Volume)"].value = ((currentPCV * 10) / rbc).toFixed(1);
      }
    }

    // MCH (pg) = (Hb × 10) / RBC
    if (inputs["MCH (Mean Corpuscular Haemoglobin)"] && !isNaN(hb) && !isNaN(rbc) && rbc !== 0) {
      if (document.activeElement !== inputs["MCH (Mean Corpuscular Haemoglobin)"]) {
        inputs["MCH (Mean Corpuscular Haemoglobin)"].value = ((hb * 10) / rbc).toFixed(1);
      }
    } else if (inputs["Mean Cell Haemoglobin, MCH"] && !isNaN(hb) && !isNaN(rbc) && rbc !== 0) {
       if (document.activeElement !== inputs["Mean Cell Haemoglobin, MCH"]) {
        inputs["Mean Cell Haemoglobin, MCH"].value = ((hb * 10) / rbc).toFixed(1);
      }
    }

    // MCHC (g/dL) = (Hb × 100) / PCV
    if (inputs["MCHC (Mean Corpuscular Hb. Concentration)"] && !isNaN(hb) && !isNaN(currentPCV) && currentPCV !== 0) {
      if (document.activeElement !== inputs["MCHC (Mean Corpuscular Hb. Concentration)"]) {
        inputs["MCHC (Mean Corpuscular Hb. Concentration)"].value = ((hb * 100) / currentPCV).toFixed(1);
      }
    } else if (inputs["Mean Cell Haemoglobin CON, MCHC"] && !isNaN(hb) && !isNaN(currentPCV) && currentPCV !== 0) {
       if (document.activeElement !== inputs["Mean Cell Haemoglobin CON, MCHC"]) {
        inputs["Mean Cell Haemoglobin CON, MCHC"].value = ((hb * 100) / currentPCV).toFixed(1);
      }
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
      { pct: neutInput, abs: "Absolute Neutrophil Count" },
      { pct: lymphInput, abs: "Absolute Lymphocyte Count" },
      { pct: monoInput, abs: "Absolute Monocyte Count" },
      { pct: eoInput, abs: "Absolute Eosinophil Count" },
      { pct: basoInput, abs: "Absolute Basophil Count" }
    ].forEach(pair => {
      const pctVal = parseFloat(pair.pct?.value);
      if (inputs[pair.abs] && !isNaN(wbcToUse) && !isNaN(pctVal)) {
        inputs[pair.abs].value = Math.round((wbcToUse * pctVal) / 100);
      }
    });
  }
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
