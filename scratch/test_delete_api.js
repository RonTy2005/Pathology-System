const fetch = require("node-fetch");

async function testDelete() {
  const loginRes = await fetch("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" })
  });
  const { token } = await loginRes.json();

  const res = await fetch("http://localhost:3000/api/users/12", {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${token}` }
  });
  const data = await res.json();
  console.log("Status:", res.status);
  console.log("Response:", data);
}

testDelete();
