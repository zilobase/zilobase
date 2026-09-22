import { build } from "esbuild";
import { createRequire } from "node:module";

export function register({ assert, appPath, test }) {
  test("workspace settings validate drafts and keep mail disconnect cleanup scoped and ordered", async () => {
    const result = await build({stdin:{contents:`
      import {createElement} from "react";
      import {renderToString} from "react-dom/server";
      import {useWorkspaceDetails} from "./src/features/workspaces/settings/workspace-details-state";
      import {useWorkspaceMailConnection} from "./src/features/workspaces/settings/workspace-mail-connection-state";
      import {runtime} from "settings-test-runtime";
      export function capture(kind,input,dependencies,draft) {
        Object.assign(runtime,dependencies);
        let controls,seeded=false,submitted=false;
        function Probe() {
          controls=kind==='details' ? useWorkspaceDetails(input) : useWorkspaceMailConnection(input);
          if(draft && !seeded) {
            seeded=true;
            controls.setName(draft.name); controls.setSlug(draft.slug);
            controls.setLogo(draft.logo); controls.setMetadata(draft.metadata);
          } else if(draft && !submitted) {
            submitted=true; controls.saveWorkspace({preventDefault(){}});
          }
          return null;
        }
        renderToString(createElement(Probe)); return controls;
      }
    `,resolveDir:appPath('/'),sourcefile:'settings-test-entry.ts'},bundle:true,write:false,platform:'node',format:'cjs',logLevel:'silent',plugins:[{name:'controlled-settings',setup(build){
      const sources={
        'settings-test-runtime':'export const runtime={};',
        'sonner':'export const toast=Object.fromEntries(["success","error","info"].map(kind=>[kind,value=>runtime.calls.push([kind,value])]));',
        '@zilobase/features/workspaces/react':'export const useUpdateWorkspace=()=>runtime.update;',
        '@zilobase/features/auth/react':'export const useSession=()=>({data:runtime.session});',
        '@tanstack/react-query':'export const useQuery=()=>runtime.query;',
        '@/platform/desktop/native':'export const invoke=(...args)=>runtime.invoke(...args);',
        '@zilobase/features/mail':'export const mailApiBasePath=id=>`/workspaces/${id}/mail`; export const mailConnectionQueryOptions=()=>({});',
        '@/platform/network/api':'export const apiFetch=(...args)=>runtime.fetch(...args); export const getApiErrorMessage=error=>error.message; export const toApiUrl=()=>"https://api.example.test/";',
        '@/platform/environment':'export const isDesktopApp=()=>runtime.desktop;',
        '@/features/mail/storage/mail-database':'export const mailDatabaseName=input=>JSON.stringify(input); export const destroyMailDatabase=name=>runtime.destroy(name);',
      };
      build.onResolve({filter:/.*/},args=>Object.hasOwn(sources,args.path)?{path:args.path,namespace:'settings-test'}:undefined);
      build.onLoad({filter:/.*/,namespace:'settings-test'},({path})=>({contents:(path==='settings-test-runtime'?'':'import {runtime} from "settings-test-runtime";')+sources[path],loader:'ts'}));
    }}]});
    const module={exports:{}};
    new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
    const calls=[];
    const dependencies={calls,desktop:false,session:{user:{id:'user'}},update:{isPending:false,mutate(input,options){calls.push(['update',input]);options.onSuccess();}},query:{data:{status:'connected',connectionId:'connection',bindingId:'binding'},async refetch(){calls.push(['refetch']);}},async fetch(path,options){calls.push(['fetch',path,options]);return {authorizationUrl:'https://provider.example.test/auth'};},async invoke(...args){calls.push(['invoke',...args]);},async destroy(name){calls.push(['destroy',JSON.parse(name)]);}};
    const capture=(kind,input,draft)=>module.exports.capture(kind,input,dependencies,draft);
    const workspace={id:'workspace',name:'Name',slug:'name',logo:null,metadata:null};
    const draft={name:' New name ',slug:' NEW-NAME ',logo:'',metadata:' notes '};
    assert.equal(capture('details',{workspace}).hasChanges,false);
    assert.equal(capture('details',{workspace},{...draft,name:' '}).error,'Workspace name is required.');
    assert.equal(capture('details',{workspace},{...draft,slug:'bad_slug'}).error,'Use lowercase letters, numbers, and hyphens for the slug.');
    assert.equal(capture('details',{workspace},{...draft,logo:'bad-url'}).error,'Enter a valid logo URL.');
    assert.deepEqual(calls,[]);
    capture('details',{workspace},draft);
    assert.deepEqual(calls[0],['update',{workspaceId:'workspace',name:'New name',slug:'new-name',logo:null,metadata:'notes'}]);
    assert.equal(capture('details',{workspace:null},draft).error,'Select an workspace before updating settings.');
    const originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
    try {
      Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:'https://web.example.test',assign:url=>calls.push(['assign',url])}}});
      calls.length=0;
      await capture('mail',{workspaceId:'workspace'}).disconnect();
      assert.deepEqual(calls,[['fetch','/workspaces/workspace/mail/connection',{method:'DELETE'}],['destroy',{apiOrigin:'https://api.example.test',bindingId:'binding',connectionId:'connection',userId:'user',workspaceId:'workspace'}],['success','Gmail disconnected from this workspace.'],['refetch']]);
      calls.length=0;
      await capture('mail',{workspaceId:'workspace'}).connect();
      assert.equal(JSON.parse(calls[0][2].body).client,'web');
      assert.deepEqual(calls[1],['assign','https://provider.example.test/auth']);
      dependencies.desktop=true; calls.length=0;
      await capture('mail',{workspaceId:'workspace'}).connect();
      assert.equal(JSON.parse(calls[0][2].body).client,'desktop');
      assert.equal(calls[1][1],'open_mail_authorization_url');
      dependencies.fetch=async()=>{throw new Error('denied');};calls.length=0;
      await capture('mail',{workspaceId:'workspace'}).disconnect();
      assert.deepEqual(calls,[['error','denied']]);
      calls.length=0;await capture('mail',{workspaceId:null}).disconnect();assert.deepEqual(calls,[]);
    } finally { if(originalWindow)Object.defineProperty(globalThis,'window',originalWindow);else delete globalThis.window; }
  });
}
