function normalizeParameterName(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function clampPrecision(value) {
  const precision = Number(value);
  return Number.isInteger(precision) ? Math.min(6, Math.max(0, precision)) : 2;
}

function evaluateFormula(formula, values) {
  const source = String(formula || "").trim();
  if (!source) return null;

  const conditional = source.match(
    /^IF\s*\(\s*\{([^{}]+)\}\s*(>=|<=|>|<|==|=|!=)\s*(-?\d+(?:\.\d+)?)\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\)$/i
  );
  if (conditional) {
    const [, parameterName, operator, target, whenTrue, whenFalse] = conditional;
    const sourceValue = Number.parseFloat(values.get(normalizeParameterName(parameterName)));
    if (!Number.isFinite(sourceValue)) return null;

    const targetValue = Number(target);
    const comparison = {
      ">": sourceValue > targetValue,
      ">=": sourceValue >= targetValue,
      "<": sourceValue < targetValue,
      "<=": sourceValue <= targetValue,
      "=": sourceValue === targetValue,
      "==": sourceValue === targetValue,
      "!=": sourceValue !== targetValue,
    }[operator];
    return comparison ? whenTrue : whenFalse;
  }

  let hasMissingValue = false;
  const expression = source.replace(/\{([^{}]+)\}/g, (_match, parameterName) => {
    const value = Number.parseFloat(values.get(normalizeParameterName(parameterName)));
    if (!Number.isFinite(value)) {
      hasMissingValue = true;
      return "0";
    }
    return String(value);
  });

  if (hasMissingValue || !expression || !/^[\d\s.+\-*/()%]+$/.test(expression)) {
    return null;
  }

  try {
    const result = Function(`"use strict"; return (${expression});`)();
    return Number.isFinite(result) ? result : null;
  } catch (_error) {
    return null;
  }
}

function normalizeSubmittedParameter(parameter = {}) {
  return {
    parameterName: String(parameter.parameter_name || "").trim(),
    value: String(parameter.value ?? "").trim(),
    unit: String(parameter.unit || "").trim(),
    normalRange: String(parameter.normal_range || "").trim(),
  };
}

function applyCalculatedParameters(catalogParameters = [], submittedParameters = []) {
  const submittedByName = new Map();
  submittedParameters.forEach((parameter) => {
    const normalized = normalizeSubmittedParameter(parameter);
    if (normalized.parameterName) {
      submittedByName.set(normalizeParameterName(normalized.parameterName), normalized);
    }
  });

  if (!catalogParameters.length) {
    return Array.from(submittedByName.values()).map((parameter) => ({
      parameter_name: parameter.parameterName,
      value: parameter.value,
      unit: parameter.unit,
      normal_range: parameter.normalRange,
      entry_mode: "manual",
    }));
  }

  const rows = catalogParameters.map((parameter) => {
    const parameterName = String(parameter.parameter_name || "").trim();
    const submitted = submittedByName.get(normalizeParameterName(parameterName));
    const entryMode = parameter.entry_mode === "calculated" ? "calculated" : "manual";
    return {
      parameter_name: parameterName,
      value: entryMode === "manual" ? (submitted?.value || "") : "",
      unit: String(parameter.unit || submitted?.unit || "").trim(),
      normal_range: String(parameter.normal_range || submitted?.normalRange || "").trim(),
      entry_mode: entryMode,
      calculation_formula: entryMode === "calculated" ? String(parameter.calculation_formula || "").trim() : "",
      calculation_precision: clampPrecision(parameter.calculation_precision),
    };
  });

  const values = new Map(rows.map((row) => [normalizeParameterName(row.parameter_name), row.value]));
  const calculatedRows = rows.filter((row) => row.entry_mode === "calculated");

  // A formula may depend on another calculated value, so calculate repeatedly
  // until the dependency chain has settled.
  for (let pass = 0; pass < calculatedRows.length; pass += 1) {
    calculatedRows.forEach((row) => {
      const calculated = evaluateFormula(row.calculation_formula, values);
      const value = calculated === null
        ? ""
        : typeof calculated === "string"
          ? calculated
          : calculated.toFixed(row.calculation_precision);
      row.value = value;
      values.set(normalizeParameterName(row.parameter_name), value);
    });
  }

  return rows.map(({ calculation_formula, calculation_precision, ...row }) => row);
}

module.exports = {
  applyCalculatedParameters,
  evaluateFormula,
  normalizeParameterName,
};
