const loginForm = document.getElementById("loginForm");
const loginNote = document.getElementById("loginNote");

async function showFirstRunMessage() {
  try {
    const response = await fetch("/api/settings/branding");
    if (!response.ok) return;
    await response.json();
    if (loginNote) loginNote.textContent = "Sign in with your assigned account. The Super Admin manages facility setup and subscription renewal.";
  } catch (_error) {
    // Keep the standard sign-in message when facility branding is unavailable.
  }
}

showFirstRunMessage();

if (new URLSearchParams(window.location.search).get("session") === "expired") {
  showMessage("loginMessage", "Your session expired after the server restarted. Please sign in again.", true);
}

if (new URLSearchParams(window.location.search).get("subscription") === "expired") {
  showMessage("loginMessage", "The subscription has expired. Please contact the Super Admin.", true);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const payload = {
      username: document.getElementById("username").value.trim(),
      password: document.getElementById("password").value,
    };

    const data = await API.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    saveSession(data);
    window.location.href = data.setupRequired
      ? "setup.html"
      : data.subscriptionExpired && data.user.role === "superadmin"
        ? "subscription.html"
        : getRoleHome(data.user.role, data.user);
  } catch (error) {
    showMessage("loginMessage", error.message, true);
  }
});
