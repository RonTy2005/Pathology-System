
const { authenticate } = require("../src/services/authService");

async function checkDefaultSuperadminCredentials() {
  const user = await authenticate("RonTy", "BokaChoda69!");
  console.log("Default super-admin credentials accepted:", user?.role === "superadmin");
}

checkDefaultSuperadminCredentials().catch(console.error);
