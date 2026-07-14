const { importBatch } = require('./import_helper.js');

const tests = [
  // Image 00011
  { name: "Cytomegalovirus (CMV) IgG & IgM", category: "Serology", price: 800, sample_type: "Serum" },
  { name: "Cytomegalovirus (CMV) IgM", category: "Serology", price: 300, sample_type: "Serum" },
  { name: "D DIMER TEST", category: "Hematology", price: 800, sample_type: "Citrate Plasma" },
  { name: "DC & MP", category: "Hematology", price: 150, sample_type: "Blood" },
  { name: "Dengue (IgG, IgM) & NS1 Antigen", category: "Serology", price: 700, sample_type: "Serum" },
  { name: "Dengue IgG Antibody", category: "Serology", price: 800, sample_type: "Serum" },
  { name: "Dengue IgM Antibody", category: "Serology", price: 800, sample_type: "Serum" },
  { name: "Dengue NS1 Antigen", category: "Serology", price: 800, sample_type: "Serum" },
  { name: "Dental OPG", category: "X-Ray", price: 700, sample_type: "Imaging" },
  { name: "DHEA - S (Dehydroepiandrosterone Sulfate)", category: "Biochemistry", price: 500, sample_type: "Serum" },
  { name: "DHEA (Dehydroepiandrosterone)", category: "Biochemistry", price: 500, sample_type: "Serum" },
  { name: "Diabetic Profile", category: "Health Package", price: 1870, sample_type: "Multiple" },
  { name: "Diabetic Profile(Extended)", category: "Health Package", price: 750, sample_type: "Multiple" },
  { name: "Diabetic Renal Profile", category: "Health Package", price: 2870, sample_type: "Multiple" },
  { name: "Digital Xray Abdomen", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital Xray Abdomen AP Supine", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital Xray Abdomen Erect Position", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital Xray Acromio-Clavicular Joint", category: "X-Ray", price: 125, sample_type: "Imaging" },
  { name: "Digital Xray Ankle AP", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital Xray Ankle AP / Lat", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital Xray Ankle Axial", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital Xray Ankle Inversion", category: "X-Ray", price: 500, sample_type: "Imaging" },

  // Image 00012
  { name: "Digital Xray Ankle Lat", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital Xray Ankle Obl", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital Xray Apicogram", category: "X-Ray", price: 125, sample_type: "Imaging" },
  { name: "Digital Xray Arm AP", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital Xray Arm AP / Lat", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital Xray Arm Lat", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital Xray Barium (Little Barium) for ...", category: "X-Ray", price: 500, sample_type: "Imaging" },
  { name: "Digital Xray Barium Cotton Wool", category: "X-Ray", price: 500, sample_type: "Imaging" },
  { name: "Digital Xray Barium Enema", category: "X-Ray", price: 1500, sample_type: "Imaging" },
  { name: "Digital Xray Barium Meal Follow Through", category: "X-Ray", price: 2000, sample_type: "Imaging" },
  { name: "Digital Xray Barium Meal GI Tract Follow Through", category: "X-Ray", price: 800, sample_type: "Imaging" },
  { name: "Digital Xray Barium Meal Ileo Caecal", category: "X-Ray", price: 2000, sample_type: "Imaging" },
  { name: "Digital Xray Barium Meal Oesophagus", category: "X-Ray", price: 1500, sample_type: "Imaging" },
  { name: "Digital Xray Barium Meal/Stomach", category: "X-Ray", price: 600, sample_type: "Imaging" },
  { name: "Digital Xray Barium Swallow", category: "X-Ray", price: 2000, sample_type: "Imaging" },
  { name: "Digital Xray Barium Swallow Oesophagus", category: "X-Ray", price: 500, sample_type: "Imaging" },
  { name: "Digital Xray Both S I Joint", category: "X-Ray", price: 220, sample_type: "Imaging" },
  { name: "Digital Xray Calcanium (Both) AP / Lat", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital Xray Calcanium (Left/Right) AP", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital Xray Calcanium Lat", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital Xray Carpal Tunnel", category: "X-Ray", price: 125, sample_type: "Imaging" },
  { name: "Digital Xray Cervical Spine AP", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital Xray Cervical Spine AP / Lat", category: "X-Ray", price: 500, sample_type: "Imaging" }
];

importBatch(tests).then(() => process.exit());
