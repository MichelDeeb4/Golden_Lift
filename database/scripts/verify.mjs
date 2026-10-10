import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql, env, file, test, grantRuntime } from './db.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const pgBin=process.env.PG_BIN || 'C:/Program Files/PostgreSQL/18/bin';
const psql=path.join(pgBin,process.platform==='win32'?'psql.exe':'psql');
function assert(ok,msg) { if(!ok)throw new Error('TEST FAILED: '+msg); }
function client(cfg,service,label) {
  const child=spawn(psql,['-X','-w','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],{
    windowsHide:true,env:{...env(cfg,service,true),PGAPPNAME:label},stdio:['pipe','pipe','pipe']});
  let output='',error='';
  child.stdout.on('data',chunk=>output+=chunk.toString());
  child.stderr.on('data',chunk=>error+=chunk.toString());
  const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>resolve({code,output,error}));});
  return { child, done, write:s=>child.stdin.write(s+'\n'), end:s=>child.stdin.end(s+'\n'),
    async wait(marker) {
      const limit=Date.now()+10000;
      while(!output.includes(marker)) {
        if(child.exitCode!==null || Date.now()>limit) throw new Error(`Session ${label} failed to reach ${marker}: ${error}`);
        await new Promise(resolve=>setTimeout(resolve,25));
      }
    }
  };
}
async function conflict(cfg,aMutation,bMutation,staleRetry) {
  const a=client(cfg,'catalog','business_platform_test_a');
  const b=client(cfg,'catalog','business_platform_test_b');
  try {
    a.write(`BEGIN ISOLATION LEVEL SERIALIZABLE; ${aMutation}\n\\echo A_LOCKED`);
    await a.wait('A_LOCKED');
    b.write('BEGIN ISOLATION LEVEL SERIALIZABLE; SELECT count(*) FROM catalog.categories;\n\\echo B_SNAPSHOT');
    await b.wait('B_SNAPSHOT');
    b.end(bMutation+' COMMIT;');
    // Observe actual contention, rather than treating sequential calls as a concurrency test.
    let blocked=false;
    for(let i=0;i<100;i++) {
      if(sql(cfg,'catalog',"SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='business_platform_test_b' AND wait_event_type='Lock')")==='t') {blocked=true;break;}
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert(blocked,'second independent connection waited on the Catalog write gate');
    a.end('COMMIT;');
    const [ar,br]=await Promise.all([a.done,b.done]);
    assert(ar.code===0,'first writer commits: '+ar.error);
    assert(br.code!==0 && br.error.includes('40001'),'waiting writer must retry serialization failure: '+br.error);
    if(staleRetry) {
      const count=sql(cfg,'catalog','BEGIN ISOLATION LEVEL SERIALIZABLE; '+staleRetry+' COMMIT;',true);
      assert(count.split(/\r?\n/).includes('0'),'stale expected version updates zero rows');
    } else {
      const retry=client(cfg,'catalog','business_platform_test_retry');
      retry.end('BEGIN ISOLATION LEVEL SERIALIZABLE; '+bMutation+' COMMIT;');
      const rr=await retry.done;
      assert(rr.code!==0 && rr.error.includes('23514'),'retried incompatible operation is rejected: '+rr.error);
    }
  } finally {
    if(a.child.exitCode===null)a.child.kill();
    if(b.child.exitCode===null)b.child.kill();
  }
}
async function concurrency(cfg) {
  const dynamic=sql(cfg,'catalog',"SELECT to_regprocedure('catalog.assert_valid_dynamic_catalog()') IS NOT NULL")==='t';
  sql(cfg,'catalog',`BEGIN ISOLATION LEVEL SERIALIZABLE;
    ${dynamic?"INSERT INTO catalog.product_types(id,code) VALUES('df000000-0000-4000-8000-000000000001','synthetic-concurrency-type'); INSERT INTO catalog.product_type_translations(product_type_id,locale,name) VALUES('df000000-0000-4000-8000-000000000001','ar','Synthetic concurrency type');":''}
    INSERT INTO catalog.categories(id) VALUES('d1000000-0000-4000-8000-000000000001'),('d1000000-0000-4000-8000-000000000002'),('d1000000-0000-4000-8000-000000000003');
    INSERT INTO catalog.category_translations(category_id,locale,name) SELECT id,'ar','Synthetic concurrency root' FROM catalog.categories;
    INSERT INTO catalog.media_asset_refs(id,media_kind,source_version,ready_at) VALUES('d2000000-0000-4000-8000-000000000001','IMAGE',1,clock_timestamp()),('d2000000-0000-4000-8000-000000000002','IMAGE',1,clock_timestamp());
    COMMIT;`,true);
  await conflict(cfg,
    `INSERT INTO catalog.categories(id,parent_id) VALUES('d1000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001');
     INSERT INTO catalog.category_translations(category_id,locale,name) VALUES('d1000000-0000-4000-8000-000000000004','ar','Synthetic child');`,
    `INSERT INTO catalog.products(id,category_id,cover_media_id${dynamic?',product_type_id':''}) VALUES('d3000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001'${dynamic?",'df000000-0000-4000-8000-000000000001'":''});
     INSERT INTO catalog.product_translations(product_id,locale,name) VALUES('d3000000-0000-4000-8000-000000000001','ar','Synthetic concurrent product');
     INSERT INTO catalog.product_media(id,product_id,asset_id) VALUES('d4000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001');`);
  console.log('PASS two connections: child creation versus product creation, with serialization retry.');
  const edit=`WITH edited AS (UPDATE catalog.categories SET sort_order=2048 WHERE id='d1000000-0000-4000-8000-000000000002' AND version=1 RETURNING id) SELECT count(*) FROM edited;`;
  await conflict(cfg,edit,edit,edit);
  console.log('PASS two connections: expected-version edits reject stale retry.');
  await conflict(cfg,`SELECT catalog.retire_media_asset('d2000000-0000-4000-8000-000000000002','IMAGE',1);`,
    `UPDATE catalog.categories SET cover_asset_id='d2000000-0000-4000-8000-000000000002' WHERE id='d1000000-0000-4000-8000-000000000003';`);
  console.log('PASS two connections: retirement versus new attachment.');
  sql(cfg,'media',`INSERT INTO media.assets(id,media_kind,original_name,storage_bucket,storage_key) VALUES('d5000000-0000-4000-8000-000000000001','IMAGE','synthetic.jpg','synthetic','synthetic');
    INSERT INTO media.processing_jobs(id,asset_id,job_type) VALUES('d6000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','VALIDATE');`,true);
  const claim=`WITH picked AS (SELECT id FROM media.processing_jobs WHERE status='QUEUED' AND deleted_at IS NULL ORDER BY next_attempt_at,id LIMIT 1 FOR UPDATE SKIP LOCKED)
    UPDATE media.processing_jobs j SET status='RUNNING',locked_until=clock_timestamp()+interval '1 minute',lease_token=gen_random_uuid() FROM picked p WHERE j.id=p.id RETURNING j.id;`;
  const a=client(cfg,'media','business_platform_worker_a');
  const b=client(cfg,'media','business_platform_worker_b');
  try {
    a.write('BEGIN; '+claim+'\n\\echo WORKER_LOCKED'); await a.wait('WORKER_LOCKED');
    b.end('BEGIN; '+claim+' COMMIT;'); const br=await b.done;
    assert(br.code===0 && !br.output.includes('d6000000'),'second worker skips already claimed job');
    a.end('COMMIT;'); const ar=await a.done; assert(ar.code===0,'first worker commits claim');
  } finally { if(a.child.exitCode===null)a.child.kill(); if(b.child.exitCode===null)b.child.kill(); }
  console.log('PASS two connections: SKIP LOCKED worker claims do not duplicate jobs.');
}
export async function verifyFresh(cfg, { reportPath = path.join(root,'database/validation-report.json'), catalogProfile='v1.1' } = {}) {
  assert(['v1.1','v1.2'].includes(catalogProfile),'explicit supported Catalog verification profile');
  const targetReport=path.resolve(reportPath);
  assert(targetReport.startsWith(root+path.sep) && targetReport.endsWith('.json'),'verification report must stay inside the project');
  const suffix=crypto.randomBytes(4).toString('hex');
  const scratch=structuredClone(cfg);
  const created=[];
  const fingerprint=(connections,service)=>{
    const r=spawnSync(path.join(pgBin,process.platform==='win32'?'pg_dump.exe':'pg_dump'),
      ['--schema-only','--no-owner','--no-privileges','--no-comments','--schema='+service,'--schema=ops'],
      {windowsHide:true,encoding:'utf8',env:env(connections,service),maxBuffer:8*1024*1024});
    if(r.status!==0)throw new Error('Schema comparison failed: '+r.stderr);
    return r.stdout.replace(/^\\(?:un)?restrict .*$/gm,'').replace(/\r/g,'');
  };
  try {
    const catalogMedia=sql(cfg,'catalog',"SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='catalog' AND column_name='security_blocked')")==='t';
    const mediaCore=sql(cfg,'media',"SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='media' AND column_name='pipeline_version')")==='t';
    for(const [name,entry] of Object.entries({identity:'01_identity.sql',catalog:catalogProfile==='v1.2'?(catalogMedia?'19_catalog_media_core_fresh.sql':'15_catalog_dynamic.sql'):(catalogMedia?'20_catalog_media_legacy_fresh.sql':'02_catalog.sql'),media:mediaCore?'18_media_core_fresh.sql':'03_media.sql',inquiries:'04_inquiries.sql'})) {
      const s=scratch.services[name];
      s.database=`business_platform_test_${suffix}_${name}`;
      sql(cfg,null,`CREATE DATABASE ${s.database} OWNER ${s.owner} TEMPLATE template0 ENCODING 'UTF8'`);
      created.push(s.database);
      file(scratch,name,'sql/'+entry,{owner:true,atomic:true});
      grantRuntime(scratch,name);
      console.log(`PASS fresh installation: ${name}`);
      assert(fingerprint(cfg,name)===fingerprint(scratch,name),'installed '+name+' schema matches a fresh installation');
    }
    test(scratch);
    await concurrency(scratch);
    // Confirm actual server CONNECT isolation for every pair of service roles.
    for(const name of Object.keys(scratch.services)) for(const other of Object.keys(scratch.services)) {
      if(name===other)continue;
      const denial=client({...scratch,services:{...scratch.services,[other]:{...scratch.services[other],user:scratch.services[name].user,password:scratch.services[name].password}}},other,'business_platform_isolation');
      denial.end('SELECT 1;');
      const result=await denial.done;
      assert(result.code!==0 && (result.error.includes('42501') || result.error.includes('permission denied for database')),'cross-database CONNECT must be denied: '+result.error);
    }
    console.log('PASS service isolation: all 12 cross-database connection attempts denied.');
    // Independently verify the additive migration against the original v1.0 Catalog.
    const upgrade=structuredClone(scratch);
    upgrade.services.catalog.database=`business_platform_test_${suffix}_upgrade`;
    const u=upgrade.services.catalog;
    sql(cfg,null,`CREATE DATABASE ${u.database} OWNER ${u.owner} TEMPLATE template0 ENCODING 'UTF8'`);
    created.push(u.database);
    file(upgrade,'catalog','tests/fixtures/v1.0/02_catalog.sql',{owner:true});
    file(upgrade,'catalog','sql/06_smoke_test.sql');
    file(upgrade,'catalog','sql/09_technical_sheets.sql',{owner:true,atomic:true});
    if(catalogProfile==='v1.2'){
      file(upgrade,'catalog','sql/13_dynamic_catalog_expand.sql',{owner:true,atomic:true});
      file(upgrade,'catalog','sql/14_dynamic_catalog_cutover.sql',{owner:true,atomic:true});
    }
    if(catalogMedia)file(upgrade,'catalog','sql/17_catalog_media_core.sql',{owner:true,atomic:true});
    assert(fingerprint(upgrade,'catalog')===fingerprint(scratch,'catalog'),'v1.0 upgrade matches fresh '+catalogProfile+' Catalog');
    file(upgrade,'catalog',catalogProfile==='v1.2'?'tests/dynamic-technical.sql':'tests/technical.sql');
    console.log(`PASS v1.0 to ${catalogProfile} additive Catalog migration, schema parity and technical tests.`);
    const report={postgres:sql(cfg,null,'SHOW server_version'),schemaVersion:catalogProfile.slice(1),suites:7,freshDatabases:4,installedSchemaParity:true,upgradeFromV1:true,concurrencyScenarios:4,crossDatabaseDenials:12,result:'passed'};
    fs.mkdirSync(path.dirname(targetReport),{recursive:true});
    fs.writeFileSync(targetReport,JSON.stringify({...report,checkedAt:new Date().toISOString()},null,2)+'\n');
  } finally {
    // Delete only unique disposable databases created by this verification run, never application databases.
    for(const database of created.reverse()) {
      assert(database.startsWith(`business_platform_test_${suffix}_`),'test cleanup namespace');
      sql(cfg,null,`DROP DATABASE ${database}`);
    }
  }
}
