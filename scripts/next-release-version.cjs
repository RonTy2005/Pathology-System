const { execFileSync } = require("child_process");
const path = require("path");

const packageJson = require(path.join(__dirname, "..", "package.json"));

function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(String(value).trim());
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareVersions(left, right) {
  for (const part of ["major", "minor", "patch"]) {
    if (left[part] !== right[part]) return left[part] - right[part];
  }
  return 0;
}

const packageVersion = parseVersion(packageJson.version);
if (!packageVersion) {
  throw new Error(`package.json has an invalid release version: ${packageJson.version}`);
}

const tags = execFileSync("git", ["tag", "--list", "v*"], { encoding: "utf8" })
  .split(/\r?\n/)
  .map(parseVersion)
  .filter(Boolean);

const current = tags.reduce(
  (highest, tag) => (compareVersions(tag, highest) > 0 ? tag : highest),
  packageVersion
);

console.log(`${current.major}.${current.minor}.${current.patch + 1}`);
