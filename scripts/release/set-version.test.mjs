import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("version setter updates only release identities in an isolated checkout fixture", async () => {
 const root=await mkdtemp(join(tmpdir(),'zilobase-version-test-'));
 const jsonFiles=['package.json','apps/web/package.json','apps/server/package.json','apps/desktop/package.json'];
 const write=async(file,body)=>{await mkdir(dirname(join(root,file)),{recursive:true});await writeFile(join(root,file),body);};
 try {
  for(const file of jsonFiles)await write(file,JSON.stringify({version:'0.0.1',keep:'unchanged'}));
  await write('apps/desktop/src-tauri/Cargo.toml','[package]\nname = "zilobase-client"\nversion = "0.0.1"\n');
  await write('apps/desktop/electron/sidecar/Cargo.toml','[package]\nname = "zilobase-desktop-sidecar"\nversion = "0.0.1"\n');
  await write('apps/desktop/src-tauri/tauri.conf.json',JSON.stringify({version:'0.0.1',productName:'Zilobase'}));
  await write('apps/server/src/shared/version.ts','export const SERVER_VERSION = "0.0.1";\n');
  await write('apps/desktop/src-tauri/Cargo.lock','[[package]]\nname = "zilobase-client"\nversion = "0.0.1"\n\n[[package]]\nname = "other"\nversion = "9.0.0"\n');
  await write('apps/desktop/electron/sidecar/Cargo.lock','[[package]]\nname = "zilobase-desktop-sidecar"\nversion = "0.0.1"\n\n[[package]]\nname = "other"\nversion = "9.0.0"\n');
  const lock={version:'0.0.1',packages:Object.fromEntries(['','apps/web','apps/server','apps/desktop','node_modules/other'].map(path=>[path,{version:path==='node_modules/other'?'9.0.0':'0.0.1'}]))};
  await write('package-lock.json',JSON.stringify(lock));
  const script=fileURLToPath(new URL('./set-version.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[script,'1.2.3-beta.1'],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  for(const file of jsonFiles)assert.deepEqual(JSON.parse(await readFile(join(root,file),'utf8')),{version:'1.2.3-beta.1',keep:'unchanged'});
  assert.match(await readFile(join(root,'apps/server/src/shared/version.ts'),'utf8'),/SERVER_VERSION = "1.2.3-beta.1"/);
  const updatedLock=JSON.parse(await readFile(join(root,'package-lock.json'),'utf8'));
  assert.equal(updatedLock.packages['apps/web'].version,'1.2.3-beta.1');
  assert.equal(updatedLock.packages['node_modules/other'].version,'9.0.0');
  assert.match(await readFile(join(root,'apps/desktop/src-tauri/Cargo.lock'),'utf8'),/name = "other"\nversion = "9.0.0"/);
  assert.match(await readFile(join(root,'apps/desktop/electron/sidecar/Cargo.toml'),'utf8'),/version = "1.2.3-beta.1"/);
  assert.match(await readFile(join(root,'apps/desktop/electron/sidecar/Cargo.lock'),'utf8'),/name = "zilobase-desktop-sidecar"\nversion = "1.2.3-beta.1"/);
  assert.match(await readFile(join(root,'apps/desktop/electron/sidecar/Cargo.lock'),'utf8'),/name = "other"\nversion = "9.0.0"/);
  const invalid=spawnSync(process.execPath,[script,'invalid'],{cwd:root,encoding:'utf8'});assert.equal(invalid.status,1);
  assert.equal(JSON.parse(await readFile(join(root,'package.json'),'utf8')).version,'1.2.3-beta.1');
 } finally {await rm(root,{recursive:true,force:true});}
});
