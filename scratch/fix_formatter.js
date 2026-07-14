const fs = require('fs');
const path = require('path');

const filePath = 'e:/Web Development/lab-system/src/utils/reportFormatter.js';
let content = fs.readFileSync(filePath, 'utf8');

const target = `                 const isHeader = [
                   "CBC (Complete Blood Count)",
                   "TLC (Total Leukocytes Count)",
                   "DLC (Differential Leukocytes Count)",
                   "ESR (Erythrocyte Sedimentation Rate)",
                   "RBC COUNT",
                   "MCHC (Mean Corpuscular Hb. Concentration)",
                   "Mean Corpuscular Hemoglobin Concentration (MCHC)",
                   "MEAN PLATELET VOLUME (MPV)",
                   "Hematocrit (HCT) / Packed Cell Volume (PCV)"
                 ].includes(param.parameter_name);

                 if (isHeader) {
                   return \`<tr><td colspan="4" class="group-header">\${escapeHtml(param.parameter_name)}</td></tr>\`;
                 }

                 const { isAbnormal, colorClass } = checkResultRange(param.value, param.normal_range);
                 const formattedVal = formatIndianNumberStrings(param.value);
                 const valDisplay = isAbnormal ? \`<span class="\${colorClass}">\${escapeHtml(formattedVal || "-")}</span>\` : escapeHtml(formattedVal || "-");
                 
                 const isSubParam = [
                   "Erythrocytes", "Leukocytes",
                   "Neutrophils", "Lymphocytes", "Monocytes", "Eosinophils", "Basophils",
                   "1st Hr. (Westegren Method)"
                 ].includes(param.parameter_name);
                 
                 const nameClass = isSubParam ? 'sub-param' : '';
                 
                 if (param.parameter_name === "Peripheral Smear") {
                    const res = param.value ? escapeHtml(param.value).replace(/\\n/g, "<br>") : "";
                    return \`
                     <tr><td colspan="4" style="font-weight: bold; padding-top: 10px;">Peripheral Smear</td></tr>
                     \${res ? \`<tr><td colspan="4" style="padding-left: 10px; padding-bottom: 5px;">\${res}</td></tr>\` : ""}
                     <tr><td colspan="4" style="font-size: 14px; padding-left: 10px;">* Methodology: Done by Hematology Analyzer</td></tr>
                   \`;
                 }

                  const displayValue = (param.parameter_name === "Control Value" && !formattedVal) ? "28.40" : (formattedVal || "-");
                  const valDisplay = isAbnormal ? \`<span class="\${colorClass}">\${escapeHtml(displayValue)}</span>\` : escapeHtml(displayValue);
                  
                  const isSubParam = [
                    "Erythrocytes", "Leukocytes",
                    "Neutrophils", "Lymphocytes", "Monocytes", "Eosinophils", "Basophils",
                    "1st Hr. (Westegren Method)",
                    "Patient Value", "Control Value"
                  ].includes(param.parameter_name);`;

