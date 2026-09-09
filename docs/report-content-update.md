# Report content update — 9 September 2026

## Follow-up — 10 September 2026: blank cell reports

The Abnormal Cells entry (225) still had only a generic `Result` field. It now
has Abnormal Cells, Microscopic Findings, Impression and Comments, with a
qualitative reference and a lower interpretation section. The four explicitly
named cell-count tests for ascitic fluid (274), body fluid (288), CSF (349) and
joint fluid (670) now have specimen/site, cell counts, differential findings,
microscopic findings, impression and comments.

The specimen identities were recovered from the existing import scripts.
No numerical fluid intervals were guessed; the lab must configure intervals
appropriate to its specimen and method. The truncated ascitic
"Cell Count, Biochemistry" profile is deliberately not treated as a cell-count
only test. New/imported tests with these exact identities also receive the
structured schema when no fields have been supplied.

Preview examples are labelled sample observations. Actual reports do not
automatically receive a negative finding, a zero count or an interpretation.
Multiline findings retain their line breaks. The report title identifies the
actual test, and all existing CSS remains unchanged.

All five repaired entries had no visit or bundle history. Their old placeholders
and specimens are retained in `cell_report_schema_backups`; custom fields, notes,
ranges, formulas and used tests are protected from automatic replacement. A
local pre-change database backup is also kept under the ignored
`tmp/report-content/` directory and is not committed.

Verification: **19 checks passed**, including the complete local catalogue's
style regression, migration rollback and preservation tests. All five live
public sample previews returned the new fields and explanatory sections.
The latest read-only audit is `tmp/report-content/after-cell-repair.json`:
**39 supplemented reports; 314 placeholder-only entries remain**. Counts below
describe the earlier 9 September pass, not completion of every catalogue format.

