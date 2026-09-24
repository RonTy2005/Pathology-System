function sampleBill(serviceCount = 5) {
  return {
    patient: { id: 17, patient_code: "P-0017", name: "Sample Patient", age: 45, gender: "Female", phone: "9876543210" },
    visit: {
      bill_no: "BILL-20260911-0017", created_at: "2026-09-11T09:30:00.000Z", sample_source: "lab",
      associate_label: "Direct at facility", payment_mode: "cash", subtotal: 2500, discount: 100,
      total: 2400, amount_paid: 2400, amount_due: 0, creator_name: "Reception Team",
    },
    doctor: { name: "Dr. Sample Doctor" },
    businessSettings: {
      businessName: "LabShield Diagnostic Centre",
      facilityType: "Diagnostic Laboratory",
      address: "123 Laboratory Road, City Centre, Kolkata, West Bengal",
      businessOpeningTime: "09:00",
      businessClosingTime: "18:30",
    },
    tests: Array.from({ length: serviceCount }, (_, index) => ({
      name: `Comprehensive laboratory service ${index + 1} with a readable service name`,
      code: `TEST-${String(index + 1).padStart(3, "0")}`,
      price: 500,
    })),
  };
}

module.exports = { sampleBill };
