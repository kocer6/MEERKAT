import { encode } from './types.js';
import { startObserver } from './observer-server.js';
import { PonsDiscovery, rpcReader } from './chain/discovery.js';

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
} else {
  console.error('Usage: meerkat demo | serve | market');
  process.exitCode = 1;
}
