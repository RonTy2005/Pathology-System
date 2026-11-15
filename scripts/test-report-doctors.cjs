const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { buildReportHtml } = require('../src/utils/reportFormatter');
const { sampleReport } = require('./audit-report-content.cjs');
const { parseAdditionalReportDoctors, validateAdditionalReportDoctors, validateReportDoctorSignatureImage } = require('../src/services/reportDoctorService');
const image = 'data:image/png;base64,AAAA';

test('report doctors validate images and names without accepting malformed lists', () => {
  assert.deepEqual(validateAdditionalReportDoctors([{ name: ' Dr. Second ', qualification: 'MD', signatureDataUrl: image }]), [{ name: 'Dr. Second', qualification: 'MD', registrationNo: '', signatureDataUrl: image }]);
  for (const input of [null, {}, [null], [{name: ''}], [{name:'Doctor', signatureDataUrl:'https://example.invalid/image'}], Array(24).fill({name:'Doctor'})]) assert.throws(() => validateAdditionalReportDoctors(input), error => error.statusCode === 400);
  assert.throws(() => validateReportDoctorSignatureImage('data:image/png;base64,' + 'A'.repeat(3 * 1024 * 1024)), /2 MB/);
  assert.equal(validateReportDoctorSignatureImage(null), null);
  assert.deepEqual(parseAdditionalReportDoctors('invalid json'), []);
});

test('report signatures retain the original doctor and escape ordered additional doctors', () => {
  const data = { ...sampleReport({name:'Total Protein',parameters:[]}), reportDoctorName:'Original doctor', reportDoctorSignatureDataUrl:image, additionalReportDoctors:[
    {name:'Second <doctor>', qualification:'MD & Consultant', registrationNo:'ABC-2', signatureDataUrl:image},
    {name:'Third doctor', signatureDataUrl:'javascript:bad'},
  ] };
  const original = JSON.stringify(data);
  const html = buildReportHtml(data);
  const signatures = html.match(/<div class="signature-wrapper report-doctor-signature">([\s\S]*?)<\/div>\s*<\/div>/)?.[0];
  assert.ok(signatures);
  assert.ok(signatures.indexOf('Original doctor') < signatures.indexOf('Second &lt;doctor&gt;'));
  assert.ok(signatures.indexOf('Second &lt;doctor&gt;') < signatures.indexOf('Third doctor'));
  assert.match(signatures, /MD &amp; Consultant/);
  assert.match(signatures, /Regd. No. ABC-2/);
  assert.equal((signatures.match(/class="sig-image"/g)||[]).length, 2);
  assert.doesNotMatch(signatures, /javascript:/);
  assert.match(html, /\.report-doctor-signature \{ flex-wrap: wrap; gap: 8px; \}/);
  assert.equal(JSON.stringify(data), original);
  const single = buildReportHtml({...data,additionalReportDoctors:[]});
  const singleSignatures = single.match(/<div class="signature-wrapper report-doctor-signature">([\s\S]*?)<\/div>\s*<\/div>/)?.[0];
  assert.equal((singleSignatures.match(/<p class="doc-name">/g)||[]).length,1);
  assert.match(single,/Original doctor/);
});

test('all report previews and authenticated and QR report routes carry additional doctors', () => {
  for (const [file, count] of [['testRoutes.js',2],['patientPortalRoutes.js',2],['visitRoutes.js',1]]) {
    const source=fs.readFileSync(require.resolve('../src/routes/'+file),'utf8');
    assert.equal((source.match(/additionalReportDoctors: businessSettings.additionalReportDoctors/g)||[]).length,count);
  }
});

