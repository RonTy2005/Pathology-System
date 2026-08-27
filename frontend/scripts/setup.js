const setupForm = document.getElementById("setupForm");
const setupMessage = document.getElementById("setupMessage");
const subscriptionExpiresOn = document.getElementById("subscriptionExpiresOn");

function setSetupMessage(message, isError = false) {
  setupMessage.textContent = message;
  setupMessage.classList.toggle("error", isError);
}

function setFieldValue(id, value) {
  const field = document.getElementById(id);
  if (field) field.value = value || "";
}

function setFacilityTypes(types = []) {
  const selected = new Set(types);
  document.querySelectorAll('input[name="facilityTypes"]').forEach((input) => {
    input.checked = selected.has(input.value);
  });
}

function getFacilityTypes() {
  return Array.from(document.querySelectorAll('input[name="facilityTypes"]:checked')).map((input) => input.value);
}

function addSubscriptionDays(days) {
  const baseValue = subscriptionExpiresOn.value || new Date().toISOString().slice(0, 10);
  const base = new Date(`${baseValue}T12:00:00`);
  base.setDate(base.getDate() + Number(days));
  subscriptionExpiresOn.value = base.toISOString().slice(0, 10);
}

async function initializeSetup() {
  const user = getUser();
  if (!user) return void (window.location.href = "login.html");
  if (user.role !== "superadmin") return void (window.location.href = getRoleHome(user.role, user));

  try {
    const [settings, subscription] = await Promise.all([
      API.request("/api/settings/business"),
      API.request("/api/settings/subscription"),
    ]);
    if (settings.setupCompleted) {
      localStorage.removeItem("labSetupRequired");
      window.location.href = subscription.active ? getRoleHome(user.role, user) : "subscription.html";
      return;
    }

    setFieldValue("businessName", settings.businessName);
    setFacilityTypes(settings.facilityTypes || []);
    setFieldValue("address", settings.address);
    setFieldValue("phone", settings.phone);
    setFieldValue("email", settings.email);
    setFieldValue("registrationNo", settings.registrationNo);
    subscriptionExpiresOn.min = subscription.today;
    subscriptionExpiresOn.value = subscription.expiresOn || "";
  } catch (error) {
    setSetupMessage(error.message || "Unable to load the secure setup details.", true);
  }
}

document.querySelectorAll("[data-subscription-days]").forEach((button) => {
  button.addEventListener("click", () => addSubscriptionDays(button.dataset.subscriptionDays));
});

setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = setupForm.querySelector("button[type='submit']");
  const facilityTypes = getFacilityTypes();
  const expiresOn = subscriptionExpiresOn.value;
  if (!setupForm.reportValidity()) return;
  if (facilityTypes.length === 0) return setSetupMessage("Select at least one facility type.", true);
  if (!expiresOn) return setSetupMessage("Choose the subscription expiry date.", true);

  submitButton.disabled = true;
  setSetupMessage("Saving your facility and subscription settings...");
  try {
    const settings = await API.request("/api/settings/business", {
      method: "PATCH",
      body: JSON.stringify({
        businessName: document.getElementById("businessName").value.trim(), facilityTypes,
        address: document.getElementById("address").value.trim(), phone: document.getElementById("phone").value.trim(),
        email: document.getElementById("email").value.trim(), registrationNo: document.getElementById("registrationNo").value.trim(),
        completeSetup: true,
      }),
    });
    const subscription = await API.request("/api/settings/subscription", {
      method: "PATCH", body: JSON.stringify({ expiresOn }),
    });
    setBusinessName(settings.businessName);
    localStorage.removeItem("labSetupRequired");
    if (subscription.active) localStorage.removeItem("labSubscriptionExpired");
    window.location.href = getRoleHome(getUser().role, getUser());
  } catch (error) {
    setSetupMessage(error.message || "Unable to save the setup details.", true);
    submitButton.disabled = false;
  }
});

initializeSetup();
