// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UseCases } from './UseCases';
import { UseCasesTable, useCaseRowsFromInternal } from '@/src/features/views';

const state = vi.hoisted(() => ({ project: 'project-a', requests: [] as {url:string;init?:RequestInit}[], handler: null as null | ((url:string,init?:RequestInit)=>Promise<Response>) }));
vi.mock('@/src/features/projects/context/ProjectShellContext', () => ({ useProjectShell: () => ({activeProjectId:state.project,hasValidProjectContext:!!state.project}) }));
vi.mock('@/src/features/views/Implementation', () => ({ useImplementation:()=>({reload:()=>{}}), UseCaseImplementationDetail:()=>null, ImplementationSummary:()=>null }));
const setters = { setSelectedItemIdToEdit:()=>{},setRequestedTab:()=>{} };
vi.mock('@/src/store',()=>({useStore:(select:(s:unknown)=>unknown)=>select({...setters,selectedItemIdToEdit:null})}));
vi.mock('@/src/lib/api',()=>({fetchWithAuth:(url:string,init?:RequestInit)=>{state.requests.push({url,init});return state.handler ? state.handler(url,init) : serve(url,init);}}));
const uc=(id='uc-a',name='Order confirmation',status:string|null='proposed')=>({id,name,status,code:id,type:'transactional',description:null,priority:null,owner:null,notes:null,narrative:null,narrative_generated_at:null,narrative_edited_at:null,sort_order:0,documentation_url:null,internal_notes:null,internal_url:null});
const json=(data:unknown,status=200)=>Promise.resolve({ok:status<400,status,json:async()=>data} as Response);
function serve(url:string,init?:RequestInit):Promise<Response>{
 if(url.endsWith('/use-case-templates'))return json([]);
 if(init?.method==='PATCH')return json({...uc(),status:JSON.parse(init.body as string).status});
 return json(state.project==='project-a'?[uc(),uc('uc-b','Payment failure',null)]:[uc('uc-other','Other project','approved')]);
}
let root:Root,container:HTMLDivElement;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);state.project='project-a';state.requests=[];state.handler=null;localStorage.clear();window.history.replaceState(null,'','/tracking-plan/p/project-a/use-cases');container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
const mount=()=>act(async()=>root.render(<UseCases/>));
const lifecycle=(name='Order confirmation')=>container.querySelector<HTMLSelectElement>(`select[aria-label="Agreed lifecycle for ${name}"]`)!;
const change=async(element:HTMLSelectElement,value:string)=>act(async()=>{element.value=value;element.dispatchEvent(new Event('change',{bubbles:true}));});
const filter=()=>container.querySelector<HTMLSelectElement>('[aria-label="Filter by status"]')!;
const patches=()=>state.requests.filter(r=>r.init?.method==='PATCH');

