const { all } = require("../src/db/helpers");

async function checkUsers() {
  try {
    const users = await all("SELECT username, role, permissions FROM users");
    console.log(JSON.stringify(users, null, 2));
  } catch (error) {
    console.error(error);
  }
}

checkUsers();
