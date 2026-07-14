const { run, all } = require('./src/db/helpers');

async function test() {
  try {
    // 1. Create a doctor
    const doc = await run(
      \INSERT INTO doctors (name, phone, specialization, commission_percent, active) VALUES ('Dr. Test', '123', 'Gen', 10, 1)\
    );
    console.log('Doctor created:', doc.id);

    // 2. Create a patient
    const pat = await run(
      \INSERT INTO patients (patient_code, name, age, gender) VALUES ('PAT999', 'Test Patient', 30, 'Male')\
    );
    console.log('Patient created:', pat.id);

    // 3. Create a visit with amount_paid = 0 (Unpaid)
    await run(
      \INSERT INTO visits (bill_no, patient_id, doctor_id, subtotal, discount, total, amount_paid, amount_due, payment_mode, payment_status, sample_source, status, created_by, created_at)
       VALUES ('BILL999', ?, ?, 1000, 0, 1000, 0, 1000, 'cash', 'due', 'lab', 'registered', 1, CURRENT_TIMESTAMP)\,
      [pat.id, doc.id]
    );
    console.log('Visit created (Unpaid)');

    // 4. Create another visit with amount_paid = 1000 (Paid)
    await run(
      \INSERT INTO visits (bill_no, patient_id, doctor_id, subtotal, discount, total, amount_paid, amount_due, payment_mode, payment_status, sample_source, status, created_by, created_at)
       VALUES ('BILL998', ?, ?, 500, 0, 500, 500, 0, 'cash', 'paid', 'lab', 'registered', 1, CURRENT_TIMESTAMP)\,
      [pat.id, doc.id]
    );
    console.log('Visit created (Paid)');

    // 5. Run Financial Report Query
    const doctorCommissions = await all(
      \
      SELECT
        d.id,
        d.name,
        d.commission_percent,
        COUNT(v.id) AS visitCount,
        COALESCE(SUM(v.total), 0) AS totalSales,
        ROUND(COALESCE(SUM(v.total), 0) * d.commission_percent / 100, 2) AS commissionAmount
      FROM doctors d
      JOIN visits v ON v.doctor_id = d.id
      GROUP BY d.id
      \
    );
    console.log('Financial Report:', doctorCommissions);

    // cleanup
    await run('DELETE FROM visits WHERE bill_no IN ("BILL999", "BILL998")');
    await run('DELETE FROM patients WHERE id = ?', [pat.id]);
    await run('DELETE FROM doctors WHERE id = ?', [doc.id]);
  } catch(e) {
    console.error(e);
  }
}
test();
