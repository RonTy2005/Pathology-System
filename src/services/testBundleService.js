const { all } = require("../db/helpers");

async function getBundleComponentTests(bundleTestId) {
  const normalizedBundleTestId = Number(bundleTestId);
  if (!Number.isInteger(normalizedBundleTestId) || normalizedBundleTestId <= 0) {
    return [];
  }

  return all(
    `SELECT t.*, tbi.display_order AS bundle_display_order
     FROM test_bundle_items tbi
     JOIN tests t ON t.id = tbi.component_test_id
     WHERE tbi.bundle_test_id = ? AND t.active = 1
     ORDER BY tbi.display_order ASC, t.id ASC`,
    [normalizedBundleTestId]
  );
}

function normalizeParameterName(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function mergeComponentParameters(componentParameters, recordedParameters) {
  const recordedByName = new Map(
    (recordedParameters || []).map((parameter) => [
      normalizeParameterName(parameter.parameter_name),
      parameter,
    ])
  );

  return (componentParameters || []).map((parameter) => {
    const recorded = recordedByName.get(normalizeParameterName(parameter.parameter_name));
    return {
      parameter_name: parameter.parameter_name,
      unit: recorded?.unit || parameter.unit || "",
      normal_range: recorded?.normal_range || parameter.normal_range || "",
      entry_mode: recorded?.entry_mode || parameter.entry_mode || "manual",
      value: recorded?.value || "",
    };
  });
}

/**
 * Replaces a bundle test in a report with its component report tests.  This is
 * deliberately also used at report time, rather than only during registration:
 * it keeps previously registered bundle visits and catalogue previews from
 * producing a blank, parameter-less bundle page.
 */
async function expandBundleReportTests(tests = []) {
  const expanded = [];

  for (const test of tests) {
    const components = await getBundleComponentTests(test?.test_id);
    if (!components.length) {
      expanded.push(test);
      continue;
    }

    for (const component of components) {
      const componentParameters = await all(
        `SELECT parameter_name, unit, normal_range, entry_mode
         FROM test_parameters
         WHERE test_id = ?
         ORDER BY display_order ASC, id ASC`,
        [component.id]
      );

      expanded.push({
        ...test,
        test_id: component.id,
        name: component.name,
        category: component.category,
        code: component.code,
        sample_type: component.sample_type,
        turnaround_hours: component.turnaround_hours,
        report_body: component.report_body,
        bundle_test_id: test.test_id,
        bundle_test_name: test.name,
        bundle_display_order: component.bundle_display_order,
        parameters: mergeComponentParameters(componentParameters, test.parameters),
      });
    }
  }

  return expanded;
}

/**
 * Replaces a selected catalog bundle with its reportable component tests.
 * Custom/outside tests are preserved unchanged, and duplicate components are
 * removed so selecting both a bundle and one of its children is safe.
 */
async function expandTestBundleConfigs(testConfigs = []) {
  const expanded = [];
  const includedTestIds = new Set();

  for (const config of testConfigs) {
    if (config?.isCustom) {
      expanded.push(config);
      continue;
    }

    const selectedTestId = Number(config?.id);
    if (!Number.isInteger(selectedTestId) || selectedTestId <= 0) continue;

    const components = await getBundleComponentTests(selectedTestId);
    const testIds = components.length
      ? components.map((component) => component.id)
      : [selectedTestId];

    for (const testId of testIds) {
      if (includedTestIds.has(testId)) continue;
      includedTestIds.add(testId);
      expanded.push({ ...config, id: testId });
    }
  }

  return expanded;
}

module.exports = {
  expandTestBundleConfigs,
  expandBundleReportTests,
  getBundleComponentTests,
};
