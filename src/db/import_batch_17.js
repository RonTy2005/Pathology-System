const { importBatch } = require('./import_helper.js');

const tests = [
  // Image 00033
  { name: "Peritonial Fluid LDH", category: "Biochemistry", price: 350, sample_type: "Peritonial Fluid" },
  { name: "Peritonial Fluid Protein", category: "Biochemistry", price: 100, sample_type: "Peritonial Fluid" },
  { name: "Peritonial Fluid Sugar", category: "Biochemistry", price: 50, sample_type: "Peritonial Fluid" },
  { name: "PFT (Pulmonary function Test)", category: "Other", price: 800, sample_type: "N/A" },
  { name: "pH", category: "Biochemistry", price: 800, sample_type: "Serum" },
  { name: "Phenobarbitone", category: "Biochemistry", price: 600, sample_type: "Serum" },
  { name: "Phenytoin / Dilantin", category: "Biochemistry", price: 600, sample_type: "Serum" },
  { name: "Phospholipid", category: "Biochemistry", price: 200, sample_type: "Serum" },
  { name: "Phospholipid Antibody IgG (APLA - G)", category: "Serology", price: 400, sample_type: "Serum" },
  { name: "Phospholipid Antibody IgM (APLA - M)", category: "Serology", price: 400, sample_type: "Serum" },
  { name: "Phosphorus (24 hrs. urine)", category: "Biochemistry", price: 150, sample_type: "Urine" },
  { name: "Phosphorus (Serum)", category: "Biochemistry", price: 150, sample_type: "Serum" },
  { name: "Plasmodium Falciparum Antigen", category: "Serology", price: 250, sample_type: "Whole Blood" },
  { name: "Plasmodium Pan Antigen", category: "Serology", price: 300, sample_type: "Whole Blood" },
  { name: "Platelet Count", category: "Hematology", price: 120, sample_type: "Whole Blood" },
  { name: "Pleural Fluid for Cell Type & Cell Count", category: "Hematology", price: 1200, sample_type: "Pleural Fluid" },
  { name: "Pleural Fluid for Chloride", category: "Biochemistry", price: 150, sample_type: "Pleural Fluid" },
  { name: "Pleural Fluid for Gram stain", category: "Microbiology", price: 150, sample_type: "Pleural Fluid" },
  { name: "Pleural Fluid for Protein", category: "Biochemistry", price: 100, sample_type: "Pleural Fluid" },
  { name: "Pleural Fluid for Sugar", category: "Biochemistry", price: 100, sample_type: "Pleural Fluid" },

  // Image 00034
  { name: "Pleural Fluid Specific Gravity", category: "Biochemistry", price: 60, sample_type: "Pleural Fluid" },
  { name: "Post Coital Test", category: "Other", price: 500, sample_type: "Cervical Mucus" },
  { name: "Potassium(24 hour Urine)", category: "Biochemistry", price: 150, sample_type: "Urine" },
  { name: "Potassium(Random)", category: "Biochemistry", price: 250, sample_type: "Urine" },
  { name: "Potassium(Serum)", category: "Biochemistry", price: 250, sample_type: "Serum" },
  { name: "PRA (Plasma Renin Activity)", category: "Hormone", price: 4000, sample_type: "Plasma" },
  { name: "Pre - Employment Check Up", category: "Profile", price: 500, sample_type: "Multiple" },
  { name: "Pre - Marriage Profile", category: "Profile", price: 1200, sample_type: "Multiple" },
  { name: "Pre - Operative Profile", category: "Profile", price: 870, sample_type: "Multiple" },
  { name: "Pre Cath Profile", category: "Profile", price: 2000, sample_type: "Multiple" },
  { name: "Precancer & Early Detection of Oral Cancer", category: "Profile", price: 1600, sample_type: "Oral Swab" },
  { name: "Pregnancy Elisa Test", category: "Serology", price: 1300, sample_type: "Serum" },
  { name: "Pregnancy Profile", category: "Profile", price: 80, sample_type: "Multiple" },
  { name: "Progesterone", category: "Hormone", price: 500, sample_type: "Serum" },
  { name: "Prolactin (PRL)", category: "Hormone", price: 400, sample_type: "Serum" },
  { name: "Prostate Cancer Profile", category: "Profile", price: 800, sample_type: "Serum" },
  { name: "Prostatic Fluid C/S", category: "Microbiology", price: 220, sample_type: "Prostatic Fluid" },
  { name: "Prostatic Smear for Gram Stain", category: "Microbiology", price: 100, sample_type: "Prostatic Fluid" },
  { name: "Protein Electrophoresis", category: "Biochemistry", price: 600, sample_type: "Serum" },
  { name: "Prothrombin Time with INR", category: "Hematology", price: 400, sample_type: "Plasma" },
  { name: "PSA (Prostate Specific Antigen)", category: "Hormone", price: 600, sample_type: "Serum" },
  { name: "PTH - (Intact Molecule)", category: "Hormone", price: 300, sample_type: "Serum" },
  { name: "PTH (Para Thyroid Hormone)", category: "Hormone", price: 950, sample_type: "Serum" },
  { name: "PUO - Work Up Profile", category: "Profile", price: 1200, sample_type: "Multiple" }
];

importBatch(tests).then(() => process.exit());
