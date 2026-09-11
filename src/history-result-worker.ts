import {parentPort,workerData} from 'node:worker_threads';
import {HistoryStore,TokenHistory} from './token-history.js';

const input=workerData as {database:string;token:string};
const store=new HistoryStore(input.database);
const history=new TokenHistory(store,{profile:async()=>{throw new Error('Worker is read-only');},chunk:async()=>[]});
try{parentPort!.postMessage(history.result(input.token));}
finally{await history.close();}
