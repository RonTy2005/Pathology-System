const { importBatch } = require('./import_helper.js');

const tests = [
  // Image 00047
  { name: "Weil Felix Test", category: "Serology", price: 100, sample_type: "Blood" },
  { name: "Well Women Profile", category: "Biochemistry", price: 2000, sample_type: "Blood" },
  { name: "Widal Test (Slide Method)", category: "Serology", price: 150, sample_type: "Blood" },
  { name: "Widal Test (Tube method)", category: "Serology", price: 100, sample_type: "Blood" },
  { name: "Wound Swab AFB Stain", category: "Microbiology", price: 80, sample_type: "Swab" },
  { name: "Wound Swab Culture", category: "Microbiology", price: 110, sample_type: "Swab" },
  { name: "Wound Swab Gram Stain", category: "Microbiology", price: 70, sample_type: "Swab" },
  { name: "Zinc", category: "Biochemistry", price: 600, sample_type: "Blood" }
];

importBatch(tests).then(() => process.exit());
