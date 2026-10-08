import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {transformSync} from 'esbuild'
import type {DesktopEvent} from '../../desktop/shared/ipc'

type Element={type:unknown;props:Record<string,any>}
const jsx={jsx:(type:unknown,props:Element['props'])=>({type,props}),jsxs:(type:unknown,props:Element['props'])=>({type,props}),Fragment:'Fragment'}
function text(value:any):string{return Array.isArray(value)?value.map(text).join(''):value&&typeof value==='object'&&'props'in value?text(value.props.children):typeof value==='string'?value:''}

test('U71-01: actual migration button synchronously prevents duplicate starts and ignores late failure after unmount',async()=>{
 const hooks:any[]=[],effects:Array<()=>void|(()=>void)>=[],calls:string[]=[],errors:string[]=[],pending=Promise.withResolvers<unknown>();let cursor=0
 const React={useState(initial:unknown){const index=cursor++;if(!(index in hooks))hooks[index]=initial;return[hooks[index],(value:unknown)=>{hooks[index]=value}]},useRef(initial:unknown){const index=cursor++;if(!(index in hooks))hooks[index]={current:initial};return hooks[index]},useEffect(callback:()=>void|(()=>void)){effects.push(callback)}}
 const module={exports:{}as {DataRootMigrationButton():Element}},window={desktop:{migrateRoot:async(action:string)=>{calls.push(action);return pending.promise}}}
 const code=transformSync(readFileSync('src/components/desktop/DataRootMigrationButton.tsx','utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'}).code
 new Function('module','exports','require','window',code)(module,module.exports,(id:string)=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='lucide-react'?{Loader2:'Loader2'}:id==='sonner'?{toast:{error:(value:string)=>errors.push(value)}}:id==='@/components/ui/button'?{Button:'Button'}:(()=>{throw Error(`Unexpected button dependency ${id}`)})(),window)
 const render=()=>{cursor=0;return module.exports.DataRootMigrationButton()};const first=render(),cleanup=effects.shift()!();first.props.onClick();first.props.onClick();assert.deepEqual(calls,['start']);assert.equal(render().props.disabled,true)
 cleanup?.();pending.reject(Error('late native picker error'));await new Promise(setImmediate);assert.deepEqual(errors,[])
})