The added explanatory prose is informed by [MedlinePlus blood-smear guidance](https://medlineplus.gov/lab-tests/blood-smear/),
[Mayo Clinic Laboratories' body-fluid cell-count guidance](https://www.mayocliniclabs.com/test-catalog/Overview/608873)
and [MedlinePlus CSF guidance](https://medlineplus.gov/lab-tests/cerebrospinal-fluid-csf-analysis/).
Definitions and source links are maintained in `src/services/cellReportService.js`.

## Original 9 September update

This update adds lower explanatory content, not a visual redesign. The restored
fonts, CSS, letterhead, patient header, footer and existing bespoke descriptions
are preserved. The shared formatter supplies the same additions to generated
reports, saved-test samples and the builder's live preview.

## Local catalogue audit

The read-only audit renders synthetic reports, not patient records. It checks
actual explanatory markup rather than assuming an empty `report_body` means an
empty report. These are structural review counts, not clinical certification.

| Finding | Count after this update |
| --- | ---: |
| Active catalogue entries inspected | 907 |
| Reports receiving new explanatory sections | 34 |
| Explicit combinations repaired | 10 |
| Placeholder-only schemas remaining | 319 |
| Other reports without detected explanatory sections | 364 |
| Of those, narrative/qualitative review candidates | 362 |
| Entries without configured reference text | 698 |

The last number is **not 698 missing numerical normal ranges**: culture,
histopathology, imaging and narrative examinations often do not use numerical
intervals. Notes detection likewise does not verify clinical completeness.

The two remaining non-placeholder/non-narrative candidates are DNPH and the
generic urine routine examination. The latter still needs an approved structured
urinalysis schema. Unknown profiles, specimen variants and US-TSH combinations
were not assigned guessed components or intervals.

## Content covered

- FT3, FT4 and their TSH combinations; total T3/T4 combinations.
- Six explicitly named Hb/count/ESR/platelet combinations; iron with TIBC.
- Indirect bilirubin, CMP, KFT, LFT with GGT, phosphorus and ALP.
- Sodium, chloride, serum creatinine, timed urine creatinine, uric acid and
  ionized calcium.
- Urine glucose, semen analysis, CSF analysis and arterial blood gases.
- KOH preparation, the configured anti-HAV **IgG** test, and AFB culture with
  susceptibility testing.

Content is matched using exact identities and specimen checks; the anti-HAV
entry additionally requires its IgG parameter. Existing manually entered report
notes take precedence. Existing bespoke explanatory templates are not replaced.
Interpretation tables explain possible meanings; they do not generate a patient
diagnosis or fill in a missing result.

## Reference values and catalogue repair

The ten named combinations inherit parameter names, units and reference text
from their existing canonical component tests. No new numerical thresholds were
copied from a website. Free and total thyroid assays remain distinct. Routine
cultures are not mapped to mycobacterial testing by this update.

The lab still needs to approve its intervals for each method, age/sex group and
specimen before clinical use. In particular, inherited adult blood-count ranges
are not automatically age- or sex-adjusted by this migration. Existing lab ranges
were reused, not independently validated as universally applicable.

Repair applies only to untouched placeholder schemas in the imported catalogue,
with no visits, bundle links or custom notes. Custom units, intervals, fields,
formulas and existing patient results are not overwritten. All ten replacements
are transactional and recorded in `report_schema_repair_backups`, including the
original parameter rows, specimen and source definitions. A repeat run does not
overwrite later edits. A local pre-update database copy is also retained under
the ignored `tmp/report-content/` directory; it must not be uploaded to GitHub.

A separate rendering correction prevents the TLC component of these named
combinations from hiding Hb, differential, ESR or platelet results. Those
combinations use the existing general result table and their actual test title.

## Medical sources

The new explanatory prose is original, informed by the following sources.
Source URLs are also stored beside each content definition in
`src/services/reportContentService.js`. These sources support general explanations,
not approval of this laboratory's methods or intervals.

- Thyroid: [NIDDK](https://www.niddk.nih.gov/health-information/diagnostic-tests/thyroid),
  [American Thyroid Association](https://www.thyroid.org/thyroid-function-tests/).
- Blood counts and iron: [CBC](https://medlineplus.gov/lab-tests/complete-blood-count-cbc/),
  [ESR](https://medlineplus.gov/lab-tests/erythrocyte-sedimentation-rate-esr/),
  [iron tests](https://medlineplus.gov/lab-tests/iron-tests/).
- Chemistry: [phosphorus](https://medlineplus.gov/lab-tests/phosphate-in-blood/),
  [ALP](https://medlineplus.gov/lab-tests/alkaline-phosphatase/),
  [electrolytes](https://medlineplus.gov/lab-tests/electrolyte-panel/),
  [creatinine](https://medlineplus.gov/lab-tests/creatinine-test/),
  [uric acid](https://medlineplus.gov/lab-tests/uric-acid-test/),
  [bilirubin](https://medlineplus.gov/lab-tests/bilirubin-blood-test/),
  [CMP](https://medlineplus.gov/lab-tests/comprehensive-metabolic-panel-cmp/),
  [calcium](https://medlineplus.gov/lab-tests/calcium-blood-test/),
  [liver tests](https://medlineplus.gov/lab-tests/liver-function-tests/).
- Other examinations: [urine glucose](https://medlineplus.gov/lab-tests/glucose-in-urine-test/),
  [ABG](https://medlineplus.gov/lab-tests/arterial-blood-gas-abg-test/),
  [semen analysis](https://medlineplus.gov/lab-tests/semen-analysis/),
  [CSF](https://medlineplus.gov/lab-tests/cerebrospinal-fluid-csf-analysis/),
  [KOH microscopy](https://medlineplus.gov/ency/article/003761.htm).
- Microbiology: [CDC TB laboratory diagnosis](https://www.cdc.gov/tb/hcp/testing-diagnosis/clinical-and-laboratory-diagnosis.html),
  [CDC hepatitis A serology](https://www.cdc.gov/hepatitis-a/hcp/diagnosis-testing/index.html).

## Verification and repeatable audit

```powershell
npm run test:report-content
node scripts/audit-report-content.cjs --output=tmp/report-content/audit.json
```

The regression suite compares all 907 local report styles with restored commit
`9ffd1c6`, and compares complete generated markup outside the new supplemental
content for unaffected formats. Repaired combinations are instead checked for
every configured result field. Full-catalogue regression is explicitly skipped
when a local catalogue or the baseline Git commit is unavailable; the independent
content/migration tests still run using synthetic inputs and in-memory SQLite.

Tests cover custom notes, escaping, assay/specimen distinctions, missing results,
multi-test output, migration idempotency, preservation rules and rollback after a
failed write. This is software verification, not clinical validation. A fresh
visual/PDF review has not been performed in this content-only pass.