test('settings persist multiple doctors and legacy edits preserve them, with admin-only access', async () => {
  const connection=require('../src/db/connection');
  await connection.switchDatabasePath(':memory:');
  const {run,get,ensureColumn}=require('../src/db/helpers');
  const {getBusinessSettings,updateBusinessSettings}=require('../src/services/businessSettingsService');
  try {
    await run(`CREATE TABLE business_settings(id INTEGER PRIMARY KEY,business_name TEXT,facility_type TEXT,address TEXT,phone TEXT,email TEXT,registration_no TEXT,patient_portal_base_url TEXT,business_opening_time TEXT,business_closing_time TEXT,business_logo_data_url TEXT,report_doctor_name TEXT,report_doctor_qualification TEXT,report_doctor_registration_no TEXT,setup_completed INTEGER,letterhead_data_url TEXT,default_report_includes_letterhead INTEGER,report_doctor_signature_data_url TEXT,report_header_space_mm INTEGER,report_footer_space_mm INTEGER,updated_at TEXT)`);
    await run("INSERT INTO business_settings(id,business_name,report_doctor_name,report_doctor_signature_data_url) VALUES(1,'Lab','Legacy doctor',?)",[image]);
    await ensureColumn('business_settings','additional_report_doctors_json',"TEXT NOT NULL DEFAULT '[]'");
    await ensureColumn('business_settings','additional_report_doctors_json',"TEXT NOT NULL DEFAULT '[]'");
    const migrated=await getBusinessSettings({includeReportDoctorSignature:true});
    assert.equal(migrated.reportDoctorName,'Legacy doctor');
    assert.equal(migrated.reportDoctorSignatureDataUrl,image);
    assert.deepEqual(migrated.additionalReportDoctors,[]);
    const doctors=[{name:'Extra doctor',qualification:'MD',registrationNo:'2',signatureDataUrl:image}];
    await updateBusinessSettings('Lab',{additionalReportDoctors:doctors,updateAdditionalReportDoctors:true});
    await updateBusinessSettings('Lab',{reportDoctorName:'Changed first',reportDoctorQualification:'MD',reportDoctorRegistrationNo:'1',updateReportDoctorDetails:true});
    assert.deepEqual((await getBusinessSettings({includeReportDoctorSignature:true})).additionalReportDoctors,doctors);
    assert.equal((await getBusinessSettings()).additionalReportDoctors[0].signatureDataUrl,undefined);
    await run('CREATE TABLE logs(id INTEGER PRIMARY KEY,user_id INTEGER,action TEXT,entity_type TEXT,entity_id TEXT,meta TEXT,created_at TEXT)');
    const {settingsRouter}=require('../src/routes/settingsRoutes');
    const route=settingsRouter.stack.find(layer=>layer.route?.path==='/report-doctor-signature' && layer.route.methods.patch).route;
    async function patch(user,body){
      return new Promise((resolve,reject)=>{
        let index=1; // Authentication is separately tested; exercise actual role middleware and handler.
        const req={user,body};const res={statusCode:200,status(code){this.statusCode=code;return this},json(value){this.body=value;resolve(this);return this}};
        const next=error=>{if(error)return reject(error);const layer=route.stack[index++];Promise.resolve(layer.handle(req,res,next)).catch(reject)};next();
      });
    }
    const denied=await patch({id:2,role:'technician'},{additionalReportDoctors:[]});
    assert.equal(denied.statusCode,403);
    const saved=await patch({id:1,role:'admin'},{reportDoctorName:'Original updated',additionalReportDoctors:doctors});
    assert.equal(saved.body.reportDoctorSignatureDataUrl,image);
    assert.deepEqual(saved.body.additionalReportDoctors,doctors);
    await assert.rejects(patch({id:1,role:'admin'},{additionalReportDoctors:[{name:''}]}),error=>error.statusCode===400);
    assert.deepEqual((await getBusinessSettings({includeReportDoctorSignature:true})).additionalReportDoctors,doctors);
    await patch({id:1,role:'admin'},{additionalReportDoctors:[]});
    assert.deepEqual((await getBusinessSettings()).additionalReportDoctors,[]);
    assert.equal((await get('SELECT report_doctor_signature_data_url FROM business_settings')).report_doctor_signature_data_url,image);
  } finally {await connection.closeDatabase();}
});

test('doctor editor retains unsaved changes while adding, switching, removing and saving', async () => {
  const source=fs.readFileSync(require.resolve('../frontend/scripts/admin.js'),'utf8');
  const editor=source.slice(source.indexOf('function captureActiveReportDoctor()'),source.indexOf('async function selectReportDoctorSignatureFile()'));
  const save=source.slice(source.indexOf('async function saveReportDoctorSignature('),source.indexOf('function openLetterheadPreview()'));
  const input=()=>({value:'',focus(){}});
  let saved;
  const scope={
    reportDoctorsDraft:[],activeReportDoctorIndex:0,reportDoctorEditorBusy:false,
    reportDoctorSignatureDataUrl:null,reportDoctorSignatureHasPendingChange:false,reportDoctorSignatureSourceImage:null,
    reportDoctorNameInput:input(),reportDoctorQualificationInput:input(),reportDoctorRegistrationNoInput:input(),reportDoctorSignatureFileInput:input(),
    reportDoctorsList:{innerHTML:''},addReportDoctorBtn:{},reportDoctorEditorHeading:{},reportDoctorSignatureForm:{querySelector:()=>null},
    removeReportDoctorSignatureBtn:{},resetReportDoctorSignatureAdjustmentsBtn:{},reportDoctorSignatureControls:()=>[],
    escapeHtml:value=>String(value).replaceAll('<','&lt;'),showMessage(){},renderReportDoctorSignaturePreview(){},setReportDoctorSignatureSource:async()=>{},window:{confirm:()=>true},
    API:{request:async(url,options)=>{if(options){saved=JSON.parse(options.body);return saved}return {reportDoctorName:'Legacy doctor',reportDoctorSignatureDataUrl:image,additionalReportDoctors:[]}}},
  };
  vm.createContext(scope);vm.runInContext(editor+'\n'+save,scope);
  await scope.loadReportDoctorSignatureSettings();
  scope.reportDoctorNameInput.value='Edited first';
  await scope.addReportDoctor();
  assert.equal(scope.reportDoctorsDraft[0].name,'Edited first');
  scope.reportDoctorNameInput.value='Second doctor';scope.reportDoctorSignatureDataUrl=image;
  await scope.editReportDoctor(0);
  assert.equal(scope.reportDoctorsDraft[1].name,'Second doctor');
  assert.equal(scope.reportDoctorSignatureDataUrl,image);
  await scope.saveReportDoctorSignature({preventDefault(){}});
  assert.equal(saved.reportDoctorName,'Edited first');
  assert.equal(saved.additionalReportDoctors[0].name,'Second doctor');
  assert.equal(saved.additionalReportDoctors[0].signatureDataUrl,image);
  await scope.editReportDoctor(1);await scope.removeAdditionalReportDoctor(1);
  assert.equal(scope.reportDoctorsDraft.length,1);
  assert.equal(scope.reportDoctorNameInput.value,'Edited first');
  await scope.saveReportDoctorSignature({preventDefault(){}});
  assert.deepEqual(saved.additionalReportDoctors,[]);
});
