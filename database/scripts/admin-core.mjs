// Explicit reviewed Catalog upgrade; status is read-only. Uses only the Catalog owning role.
import { config, sql, file, grantRuntime } from './db.mjs';
const cfg=config(),command=process.argv[2]??'status';
const installed=sql(cfg,'catalog',"SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='catalog' AND table_name='products' AND column_name='is_active')")==='t';
if(command==='status')console.log('Catalog Admin publication migration '+(installed?'installed':'pending')+'.');
else if(command==='apply'){
  if(process.argv[3]!=='--reviewed')throw new Error('Apply requires --reviewed after reviewing the target and coordinated backup.');
  if(!installed){file(cfg,'catalog','sql/21_catalog_product_management.sql',{owner:true,atomic:true});grantRuntime(cfg,'catalog');}
  console.log('Catalog Admin publication migration applied/already installed.');
}else throw new Error('Use status or apply --reviewed.');
