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
      addEventListener(name,fn){this.events[name]=fn;},replaceChildren(){this.textContent='';},append(){},
      click(){if(this.events.click)return this.events.click();if(this.href)downloads.push(blobs.get(this.href));}});
    return elements.get(id);
  }
  const document={getElementById:element,querySelectorAll:()=>['profile','sample','suggest','rules-file-button','preview','export'].map(element),createElement:tag=>{
    const e={href:'',download:'',append(){},click(){downloads.push(blobs.get(this.href));}};return e;
  }};
  const context={document,Blob,URL:{createObjectURL(blob){const url='blob:'+blobs.size;blobs.set(url,blob);return url;},revokeObjectURL(){}},
    fetch:(_url,options)=>{request=JSON.parse(options.body);return new Promise(resolve=>{release=resolve;});}};
  vm.runInNewContext(script,context);
  return {element,downloads,request:()=>request,resolve:(data={valid:true,bundle_digest:'a'.repeat(64)})=>release({ok:true,json:async()=>data})};
}

describe('Studio export validation snapshot',()=>{
  it.each(['csv','types','rules','controls','evaluation-time'])('replaces obsolete success status immediately when %s changes',id=>{
    const ui=harness();ui.element('message').hidden=false;
    ui.element('message').textContent='Preview evaluated: 10 pass. Gate status: non-gating.';
    ui.element('facts').textContent='old profile counts';
    ui.element(id).events.input();
    expect(ui.element('message').textContent).toBe('Inputs changed. Preview the current table and rules.');
    if(id==='csv'||id==='types')expect(ui.element('facts').textContent).toBe('');
  });

  it('keeps rule edits made while an imported file is still being read',async()=>{
    const ui=harness();ui.element('rules').value='{"revision":"before"}';
    let finish;
    ui.element('rules-file').files=[{size:10,text:()=>new Promise(resolve=>{finish=resolve;})}];
    const pending=ui.element('rules-file').events.change();
    ui.element('rules').value='{"revision":"keep-my-edit"}';
    finish('{"revision":"from-file"}');await pending;
    expect(ui.element('rules').value).toBe('{"revision":"keep-my-edit"}');
    expect(ui.element('message').textContent).toContain('Your edits were kept');
  });

  it.each(['profile','suggest'])('does not apply a stale %s response or overwrite newer rule edits',async(operation)=>{
    const ui=harness();ui.element('rules').value='{"revision":"before"}';
    const pending=ui.element(operation).events.click();
    ui.element('csv').value+='changed-during-request';
    ui.element('rules').value='{"revision":"keep-my-edit"}';
    const observed={row_count:1,column_count:1,columns:[{null_count:0}]};
    ui.resolve({profile:observed,observed,bundle:{revision:'stale-suggestion'}});
    await pending;
    expect(ui.element('rules').value).toBe('{"revision":"keep-my-edit"}');
    expect(ui.element('facts').hidden).toBe(true);
    expect(ui.element('message').textContent).toContain('Inputs changed while');
  });

  it('hides old observed counts when CSV or conversion types change',()=>{
    const ui=harness();ui.element('facts').hidden=false;ui.element('profile-detail').hidden=false;
    ui.element('csv').events.input();
    expect(ui.element('facts').hidden).toBe(true);
    expect(ui.element('profile-detail').hidden).toBe(true);
  });

  it('does not render stale preview evidence after the table changes during a delayed response',async()=>{
    const ui=harness();ui.element('rules').value='{"revision":"before"}';
    const pending=ui.element('preview').events.click();
    expect(ui.request().operation).toBe('preview');
    ui.element('csv').value+='changed-during-preview';
    ui.resolve({report:{results:[],outcome_counts:{pass:1},bundle_digest:'stale-digest'}});
    await pending;
    expect(ui.element('report-json').textContent).toBe('');
    expect(ui.element('evidence-details').hidden).toBe(true);
    expect(ui.element('message').textContent).toContain('Inputs changed while the preview was running');
  });

  it('invalidates already displayed evidence when rules are edited',()=>{
    const ui=harness();ui.element('report-json').textContent='previous evidence';
    ui.element('evidence-details').hidden=false;
    ui.element('rules').events.input();
    expect(ui.element('report-json').textContent).toBe('');
    expect(ui.element('evidence-details').hidden).toBe(true);
  });


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
