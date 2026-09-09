import { describe, expect, it } from 'vitest'
import { parseUiTools, parsePreview, resolveCallToken, resultText } from '../src/client/contract.ts'
import { MIME } from '../src/shared.ts'
const tool = {publicName:'wise_demo',rawName:'demo',serverName:'demo',resourceUri:'ui://demo/app'}
const block = {kind:'tool-result',call:{name:tool.publicName},meta:{wiseMcpApp:{callToken:'token',publicName:tool.publicName}},content:[{type:'text',text:'Original result'}]}
const preview = {sessionId:'session',tool,resource:{uri:tool.resourceUri,mimeType:MIME,text:'<html/>'},input:{},result:{content:[]}}
describe('client contract', () => {
 it('validates all descriptors before registering and rejects duplicate names',()=>{
  expect(parseUiTools([tool])).toEqual([tool])
  for(const value of [null,{},[null],[{}],[{...tool,resourceUri:'https://unsafe'}],[tool,tool]]) expect(()=>parseUiTools(value)).toThrow()
 })
 it('requires settled matching call and metadata identity',()=>{
  expect(resolveCallToken(block,tool,tool.publicName)).toBe('token')
  for(const value of [{}, {...block,call:null}, {...block,call:{name:'other'}}, {...block,meta:null}, {...block,meta:{wiseMcpApp:[]}}, {...block,meta:{wiseMcpApp:{callToken:'',publicName:tool.publicName}}}]) expect(resolveCallToken(value,tool,tool.publicName)).toBeNull()
  expect(resolveCallToken(block,tool,'other')).toBeNull()
 })
 it('validates preview and resource identity',()=>{
  expect(parsePreview(preview,tool)).toEqual(preview)
  for(const value of [null,{...preview,sessionId:''},{...preview,tool:{...tool,serverName:'other'}},{...preview,resource:{...preview.resource,mimeType:'text/html'}},{...preview,input:[]},{...preview,result:{content:'no'}}]) expect(()=>parsePreview(value,tool)).toThrow()
 })
 it('preserves result text and safely summarizes nontext content',()=>{
  expect(resultText(block)).toBe('Original result')
  expect(resultText({})).toBe('')
  expect(resultText({...block,content:[{type:'image'}]})).toContain('image')
 })
})
