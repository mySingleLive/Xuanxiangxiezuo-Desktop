import {join} from 'node:path'
import {z} from 'zod'
import {WorkStorage} from '../core/work-storage'
import {atomicWrite} from '../core/versioned-store'
import {assertDirectory,directoryIdentity,readMetadata} from '../core/root-ownership'
import {workManifestSchema} from '../shared/workspace'
const markerSchema=z.object({schemaVersion:z.literal(1),workId:z.uuid(),required:z.literal(true)}).strict()
/** The marker is independent from the pointer and never changes the Web work manifest. */
export async function workspaceStorage(path:string,assertOwner:()=>void|Promise<void>=()=>{}){
 const root=await directoryIdentity(path),manifest=workManifestSchema.parse(await readMetadata(join(path,'xuanxiang-work.json'))),marker=join(path,'xuanxiang-storage-required.json')
 const guard=async()=>{await assertOwner();await assertDirectory(root);const current=workManifestSchema.parse(await readMetadata(join(path,'xuanxiang-work.json')));if(current.id!==manifest.id)throw Error('作品身份已变化')}
 const required=async()=>{
  await guard();let value:unknown
  try{value=await readMetadata(marker,4096)}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'){await guard();return false}throw error}
  const data=markerSchema.parse(value);if(data.workId!==manifest.id)throw Error('作品存储保护标记不匹配');await guard();return true
 }
 return new WorkStorage(root,manifest.id,{assertOwner:guard,required,markRequired:async()=>{
  if(await required())return
  await atomicWrite(marker,JSON.stringify({schemaVersion:1,workId:manifest.id,required:true}),{beforeRename:async()=>{await guard();if(await required())return}})
 }})
}
