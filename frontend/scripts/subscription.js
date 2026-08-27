const subscriptionForm = document.getElementById("subscriptionForm");
const expiresOnInput = document.getElementById("expiresOn");
const subscriptionState = document.getElementById("subscriptionState");
const subscriptionMessage = document.getElementById("subscriptionMessage");
let subscriptionStatus = null;

function setSubscriptionMessage(message, isError = false) {
  subscriptionMessage.textContent = message;
  subscriptionMessage.classList.toggle("error", isError);
}

function formatSubscriptionDate(value) {
  if (!value) return "not set";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

function renderSubscriptionStatus(status) {
  subscriptionStatus = status;
  expiresOnInput.min = status.today;
  if (status.expiresOn) expiresOnInput.value = status.expiresOn;
  const active = Boolean(status.active);
  subscriptionState.style.background = active ? "#ecfdf5" : "#fffbeb";
  subscriptionState.style.borderColor = active ? "#a7f3d0" : "#fde68a";
  subscriptionState.innerHTML = active
    ? `<strong style="color:#047857">Subscription active</strong><span style="color:#166534">Valid through ${formatSubscriptionDate(status.expiresOn)}${status.daysRemaining === 0 ? " (expires today)" : ` — ${status.daysRemaining} day(s) remaining`}</span>`
    : `<strong>Subscription expired</strong><span>${status.expiresOn ? `It expired on ${formatSubscriptionDate(status.expiresOn)}.` : "No expiry date has been set yet."} Save a new date to restore access.</span>`;
}

function addRenewalDays(days) {
  const base = expiresOnInput.value || subscriptionStatus?.expiresOn || subscriptionStatus?.today || new Date().toISOString().slice(0, 10);
  const date = new Date(`${base}T12:00:00`);
  date.setDate(date.getDate() + Number(days));
  expiresOnInput.value = date.toISOString().slice(0, 10);
}

async function loadSubscription() {
  try {
    renderSubscriptionStatus(await API.request("/api/settings/subscription"));
  } catch (error) {
    setSubscriptionMessage(error.message || "Unable to load subscription details.", true);
  }
}

const user = getUser();
if (!user || user.role !== "superadmin") {
  window.location.href = "login.html";
} else {
  loadSubscription();
}

document.getElementById("logoutBtn")?.addEventListener("click", async () => {
  try {
    await API.request("/api/auth/logout", { method: "POST" });
  } catch (_error) {
    // The local session is cleared even if the server session has already ended.
  } finally {
    clearSession();
    window.location.href = "login.html";
  }
});

document.querySelectorAll("[data-renew-days]").forEach((button) => button.addEventListener("click", () => addRenewalDays(button.dataset.renewDays)));
subscriptionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!subscriptionForm.reportValidity()) return;
  const submitButton = subscriptionForm.querySelector("button[type='submit']");
  submitButton.disabled = true;
  setSubscriptionMessage("Saving subscription date...");
  try {
    const subscription = await API.request("/api/settings/subscription", { method: "PATCH", body: JSON.stringify({ expiresOn: expiresOnInput.value }) });
    renderSubscriptionStatus(subscription);
    localStorage.removeItem("labSubscriptionExpired");
    setSubscriptionMessage("Subscription renewed. You can now return to the app.");
    setTimeout(() => { window.location.href = getRoleHome(user.role, user); }, 650);
  } catch (error) {
    setSubscriptionMessage(error.message || "Unable to save the subscription date.", true);
    submitButton.disabled = false;
  }
});
