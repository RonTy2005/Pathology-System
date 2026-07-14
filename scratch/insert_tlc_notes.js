const fs = require('fs');
const filePath = 'e:/Web Development/lab-system/src/utils/reportFormatter.js';
let content = fs.readFileSync(filePath, 'utf8');

const tlcNotes = `
        \${reportData.tests.some(t => t.name.toUpperCase().includes('TOTAL LEUCOCYTE COUNT (TLC)')) ? \`
        <div style="font-size: 13px; margin-top: 25px; line-height: 1.4;">
          <strong>Comments :</strong>
          <ul style="margin-top: 5px; margin-bottom: 12px; padding-left: 20px;">
            <li>WBC stands for white blood cell, which is a type of blood cell that is responsible for fighting infections and diseases in the body.</li>
          </ul>
          
          <strong>Low WBC Count Causes :</strong>
          <ul style="margin-top: 5px; margin-bottom: 12px; padding-left: 20px;">
            <li>Viral infections - can suppress the bone marrow, resulting in a decrease in WBC production.</li>
            <li>Chemotherapy or radiation therapy - These treatments can damage the bone marrow and reduce WBC production.</li>
            <li>Autoimmune disorders - can cause the body to attack and destroy its own WBCs.</li>
            <li>Bone marrow disorders - such as aplastic anemia, can reduce WBC production.</li>
            <li>HIV/AIDS - can attack and destroy WBCs, particularly CD4 cells.</li>
          </ul>

          <strong>High WBC Count Causes :</strong>
          <ul style="margin-top: 5px; margin-bottom: 15px; padding-left: 20px;">
            <li>Infection - Bacterial, viral, or parasitic infections can cause an increase in WBC count</li>
            <li>Leukemia - A type of blood cancer that begins in the bone marrow and leads to the overproduction of abnormal WBCs</li>
            <li>Stress - Emotional or physical stress can cause a temporary increase in the WBC count</li>
            <li>Smoking - Smoking can cause a rise in the WBC count</li>
            <li>Allergies - Allergic reactions can cause a temporary increase in WBC count</li>
            <li>Trauma - Physical trauma or injury can cause a temporary increase in the WBC count</li>
          </ul>
        </div>
        \` : ''}`;

// We want to insert this after the LAST occurrence of "Instruments: ... </div> ` : ''}"
// which is currently at the end of the Platelet Count section.
const marker = '<strong>Instruments:</strong> Fully automated cell counter - Mindray 300\n        </div>\n        ` : \'\'}';
const parts = content.split(marker);

if (parts.length > 1) {
    // Insert after the last part
    const lastPart = parts.pop();
    content = parts.join(marker) + marker + tlcNotes + lastPart;
    fs.writeFileSync(filePath, content);
    console.log("Successfully inserted TLC notes.");
} else {
    console.error("Marker not found.");
}
