// Reviewed additive upgrades only. Default status performs no writes or provider changes.
import {config,sql,file,grantRuntime} from './db.mjs';
const cfg=config(),command=process.argv[2]??'status';
for(const [name,migration,column] of [['media','16_media_core.sql','pipeline_version'],['catalog','17_catalog_media_core.sql','security_blocked']]) {
  const installed=sql(cfg,name,`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='${name}' AND column_name='${column}')`)==='t';
  if(command==='apply') {
    if(process.argv[3]!=='--reviewed')throw new Error('Apply requires --reviewed; authorize the target and take coordinated database/object backups first.');
    if(!installed){file(cfg,name,'sql/'+migration,{owner:true,atomic:true});grantRuntime(cfg,name);}
    console.log(name+': B5 additive migration applied/already installed.');
  }else if(command==='status')console.log(name+': B5 migration '+(installed?'installed':'pending'));
  else throw new Error('Use status or apply --reviewed.');
}