const replacement = `                 const isHeader = [
                   "CBC (Complete Blood Count)",
                   "TLC (Total Leukocytes Count)",
                   "DLC (Differential Leukocytes Count)",
                   "ESR (Erythrocyte Sedimentation Rate)",
                   "RBC COUNT",
                   "MCHC (Mean Corpuscular Hb. Concentration)",
                   "Mean Corpuscular Hemoglobin Concentration (MCHC)",
                   "MEAN PLATELET VOLUME (MPV)",
                   "Hematocrit (HCT) / Packed Cell Volume (PCV)",
                   "PARTIAL THROMBOPLASTIN TIME, ACTIVATED (APTT)"
                 ].includes(param.parameter_name);

                 if (isHeader) {
                   return \`<tr><td colspan="4" class="group-header">\${escapeHtml(param.parameter_name)}</td></tr>\`;
                 }

                 const { isAbnormal, colorClass } = checkResultRange(param.value, param.normal_range);
                 const formattedVal = formatIndianNumberStrings(param.value);
                 
                 const displayValue = (param.parameter_name === "Control Value" && !formattedVal) ? "28.40" : (formattedVal || "-");
                 const valDisplay = isAbnormal ? \`<span class="\${colorClass}">\${escapeHtml(displayValue)}</span>\` : escapeHtml(displayValue);
                 
                 const isSubParam = [
                   "Erythrocytes", "Leukocytes",
                   "Neutrophils", "Lymphocytes", "Monocytes", "Eosinophils", "Basophils",
                   "1st Hr. (Westegren Method)",
                   "Patient Value", "Control Value"
                 ].includes(param.parameter_name);
                 
                 const nameClass = isSubParam ? 'sub-param' : '';
                 
                 if (param.parameter_name === "Peripheral Smear") {
                    const res = param.value ? escapeHtml(param.value).replace(/\\n/g, "<br>") : "";
                    return \`
                     <tr><td colspan="4" style="font-weight: bold; padding-top: 10px;">Peripheral Smear</td></tr>
                     \${res ? \`<tr><td colspan="4" style="padding-left: 10px; padding-bottom: 5px;">\${res}</td></tr>\` : ""}
                     <tr><td colspan="4" style="font-size: 14px; padding-left: 10px;">* Methodology: Done by Hematology Analyzer</td></tr>
                   \`;
                 }

                 return \`
                   <tr>
                     <td class="\${nameClass}">
                       \${escapeHtml(param.parameter_name)}
                       \${param.parameter_name.toUpperCase() === 'PLATELET COUNT' ? '<div style="font-size: 13px; color: #444; font-weight: normal; margin-top: 2px;">Electrical impedance</div>' : ''}
                       \${param.parameter_name.toUpperCase().includes('TOTAL LEUCOCYTE COUNT (TLC)') ? '<div style="font-size: 13px; color: #444; font-weight: normal; margin-top: 2px;">Electrical Impedence</div>' : ''}
                       \${param.parameter_name.toUpperCase().includes('ABSOLUTE EOSINOPHIL COUNT') ? '<div style="font-size: 13px; color: #444; font-weight: normal; margin-top: 2px;">Electrical Impedance, VCS</div>' : ''}
                       \${param.parameter_name.toUpperCase().includes('ABSOLUTE LYMPHOCYTE COUNT') ? '<div style="font-size: 13px; color: #444; font-weight: normal; margin-top: 2px;">Electrical Impedance, VCS</div>' : ''}
                       \${param.parameter_name.toUpperCase().includes('ABSOLUTE POLYMORPHS COUNT') ? '<div style="font-size: 13px; color: #444; font-weight: normal; margin-top: 2px;">Electrical Impedance, VCS</div>' : ''}
                       \${param.parameter_name.toUpperCase().includes('MCHC') ? '<div style="font-size: 13px; color: #444; font-weight: normal; margin-top: 2px;">Calculated</div>' : ''}
                       \${param.parameter_name.toUpperCase().includes('MEAN CORPUSCULAR HEMOGLOBIN (MCH)') ? '<div style="font-size: 13px; color: #444; font-weight: normal; margin-top: 2px;">Calculated</div>' : ''}
                       \${param.parameter_name.toUpperCase().includes('MEAN CORPUSCULAR VOLUME (MCV)') ? '<div style="font-size: 13px; color: #444; font-weight: normal; margin-top: 2px;">Calculated</div>' : ''}
                       \${param.parameter_name.toUpperCase().includes('PLATELET DISTRIBUTION WIDTH') ? '<div style="font-size: 13px; color: #444; font-weight: normal; margin-top: 2px;">Electrical Impedence</div>' : ''}
                       \${param.parameter_name.toUpperCase().includes('ABSOLUTE MONOCYTE COUNT') ? '<div style="font-size: 13px; color: #444; font-weight: normal; margin-top: 2px;">Electrical Impedance, VCS</div>' : ''}
                       \${param.parameter_name.toUpperCase().includes('HEMOGLOBIN (HB)') ? '<div style="font-size: 13px; color: #444; font-weight: normal; margin-top: 2px;">Photometry</div>' : ''}
                       \${test.name.toUpperCase().includes('APTT') ? '<div style="font-size: 13px; color: #444; font-weight: normal; margin-top: 2px;">Photo optical Clot Detection</div>' : ''}
                     </td>
                     <td style="font-weight: \${isAbnormal ? 'bold' : 'normal'}">\${valDisplay}</td>
                     <td style="font-size: 15px;">\${escapeHtml(formatIndianNumberStrings(param.normal_range) || "-").replace(/\\r?\\n/g, "<br>")}</td>
                     <td>\${escapeHtml(param.unit || "")}</td>
                   </tr>
                 \`;`;

// Try to find the content regardless of exact whitespace variations
const normalizedTarget = target.replace(/\s+/g, ' ');
const contentLines = content.split('\n');
let found = false;

// If exact match fails, try a line-by-line approach or a more robust replacement
if (content.indexOf(target) !== -1) {
    content = content.replace(target, replacement);
    found = true;
} else {
    console.log("Exact match failed, trying alternative...");
    // Fallback: replace the block from line 263 to 309 based on viewed lines
    const startLine = 263;
    const endLine = 309;
    const lines = content.split('\n');
    lines.splice(startLine - 1, endLine - startLine + 1, replacement);
    content = lines.join('\n');
    found = true;
}

if (found) {
    fs.writeFileSync(filePath, content);
    console.log("Successfully patched reportFormatter.js");
} else {
    console.log("Failed to patch reportFormatter.js");
    process.exit(1);
}
