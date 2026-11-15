const assert = require('node:assert/strict');
const { app, BrowserWindow } = require('electron');
const { buildReportHtml } = require('../src/utils/reportFormatter');
const { sampleReport } = require('./audit-report-content.cjs');
app.on('window-all-closed', () => {});
const signature = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="65"><path d="M10 45 L50 10 L75 50 L180 20" fill="none" stroke="black" stroke-width="3"/></svg>').toString('base64');
(async () => {
  await app.whenReady();
  const window = new BrowserWindow({show:false,width:1100,height:1200,webPreferences:{sandbox:true,backgroundThrottling:false}});
  try {
    for (const {count, long} of [{count:2},{count:6},{count:6,long:true}]) {
      const entry = long ? {name:'QA LONG REPORT',parameters:Array.from({length:130},(_,i)=>({parameter_name:`QA analyte ${i+1}`,value:String(i+1),unit:'QA'}))} : {name:'Total Protein',parameters:[{parameter_name:'Total Protein, Serum',value:'7.2',unit:'g/dL'}]};
      const data = {...sampleReport(entry),reportDoctorName:'Doctor 1',reportDoctorSignatureDataUrl:signature,
        additionalReportDoctors:Array.from({length:count-1},(_,i)=>({name:`Doctor ${i+2}`,qualification:'MD (Pathology)',registrationNo:`QA-${i+2}`,signatureDataUrl:signature}))};
      await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(buildReportHtml(data)));
      const result=await window.webContents.executeJavaScript(`(async()=>{
        await window.__labReportPaginationPromise;
        return Array.from(document.querySelectorAll('.report-generated-page .report-doctor-signature .signature-section')).map(e=>{
          const r=e.getBoundingClientRect();const p=e.closest('.report-generated-page').getBoundingClientRect();return {name:e.textContent.trim(),x:r.x,y:r.y,width:r.width,height:r.height,pageBottom:p.bottom};
        });
      })()`);
      assert.equal(result.length,count);
      assert.equal(result[0].y,result[1].y,'First two doctors must appear beside each other');
      assert.ok(result[1].x >= result[0].x + result[0].width);
      if(count===6) assert.ok(result[5].y > result[0].y,'Additional doctors should wrap, not overflow horizontally');
      assert.ok(result.every(r=>r.y+r.height <= r.pageBottom),'Doctor signatures must not be clipped at the page bottom');
      const pageCount=await window.webContents.executeJavaScript("document.querySelectorAll('.report-generated-page').length");
      if(long)assert.ok(pageCount>1);
      console.log(JSON.stringify({doctors:count,long:Boolean(long),pageCount,sideBySide:true,positions:result}));
    }
  } finally {window.destroy();app.quit();}
})().catch(error=>{console.error(error);app.exit(1)});