it('saves lifecycle from overview using only PATCH status and keeps the saved server value',async()=>{
 await mount();await change(lifecycle(),'live');
 expect(patches()).toHaveLength(1);expect(patches()[0].url).toMatch(/project-a\/use-cases\/uc-a$/);
 expect(JSON.parse(patches()[0].init!.body as string)).toEqual({status:'live'});
 expect(lifecycle().value).toBe('live');expect(container.textContent).toContain('Order confirmation: lifecycle saved.');
 expect(container.querySelector('h1')?.textContent).toBe('Use cases');
});
it('preserves unset lifecycle and can explicitly clear a saved lifecycle',async()=>{
 await mount();expect(lifecycle('Payment failure').value).toBe('');
 await change(lifecycle(),'');expect(JSON.parse(patches()[0].init!.body as string)).toEqual({status:null});expect(lifecycle().value).toBe('');
});
it('disables the row while saving and keeps the old value on HTTP failure, with a retry',async()=>{
 let finish!:(value:Response)=>void;
 state.handler=(url,init)=>init?.method==='PATCH'?new Promise(resolve=>{finish=resolve;}):serve(url,init);
 await mount();await change(lifecycle(),'live');expect(lifecycle().disabled).toBe(true);expect(lifecycle().value).toBe('proposed');expect(container.textContent).toContain('Saving…');
 await act(async()=>container.querySelector<HTMLElement>('[data-testid="use-case-row"]')!.click());
 expect(container.querySelector('h1')?.textContent).toBe('Use cases');
 await act(async()=>finish(await json({error:'Permission denied'},403)));
 expect(lifecycle().disabled).toBe(false);expect(lifecycle().value).toBe('proposed');expect(container.querySelector('[role="alert"]')?.textContent).toBe('Permission denied');
 state.handler=null;await change(lifecycle(),'approved');expect(lifecycle().value).toBe('approved');expect(container.querySelector('[role="alert"]')).toBeNull();
});
it('retains previous status after a network error without an unhandled rejection',async()=>{
 state.handler=(url,init)=>init?.method==='PATCH'?Promise.reject(new TypeError('Failed to fetch')):serve(url,init);
 await mount();await change(lifecycle(),'live');expect(lifecycle().value).toBe('proposed');expect(lifecycle().disabled).toBe(false);expect(container.querySelector('[role="alert"]')?.textContent).toBe('Failed to fetch');
});
it('updates active status filters from the actual PATCH response',async()=>{
 state.handler=(url,init)=>init?.method==='PATCH'?json({...uc(),status:'in_progress',name:'Unrelated stale name'}):serve(url,init);
 await mount();await change(filter(),'proposed');await change(lifecycle(),'live');
 expect(lifecycle()).toBeNull();expect(container.textContent).toContain('No use cases match');expect(container.textContent).toContain('Order confirmation: lifecycle saved.');
 await change(filter(),'');expect(lifecycle().value).toBe('in_progress');expect(container.textContent).not.toContain('Unrelated stale name');
});
it('ignores a completed save from the previous project and a previous A generation',async()=>{
 let finish!:(value:Response)=>void;
 state.handler=(url,init)=>init?.method==='PATCH'?new Promise(resolve=>{finish=resolve;}):serve(url,init);
 await mount();await change(lifecycle(),'live');state.project='project-b';await mount();
 expect(lifecycle('Other project').value).toBe('approved');expect(lifecycle()).toBeNull();
 state.project='project-a';await mount();expect(lifecycle().value).toBe('proposed');
 await act(async()=>finish(await json({...uc(),status:'live'})));
 expect(lifecycle().value).toBe('proposed');expect(container.textContent).not.toContain('lifecycle saved.');expect(lifecycle().disabled).toBe(false);
});
it('ignores an old list response after switching project',async()=>{
 let finish!:(value:Response)=>void;
 state.handler=(url,init)=>url.endsWith('/project-a/use-cases')?new Promise(resolve=>{finish=resolve;}):serve(url,init);
 await mount();state.project='project-b';await mount();expect(lifecycle('Other project').value).toBe('approved');
 await act(async()=>finish(await json([uc()])));expect(lifecycle()).toBeNull();expect(lifecycle('Other project').value).toBe('approved');
});
it('keeps shared read-only lifecycle badge-only even when an editor callback is supplied',async()=>{
 const onChange=vi.fn();await act(async()=>root.render(<UseCasesTable rows={useCaseRowsFromInternal([uc()])} readOnly lifecycleEditor={{onChange,states:{}}}/>));
 expect(container.querySelector('[aria-label^="Agreed lifecycle for"]')).toBeNull();expect(container.textContent).toContain('Proposed');expect(onChange).not.toHaveBeenCalled();
});
it('does not bubble select clicks or Enter/Space to the row or ancestor navigation',async()=>{
 const open=vi.fn(),keys=vi.fn(),changes=vi.fn();await act(async()=>root.render(<div onKeyDown={keys}><UseCasesTable rows={useCaseRowsFromInternal([uc()])} onOpen={open} lifecycleEditor={{onChange:changes,states:{}}}/></div>));
 await act(async()=>{lifecycle().click();lifecycle().dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));lifecycle().dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));});
 expect(open).not.toHaveBeenCalled();expect(keys).not.toHaveBeenCalled();await change(lifecycle(),'approved');expect(changes).toHaveBeenCalledOnce();expect(open).not.toHaveBeenCalled();
});
