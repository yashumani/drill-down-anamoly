// Application JavaScript unit tests, not browser/visual verification.
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {describe,it,expect} from 'vitest';

const html=readFileSync(new URL('../python/src/reporting_assurance/studio.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];

function harness(){
  const elements=new Map(),blobs=new Map(),downloads=[];
  let request,release;
  function element(id){
    if(!elements.has(id))elements.set(id,{value:'',textContent:'',hidden:false,disabled:false,files:[],events:{},
      addEventListener(name,fn){this.events[name]=fn;},replaceChildren(){},append(){},
      click(){if(this.events.click)return this.events.click();if(this.href)downloads.push(blobs.get(this.href));}});
    return elements.get(id);
  }
  const document={getElementById:element,querySelectorAll:()=>['profile','sample','suggest','rules-file-button','preview','export'].map(element),createElement:tag=>{
    const e={href:'',download:'',append(){},click(){downloads.push(blobs.get(this.href));}};return e;
  }};
  const context={document,Blob,URL:{createObjectURL(blob){const url='blob:'+blobs.size;blobs.set(url,blob);return url;},revokeObjectURL(){}},
    fetch:(_url,options)=>{request=JSON.parse(options.body);return new Promise(resolve=>{release=resolve;});}};
  vm.runInNewContext(script,context);
  return {element,downloads,request:()=>request,resolve:()=>release({ok:true,json:async()=>({valid:true,bundle_digest:'a'.repeat(64)})})};
}

describe('Studio export validation snapshot',()=>{
  it('downloads the same immutable text that was validated when editing continues during a delayed response',async()=>{
    const ui=harness();const validated='{"schema_version":"1.0","revision":"before"}\n';
    ui.element('rules').value=validated;
    const pending=ui.element('export').events.click();
    expect(ui.request().rules).toBe(validated);
    expect(ui.element('rules').disabled).toBe(false);
    ui.element('rules').value='{"revision":"edited-during-validation"}';
    ui.resolve();await pending;
    expect(ui.downloads).toHaveLength(1);
    expect(await ui.downloads[0].text()).toBe(validated);
    expect(ui.element('rules').value).toContain('edited-during-validation');
    expect(ui.element('message').textContent).toContain('editor changed during validation');
  });
});
