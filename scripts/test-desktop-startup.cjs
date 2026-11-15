const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ensureScheduledStartup } = require('../desktop/scheduledStartup');
const { ensureAutomaticStartup } = require('../desktop/automaticStartup');

test('server and client sign-in tasks use hidden non-blocking registration and safely separated path arguments', async () => {
  for(const appMode of ['server','client']) {
    let command;
    const executablePath = `C:\\Lab's & Diagnostic Centre\\${appMode}\\LabShield.exe`;
    const result=await ensureScheduledStartup({app:{isPackaged:true},platform:'win32',appMode,executablePath,runCommand:(file,args,options,callback)=>{
      command={file,args,options};callback(null,JSON.stringify({configured:true,taskName:`LabShield-${appMode}`,lastTaskResult:0}));
    }});
    assert.equal(result.configured,true);
    assert.ok(command.file.endsWith('powershell.exe'));
    assert.equal(command.args[command.args.indexOf('-ExecutablePath')+1],executablePath);
    assert.equal(command.args[command.args.indexOf('-AppMode')+1],appMode);
    assert.equal(command.args[command.args.indexOf('-WindowStyle')+1],'Hidden');
    assert.equal(command.options.windowsHide,true);
    assert.equal(command.options.timeout,15000);
    assert.equal(command.options.shell,undefined);
  }
});

test('a denied, timed out or unconfirmed startup task is not reported as registered', async () => {
  for(const [error,stdout] of [[new Error('Access denied'),''],[new Error('timeout'),''],[null,'bad output'],[null,'{"configured":false,"error":"Task blocked"}']]) {
    const warnings=[];
    const result=await ensureScheduledStartup({app:{isPackaged:true},platform:'win32',logger:{warn:(...args)=>warnings.push(args)},runCommand:(_file,_args,_options,callback)=>callback(error,stdout)});
    assert.equal(result.configured,false);assert.ok(result.error);assert.equal(warnings.length,1);
  }
});

test('development and non-Windows launches never register scheduled tasks', async () => {
  const runCommand=()=>{throw new Error('Must not touch Windows startup')};
  for(const [app,platform] of [[{isPackaged:false},'win32'],[{isPackaged:true},'linux'],[null,'win32']]){
    const result=await ensureScheduledStartup({app,platform,runCommand});assert.equal(result.reason,'not-packaged-windows');
  }
});

test('stale Startup shortcuts with the wrong working directory are repaired', () => {
  const executablePath='C:\\Program Files\\LabShield\\LabShield.exe';const writes=[];
  const result=ensureAutomaticStartup({app:{isPackaged:true,getPath:()=> 'C:\\Users\\Lab\\AppData\\Roaming',setLoginItemSettings(){},getLoginItemSettings:options=>{assert.deepEqual(options.args,['--autostart']);return {openAtLogin:true}}},
    platform:'win32',executablePath,pathModule:path.win32,fileSystem:{mkdirSync(){}},shell:{readShortcutLink:()=>({target:executablePath,args:'--autostart',cwd:'C:\\Windows\\System32'}),writeShortcutLink:(...args)=>{writes.push(args);return true}}});
  assert.equal(result.shortcutConfigured,true);assert.equal(writes.length,1);assert.equal(writes[0][2].cwd,path.win32.dirname(executablePath));
});

test('startup task is interactive, per-user and independent of batteries, network or idle state', () => {
  const script=fs.readFileSync(path.resolve(__dirname,'../desktop/startupTask.ps1'),'utf8');
  assert.match(script,/WindowsIdentity\]::GetCurrent\(\)\.User\.Value/);
  assert.match(script,/Principal\.LogonType = 3/);assert.match(script,/Principal\.RunLevel = 0/);
  assert.match(script,/Triggers\.Create\(9\)/);assert.match(script,/trigger\.UserId = \$currentSid/);
  assert.match(script,/trigger\.Delay = 'PT15S'/);
  for(const name of ['DisallowStartIfOnBatteries','StopIfGoingOnBatteries','RunOnlyIfNetworkAvailable','RunOnlyIfIdle'])assert.ok(script.includes(`Settings.${name} = $false`));
  assert.match(script,/ExecutionTimeLimit = 'PT0S'/);assert.match(script,/RestartCount = 3/);
  assert.match(script,/action\.Arguments = '--autostart'/);assert.match(script,/action\.WorkingDirectory = \[IO.Path\]::GetDirectoryName\(\$expectedPath\)/);
  assert.match(script,/if \(-not \$valid\) \{ throw/);
  assert.match(script,/\$action\.Type -eq 0 -and \[IO.Path\]::GetFullPath\(\$action\.Path\) -eq \$expectedPath/);
  assert.doesNotMatch(script,/RunLevel = 1|Principal\.UserId = ['"]SYSTEM|Register-ScheduledTask/);
  const main=fs.readFileSync(path.resolve(__dirname,'../desktop/main.js'),'utf8');
  assert.ok(main.indexOf('void ensureScheduledStartup({ app, appMode })') > main.indexOf('await mainWindow.loadFile(path.join(__dirname, appMode'));
  assert.match(main,/startup-status\.json/);
  for(const file of ['client-startup.nsh','server-firewall.nsh']){
    const installer=fs.readFileSync(path.resolve(__dirname,'../desktop/installer',file),'utf8');
    assert.match(installer,/CreateShortCut "\$SMSTARTUP\\LabShield/);assert.match(installer,/-Mode Remove -ExecutablePath/);
  }
});

test('Windows validates the actual scheduled task definition without registering or launching anything', {skip:process.platform!=='win32'}, () => {
  const stdout=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',path.resolve(__dirname,'../desktop/startupTask.ps1'),'-Mode','Validate','-ExecutablePath',process.execPath,'-AppMode','client'],{encoding:'utf8',windowsHide:true,timeout:15000});
  assert.equal(JSON.parse(stdout.trim()).validated,true);
});
