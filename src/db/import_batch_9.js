const { importBatch } = require('./import_helper.js');

const tests = [
  // Image 00017
  { name: "Digital XRAY Mamography (Both)", category: "X-Ray", price: 500, sample_type: "Imaging" },
  { name: "Digital XRAY Mamography (Left/Right)", category: "X-Ray", price: 500, sample_type: "Imaging" },
  { name: "Digital XRAY Mandible (Ipsilateral)", category: "X-Ray", price: 150, sample_type: "Imaging" },
  { name: "Digital XRAY Mandible PA", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital XRAY Mandible PA / Lat", category: "X-Ray", price: 500, sample_type: "Imaging" },
  { name: "Digital XRAY Mastoid AP", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital XRAY Mastoid AP / Lat", category: "X-Ray", price: 500, sample_type: "Imaging" },
  { name: "Digital XRAY Mastoid Lat", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital XRAY Mastoid Lat / Obl", category: "X-Ray", price: 500, sample_type: "Imaging" },
  { name: "Digital XRAY Mastoid Obl", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital XRAY Mastoid Towne's", category: "X-Ray", price: 150, sample_type: "Imaging" },
  { name: "Digital XRAY MCU (Micturating Cystourethrogram)", category: "X-Ray", price: 2000, sample_type: "Imaging" },
  { name: "Digital XRAY Merchants", category: "X-Ray", price: 200, sample_type: "Imaging" },
  { name: "Digital XRAY Micturating Cystourethrogram", category: "X-Ray", price: 1500, sample_type: "Imaging" },
  { name: "Digital XRAY Myelogram", category: "X-Ray", price: 125, sample_type: "Imaging" },
  { name: "Digital XRAY Nasal Bone (Both)", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital XRAY Neck", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital XRAY Nephrostomy", category: "X-Ray", price: 450, sample_type: "Imaging" },
  { name: "Digital XRAY Occlusal (Upper Jaw)", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital XRAY Omnipaque Contrast", category: "X-Ray", price: 900, sample_type: "Imaging" },
  { name: "Digital XRAY Optic Foraminal", category: "X-Ray", price: 125, sample_type: "Imaging" },
  { name: "Digital XRAY Oral Cholecystogram", category: "X-Ray", price: 600, sample_type: "Imaging" },
  { name: "Digital XRAY Orbit AP", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital XRAY Orbit AP / Lat", category: "X-Ray", price: 500, sample_type: "Imaging" },
  { name: "Digital XRAY Orbit Lat", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital XRAY Orbit Obl", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital XRAY Palm AP", category: "X-Ray", price: 250, sample_type: "Imaging" },

  // Image 00018
  { name: "Digital XRAY Knee (Left/Right) Obl", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital XRAY Knee (Left/Right) Standing", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital XRAY KUB", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital XRAY L/S Spine AP", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital XRAY L/S Spine AP / Lat", category: "X-Ray", price: 500, sample_type: "Imaging" },
  { name: "Digital XRAY L/S Spine AP / Lat / Flexion", category: "X-Ray", price: 1000, sample_type: "Imaging" },
  { name: "Digital XRAY L/S Spine AP / Lat / Obl", category: "X-Ray", price: 750, sample_type: "Imaging" },
  { name: "Digital XRAY L/S Spine Lat", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital XRAY L/S Spine Obl", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital XRAY Larynx AP / Lat", category: "X-Ray", price: 150, sample_type: "Imaging" },
  { name: "Digital XRAY Leg AP", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital XRAY Leg AP / Lat", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital XRAY Leg Lat", category: "X-Ray", price: 250, sample_type: "Imaging" },
  { name: "Digital XRAY Limbs AP", category: "X-Ray", price: 125, sample_type: "Imaging" }
];

importBatch(tests).then(() => process.exit());
