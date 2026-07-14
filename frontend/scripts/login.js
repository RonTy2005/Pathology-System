const loginForm = document.getElementById("loginForm");

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
    window.location.href = getRoleHome(data.user.role, data.user);
  } catch (error) {
    showMessage("loginMessage", error.message, true);
  }
});
