// Shared by the browser, server and catalogue audits. Billing entries are kept;
// this policy only controls generated laboratory reports and their templates.
(function (root) {
  const compact = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const BILLING_ONLY_MESSAGE = 'Billing only: X-ray, MRI, CT and USG services do not require a laboratory report format.';

  function isBillingOnlyTest(test = {}) {
    const label = String(test.custom_test_name || test.name || '');
    const name = compact(label);
    const category = compact(test.category);
    // Image-guided specimen examinations remain laboratory tests. CT can also
    // mean clotting time; do not classify it by the two-letter abbreviation.
    if (/(biopsy|histopath|histology|cytology|fnac|clottingtime)/.test(name)) return false;
    if (['xray', 'mri', 'ct', 'ctscan', 'usg', 'ultrasound', 'ultrasonography', 'radiology', 'imaging'].includes(category)) return true;
    return /xray|ctscan|computedtomography|computerisedtomography|computerizedtomography|magneticresonance|ultrasound|ultrasonograph/.test(name)
      || /\b(mri|usg)\b/i.test(label)
      || /^(mri|usg)/.test(name)
      || /^ct(pns|brain|chest|abdomen|abdominal|pelvis|head|neck|spine|angiogra|urogra)/.test(name);
  }

  function isPathologyTest(testName = '', testCategory = '') {
    if (isBillingOnlyTest({ name: testName, category: testCategory })) return false;
    // Preserve the application's existing non-imaging workflow exclusions.
    const name = String(testName || '').toLowerCase();
    const category = String(testCategory || '').toLowerCase();
    return !['cardiology', 'neurology', 'uroflowmetry', 'tmt', 'eeg', 'ecg',
      'endoscopy', 'coloscopy', 'colonoscopy', 'biopsy', 'histopathology', 'cytology']
      .some(exclusion => name.includes(exclusion) || category.includes(exclusion));
  }

  const policy = { isBillingOnlyTest, isPathologyTest, BILLING_ONLY_MESSAGE };
  if (typeof module !== 'undefined' && module.exports) module.exports = policy;
  else root.ReportEligibility = policy;
})(typeof globalThis !== 'undefined' ? globalThis : this);
