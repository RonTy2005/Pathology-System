document.addEventListener("DOMContentLoaded", async () => {
  const user = getUser();
  if (!user || (user.role !== "mri_technician" && user.role !== "admin")) {
    window.location.href = "login.html";
    return;
  }

  // Set user info in header pill
  const currentUser = document.getElementById("currentUser");
  if (currentUser) currentUser.textContent = user.fullName || user.username;
  showPermissionNavigation();

  const mriList = document.getElementById("mriList");
  const refreshBtn = document.getElementById("refreshBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  logoutBtn.addEventListener("click", () => {
    clearSession();
    window.location.href = "login.html";
  });

  async function loadScans() {
    mriList.innerHTML = '<div class="loader-container"><div class="loader"></div></div>';
    try {
      const data = await API.request("/api/visits/mri-scans");
      renderScans(data.visits);
    } catch (err) {
      mriList.innerHTML = `<p class="message error">Failed to load scans: ${err.message}</p>`;
    }
  }

  function updateStats(scans) {
    const total = scans.length;
    const done = scans.filter(s => s.scan_done).length;
    document.getElementById("statTotal").textContent = total;
    document.getElementById("statDone").textContent = done;
    document.getElementById("statPending").textContent = total - done;
  }

  function renderScans(scans) {
    updateStats(scans);

    if (!scans.length) {
      mriList.innerHTML = '<div class="empty-state" style="text-align:center;color:var(--muted);padding:2rem;">No MRI scan patients found for the last 48 hours.</div>';
      return;
    }

    mriList.innerHTML = scans.map((s, i) => `
      <div class="result-card ${s.scan_done ? 'scan-done' : 'scan-pending'}">
        <div class="scan-row">
          <div class="serial-num">${i + 1}</div>
          <div class="scan-row-info">
            <div class="bill-no">${s.bill_no}</div>
            <h3>${s.patient_name}</h3>
            <div class="meta">${s.age} yrs &bull; ${s.gender} &bull; Registered: ${new Date(s.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
            <div class="test-name">${s.test_name}</div>
          </div>
          <div class="scan-row-actions">
            <span class="status-pill ${s.scan_done ? 'done' : 'pending'}">${s.scan_done ? "Done" : "Pending"}</span>
            <button
              class="${s.scan_done ? 'ghost-btn' : 'primary-btn'}"
              data-id="${s.visit_test_id}"
              data-status="${s.scan_done ? '1' : '0'}"
            >${s.scan_done ? "Mark Pending" : "Mark Done"}</button>
          </div>
        </div>
      </div>
    `).join("");

    mriList.querySelectorAll("button[data-id]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const currentStatus = btn.dataset.status === "1";
        const newStatus = !currentStatus;

        btn.disabled = true;
        btn.textContent = "Saving...";

        try {
          await API.request(`/api/visits/tests/${id}/scan-status`, {
            method: "PATCH",
            body: JSON.stringify({ scanDone: newStatus })
          });
          await loadScans();
        } catch (err) {
          alert("Failed to update: " + err.message);
          btn.disabled = false;
          btn.textContent = currentStatus ? "Mark Pending" : "Mark Done";
        }
      });
    });
  }

  refreshBtn.addEventListener("click", loadScans);

  // Initial load
  loadScans();

  // Auto-refresh every 30 seconds
  setInterval(loadScans, 30000);
});
