import { encode } from './types.js';
import { startObserver } from './observer-server.js';
import { PonsDiscovery, rpcReader } from './chain/discovery.js';
import {RadarStore} from './radar/store.js';
import {RadarIndexer} from './radar/indexer.js';
import {marketReader} from './radar/market.js';
import {radarReader} from './radar/reader.js';

const radarOptions=()=>({rangeBlocks:BigInt(process.env.MEERKAT_RADAR_RANGE_BLOCKS??2000),pollMs:Number(process.env.MEERKAT_RADAR_POLL_MS??30000),profileConcurrency:Number(process.env.MEERKAT_RADAR_PROFILE_CONCURRENCY??4),profileBatchSize:Number(process.env.MEERKAT_RADAR_PROFILE_BATCH_SIZE??40),viewRefreshMs:Number(process.env.MEERKAT_RADAR_VIEW_REFRESH_MS??300000),historyStartBlock:BigInt(process.env.MEERKAT_RADAR_START_BLOCK??0)});

if (process.argv[2] === 'demo') {
  const {runDemo}=await import('./demo.js');
  console.log(encode(await runDemo()));
} else if (process.argv[2] === 'market') {
  const snapshot = await new PonsDiscovery(rpcReader()).refresh();
  console.log(encode(snapshot)); if (snapshot.status !== 'connected') process.exitCode = 1;
} else if (process.argv[2] === 'serve') {
  const port=Number(process.env.PORT??4664);if(!Number.isInteger(port)||port<0||port>65535)throw new Error('PORT must be an integer from 0 to 65535');
  const publicMode=process.env.MEERKAT_PUBLIC==='1';
  const app = await startObserver({port,database:process.env.MEERKAT_DB??'data/observer.sqlite',publicMode,publicOrigin:publicMode?process.env.MEERKAT_PUBLIC_ORIGIN:undefined,trustedHosts:publicMode?(process.env.MEERKAT_TRUSTED_HOSTS??'').split(',').map(value=>value.trim()).filter(Boolean):undefined,radarAutoStart:process.env.MEERKAT_RADAR!=='0'});
  console.log(`MEERKAT market watch: ${app.url}`);
  const stop = () => { void app.close().then(() => process.exit(0)); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
} else if(['radar-index','radar-collect','radar-enrich','radar-project'].includes(process.argv[2]??'')){
  const store=new RadarStore(process.env.MEERKAT_DB??'data/observer.sqlite'),indexer=new RadarIndexer(store,radarReader(process.argv[2]==='radar-enrich'&&process.env.MEERKAT_ENRICH_RPC_URLS?process.env.MEERKAT_ENRICH_RPC_URLS.split(',').map(value=>value.trim()).filter(Boolean):undefined),{...radarOptions(),profileBatchSize:Number(process.env.MEERKAT_RADAR_PROFILE_BATCH_SIZE??(process.argv[2]==='radar-enrich'?20:40)),profileConcurrency:Number(process.env.MEERKAT_RADAR_PROFILE_CONCURRENCY??(process.argv[2]==='radar-enrich'?2:4)),marketRead:marketReader(),mode:process.argv[2]==='radar-collect'?'collect':process.argv[2]==='radar-enrich'?'enrich':process.argv[2]==='radar-project'?'project':'combined',pollMs:process.argv[2]==='radar-project'?5000:process.argv[2]==='radar-enrich'?30000:radarOptions().pollMs});indexer.start();console.log('MEERKAT Radar indexer started');
  const stop=()=>{void indexer.close().then(()=>{store.close();process.exit(0);});};process.once('SIGINT',stop);process.once('SIGTERM',stop);
} else {
  console.error('Usage: meerkat demo | serve | market | radar-index | radar-collect | radar-enrich | radar-project');
  process.exitCode = 1;
}
