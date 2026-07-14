const fs = require('fs');
const path = 'e:/Web Development/lab-system/frontend/scripts/reception.js';
let content = fs.readFileSync(path, 'utf8');

const target = `    const matched = testCatalog.tests.find((item) => item.test_id === test.test_id || item.name === test.name);\n\n    if (test.name.includes("Complete Blood Count") || test.name === "CBC") {`;

const replacement = `    const matched = testCatalog.tests.find((item) => item.test_id === test.test_id || item.name === test.name);\n    const holder = document.getElementById(\`results-parameters-\${test.id}\`);\n    holder.innerHTML = (matched?.parameters || []).map(\n      (parameter) => {\n        const isHeader = [\n          "CBC (Complete Blood Count)",\n          "TLC (Total Leukocytes Count)",\n          "DLC (Differential Leukocytes Count)",\n          "ESR (Erythrocyte Sedimentation Rate)"\n        ].includes(parameter.parameter_name);\n        \n        return \`\n          <label class="result-parameter \${isHeader ? 'header-param' : ''}" data-parameter-row data-parameter-name="\${parameter.parameter_name}" data-unit="\${parameter.unit || ""}" data-range="\${parameter.normal_range || ""}" style="\${isHeader ? 'grid-column: 1 / -1; background: #f8fafc; padding: 10px; border-radius: 4px; font-weight: bold; margin-top: 10px; border-bottom: 2px solid #ddd;' : ''}">\n            <span>\${parameter.parameter_name}\${isHeader ? '' : \`<br /><small>\${parameter.normal_range || "-"} \${parameter.unit || ""}</small>\`}</span>\n            \${isHeader ? '<span></span>' : '<input placeholder="Enter value" />'}\n          </label>\n        \`;\n      }\n    ).join("");\n\n    if (test.name.includes("Complete Blood Count") || test.name === "CBC") {`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(path, content);
    console.log("Successfully fixed reception.js");
} else {
    console.log("Target not found in reception.js");
    // Fallback search
    console.log("Searching for partial match...");
    const partialTarget = `const matched = testCatalog.tests.find((item) => item.test_id === test.test_id || item.name === test.name);`;
    if (content.includes(partialTarget)) {
         console.log("Found partial target");
    }
}