test('U71-02: actual DesktopApp pending-cancel branch retains its dialog on failed retry and clears only on confirmed close-cancelled event',async()=>{
 const file=ts.createSourceFile('DesktopApp.tsx',readFileSync('src/components/desktop/DesktopApp.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
 let effect='',dialog='';const visit=(node:ts.Node)=>{
  if(ts.isCallExpression(node)&&node.expression.getText(file)==='useEffect'&&node.arguments[0]?.getText(file).includes('installDesktopTransport(bridge)'))effect=node.arguments[0].getText(file)
  if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(file)==='Dialog')dialog=node.getText(file)
  ts.forEachChild(node,visit)
 };visit(file);assert.ok(effect&&dialog)
 const listeners=new Set<(value:DesktopEvent)=>void>(),calls:string[]=[],errors:string[]=[],bootstrap=Promise.withResolvers<never>();let retry=Promise.withResolvers<void>()
 const bridge={bootstrap:()=>bootstrap.promise,subscribe:(callback:(value:DesktopEvent)=>void)=>{listeners.add(callback);return()=>listeners.delete(callback)},migrateRoot:async(action:string)=>{calls.push(action);return retry.promise}}
 const dependencies={window:{desktop:bridge,addEventListener(){},removeEventListener(){}},browserSessionStorage:()=>null,installDesktopTransport(){},queryClient:{},closingRef:{current:false},drafts:{current:null},
  useDesktopStore:{setState(){}},receiveDesktopState(){},toast:{error:(value:string)=>errors.push(value),info(){}},useChatStore:{getState(){return{}}},
 }
 const code=`let restorePending=false,retryingRestore=false;const setRestorePending=value=>restorePending=value,setRetryingRestore=value=>retryingRestore=value;
 let closing=false,migrationPending=false,retryingMigration=false;const setClosing=value=>closing=value,setMigrationPending=value=>migrationPending=value,setRetryingMigration=value=>retryingMigration=value;
 const setError=()=>{},setSettingsSection=()=>{},setSettingsOpen=()=>{},setRecoveryOpen=()=>{},setModelRequired=()=>{};
 const effect=${effect};const cleanup=effect();return{view:()=>${dialog},cleanup};`
 const module={exports:{}};const compiled=transformSync(code,{loader:'tsx',jsx:'automatic',format:'cjs'}).code
 const result=new Function('module','exports','require',...Object.keys(dependencies),'Dialog','DialogContent','DialogTitle','DialogDescription','Button','Loader2',compiled)(module,module.exports,(id:string)=>{assert.equal(id,'react/jsx-runtime');return jsx},...Object.values(dependencies),'Dialog','DialogContent','DialogTitle','DialogDescription','Button','Loader2') as {view():Element;cleanup():void}
 const emit=(value:DesktopEvent)=>listeners.forEach(callback=>callback(value))
 const retryButton=()=>{const dialog=result.view(),children=dialog.props.children.props.children as Element[];return children.find(item=>item.type==='Button')!}
 try{
  emit({type:'migration-cancel-pending'});assert.equal(result.view().props.open,true);assert.match(text(result.view()),/迁移取消尚未保存/);assert.match(text(result.view()),/取消成功前/);assert.equal(retryButton().props.disabled,false)
  const first=retryButton().props.onClick();assert.deepEqual(calls,['cancel']);assert.equal(retryButton().props.disabled,true);retry.reject(Error('private filesystem failure'));await first
  assert.equal(result.view().props.open,true);assert.equal(retryButton().props.disabled,false);assert.deepEqual(errors,['取消状态仍未保存，请检查目录权限后重试。']);assert.doesNotMatch(text(result.view()),/private filesystem failure/)
  retry=Promise.withResolvers<void>();const second=retryButton().props.onClick();retry.resolve();await second;assert.equal(result.view().props.open,true,'returned cancellation promise alone must not imply confirmed business reopen')
  emit({type:'close-cancelled'});assert.equal(result.view().props.open,false);assert.deepEqual(calls,['cancel','cancel'])
 }finally{result.cleanup();assert.equal(listeners.size,0)}
})

test('U71-03: actual startup page mounts maintenance without mounting DesktopApp when only the restricted bridge is present',()=>{
 const source=readFileSync('src/app/page.tsx','utf8'),code=transformSync(source,{loader:'tsx',format:'cjs',jsx:'automatic'}).code
 for(const maintenance of [true,false]){
  let mode:unknown=null;const effects:Array<()=>void>=[],dynamics:unknown[]=[],react={useState:()=>[mode,(value:unknown)=>{mode=value}],useEffect:(callback:()=>void)=>effects.push(callback)},module={exports:{}as {default():Element}}
  const dynamic=(load:()=>unknown)=>{const identifier=load.toString().includes('RootMaintenanceScreen')?'Maintenance':'DesktopApp';dynamics.push(identifier);return identifier}
  new Function('module','exports','require','window',code)(module,module.exports,(id:string)=>id==='react'?react:id==='react/jsx-runtime'?jsx:id==='next/dynamic'?{__esModule:true,default:dynamic}:(()=>{throw Error(`Unexpected page dependency ${id}`)})(),maintenance?{desktopMaintenance:{}}:{desktop:{}})
  assert.equal(module.exports.default().type,'main');effects.shift()!();const mounted=module.exports.default();assert.equal(mounted.type,maintenance?'Maintenance':'DesktopApp');assert.deepEqual(dynamics,['DesktopApp','Maintenance'])
 }
})
