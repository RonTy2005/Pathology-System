const fs = require('fs');
const path = 'e:/Web Development/lab-system/frontend/scripts/reception.js';
let content = fs.readFileSync(path, 'utf8');

const target = `      const parameters = Array.from(form.querySelectorAll("[data-parameter-row]")).map((row) => ({
        parameter_name: row.dataset.parameterName,
        value: row.querySelector("input").value,
        unit: row.dataset.unit,
        normal_range: row.dataset.range,
      }));`;

const replacement = `      const parameters = Array.from(form.querySelectorAll("[data-parameter-row]")).map((row) => ({
        parameter_name: row.dataset.parameterName,
        value: row.querySelector("input, textarea")?.value || "",
        unit: row.dataset.unit,
        normal_range: row.dataset.range,
      }));`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(path, content);
    console.log("Successfully fixed reception.js Save All logic");
} else {
    console.log("Target not found in reception.js");
}
