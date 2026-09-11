# Report content update — 9 September 2026

## Bill print layout — 11 September 2026

Bills remain a deliberate upper-half A4 patient slip (210 mm x 148.5 mm), but
the printed body text is now 11.5 px, service rows 11.2 px and headings/totals
are enlarged proportionally. A bill with more than five services starts a new
upper-half slip instead of reducing text size. Reports and their styling are
unchanged.

## Desktop update policy — 11 September 2026

Installed Windows desktop apps check the mode-specific LabShield GitHub Release
about 20 seconds after launch, every 30 minutes while online, and after a PC
resumes. A push to `main` starts the GitHub Action that allocates a newer
version, builds both installers and publishes their update metadata/assets.
A plain push is therefore detected after that release job succeeds, not before.

When an update has downloaded, LabShield prompts the user to restart and install
it now. Choosing **Later** or closing the prompt does not cancel it: the app
automatically closes, installs and relaunches within six hours. Closing the app
earlier also installs the already-downloaded update. The deadline is checked
again after a sleeping computer resumes.

The client installer is per-user and can install silently. The central server
installer is per-machine; Windows may display its required UAC permission prompt
when installation begins. LabShield cannot bypass that OS security confirmation.

Verification is in `scripts/test-desktop-update.cjs`: prompt choice, ignored
deadline, repeat events, resume and the server/client installation modes.

## Follow-up — 10 September 2026: imaging is billing-only

Per the lab's clarified scope, X-ray, MRI, CT scan and USG/ultrasound services
do not need generated report formats. A shared browser/server policy now
identifies **279 active billing-only entries**, including imported spellings
such as `CTScan` and `CTPNS`. `CT (Clotting Time)` and image-guided specimen
examinations are not classified as billing-only scans.

These entries stay active in the billing catalogue with their existing prices.
The catalogue labels them “Billing only”; report-preview buttons are hidden,
and the full builder hides report-only controls while allowing billing edits.
New imaging entries no longer receive automatic result placeholders. Existing
parameters, notes, patient results and previously uploaded files are not deleted.

Imaging services are excluded from laboratory result entry, generated report
pages and pathology-finalization requirements. Sample and builder-preview
endpoints return a clear billing-only message. No existing report CSS or
pathology format is redesigned. Existing non-imaging workflow exclusions are
unchanged; this is not a broader change to histopathology or cardiology.

Both audit scripts now exclude billing-only services from missing-format counts.
The updated read-only content audit (`tmp/report-content/billing-only-audit.json`)
reports **907 active entries, 279 billing-only, 628 remaining review entries,
313 generic placeholders and 39 supplemented reports**. This is reclassification,
not repair of 279 reports. Other counts remain structural review indicators,
not clinical completeness checks.

Verification: **27 automated checks passed**, including original report styling,
bills retaining all four imaging types and prices, browser/server classification,
builder control visibility and preview/result endpoint guards against an isolated
in-memory database. Visual browser verification was unavailable in this session.
After restarting the local server, live sample endpoints for one X-ray, MRI,
CT and USG entry each returned the billing-only response; Abnormal Cells still
returned its complete preview, and the updated catalogue page was served.

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
