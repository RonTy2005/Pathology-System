const path = require("path");

// In a normal Node installation these resolve to the project folder. The
// desktop server sets the two environment variables before importing the app,
// so program files and the live database are never mixed together.
const appRoot = path.resolve(process.env.LAB_LMS_APP_ROOT || process.cwd());
const dataDirectory = path.resolve(process.env.LAB_LMS_DATA_DIR || appRoot);

module.exports = {
  appRoot,
  dataDirectory,
};
