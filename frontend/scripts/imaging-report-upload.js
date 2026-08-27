const IMAGING_REPORT_MAX_BYTES = 6 * 1024 * 1024;
const IMAGING_REPORT_ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

function escapeImagingReportText(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[character]));
}

function imagingReportControls(study) {
  const studyId = Number(study.visit_test_id);
  const reportUploaded = Boolean(study.report_file_id);
  const canUpload = Boolean(study.scan_done);
  const fileInputId = `imaging-report-file-${studyId}`;
  const reportDescription = reportUploaded
    ? `<span class="imaging-report-name" title="${escapeImagingReportText(study.report_file_name)}">Report: ${escapeImagingReportText(study.report_file_name)}</span>`
    : '<span class="imaging-report-help">No report uploaded</span>';

  return `
    <div class="imaging-report-controls">
      ${reportDescription}
      ${reportUploaded ? `<button type="button" class="secondary-btn" data-open-imaging-report="${studyId}">View report</button>` : ""}
      <button
        type="button"
        class="${reportUploaded ? "ghost-btn" : "primary-btn"}"
        data-upload-imaging-report="${studyId}"
        ${canUpload ? "" : "disabled title=\"Mark the study done first\""}
      >${reportUploaded ? "Replace report" : "Upload report"}</button>
      <input id="${fileInputId}" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" hidden />
    </div>
  `;
}

function readImagingReportFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the selected file"));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

async function uploadImagingReport(studyId, file) {
  if (!file) return;

  if (!IMAGING_REPORT_ACCEPTED_TYPES.includes(file.type)) {
    throw new Error("Choose a PDF, JPG, PNG, or WebP report file");
  }

  if (file.size <= 0 || file.size > IMAGING_REPORT_MAX_BYTES) {
    throw new Error("Report files must be no larger than 6 MB");
  }

  const dataUrl = await readImagingReportFile(file);
  return API.request(`/api/visits/tests/${studyId}/imaging-report`, {
    method: "PUT",
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type,
      dataUrl,
    }),
  });
}

async function openImagingReport(studyId) {
  const popup = window.open("", "_blank", "width=900,height=700");
  if (!popup) {
    alert("Please allow popups for this site.");
    return;
  }

  popup.document.write("<html><body><p>Loading uploaded report...</p></body></html>");

  try {
    const token = localStorage.getItem("labToken");
    const response = await fetch(`/api/visits/tests/${studyId}/imaging-report`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || "Unable to open the uploaded report");
    }

    const fileUrl = URL.createObjectURL(await response.blob());
    popup.location.href = fileUrl;
    setTimeout(() => URL.revokeObjectURL(fileUrl), 60_000);
  } catch (error) {
    popup.close();
    alert(error.message || "Unable to open the uploaded report");
  }
}

function bindImagingReportControls(container, refresh) {
  container.querySelectorAll("button[data-upload-imaging-report]").forEach((button) => {
    button.addEventListener("click", () => {
      const fileInput = document.getElementById(`imaging-report-file-${button.dataset.uploadImagingReport}`);
      if (fileInput) fileInput.click();
    });
  });

  container.querySelectorAll("input[id^='imaging-report-file-']").forEach((fileInput) => {
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;

      const studyId = fileInput.id.replace("imaging-report-file-", "");
      const button = container.querySelector(`button[data-upload-imaging-report="${studyId}"]`);
      if (button) {
        button.disabled = true;
        button.textContent = "Uploading...";
      }

      try {
        await uploadImagingReport(studyId, file);
        await refresh();
      } catch (error) {
        alert(error.message || "Could not upload the report");
        if (button) {
          button.disabled = false;
          button.textContent = "Upload report";
        }
      } finally {
        fileInput.value = "";
      }
    });
  });

  container.querySelectorAll("button[data-open-imaging-report]").forEach((button) => {
    button.addEventListener("click", () => openImagingReport(button.dataset.openImagingReport));
  });
}
