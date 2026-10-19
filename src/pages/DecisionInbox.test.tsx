// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {DecisionInbox,DecisionItem} from './DecisionInbox';
import type {DecisionCard} from '../domain/decisionInbox';

function card():DecisionCard{return {id:'decision',key:'NATIVE-01',revision:1,content_hash:'hash',state:'proposed',restored:false,stale:false,source_review:{tracked:false,requires_review:false,source_count:0,checked_at:null,partial_captures:0,followup_ids:[]},history:[],documents:[],native_targets:[{id:'event',name:'cart_update'},{id:'action',name:'action'},{id:'uc',name:'Cart recovery'}],payload:{project_id:'project',revision:1,baselines:{},key:'NATIVE-01',audiences:['technical_consultant'],review_role:'technical_consultant',summary:'Apply native changes',confidence:'high',rationale:'Evidence',impact:'Status and variants',alternatives:'Defer',execution_plan:'Verify actual payloads',evidence:[],patches:[],native_changes:[{op:'use_case_status',use_case_id:'uc',from:null,to:'approved'},{op:'create_variant',event_id:'event',conditions:[{property_id:'action',operator:'equals',values:['add']}]}]}};}
const render=(c:DecisionCard)=>new JSDOM(renderToStaticMarkup(<DecisionItem card={c} busy={false} act={async()=>{}}/>)).window.document;
it('shows the exact native changes and the approval scope before allowing confirmation',()=>{
 const dom=render(card()),changes=dom.querySelector('[aria-label="Native E3 changes"]')!;
 expect(changes.textContent).toContain('Cart recovery');expect(changes.textContent).toContain('Unset');expect(changes.textContent).toContain('approved');expect(changes.textContent).toContain('cart_update');expect(changes.textContent).toContain('action = add');
 const button=[...dom.querySelectorAll('button')].find(b=>b.textContent==='Approve and apply')!;expect(button.disabled).toBe(true);expect(dom.body.textContent).toContain('approve applying them with the documentation');
});
it('shows native result IDs/statuses and keeps the separate QA limitation visible',()=>{
 const c=card();c.state='documented';c.history=[{id:'receipt',action:'approve_and_apply',actor:'Verified reviewer',created_at:'2026-10-19T12:00:00Z',detail:{native_results:[{op:'use_case_status',action:'updated',entity_id:'uc',entity_name:'Cart recovery',before:null,after:'approved'},{op:'create_variant',action:'created',entity_id:'variant',entity_name:'cart_update[action=add]'}]}}];
 const dom=render(c),receipt=dom.querySelector('[aria-label="Execution receipt"]')!;expect(receipt.textContent).toContain('Verified reviewer');expect(receipt.textContent).toContain('Unset → approved');expect(receipt.textContent).toContain('cart_update[action=add]');expect(receipt.textContent).toContain('(variant)');expect(dom.body.textContent).toContain('E3 changes applied · QA pending');
});
it('preserves the documentation-only approval scope for legacy proposals',()=>{
 const c=card();delete c.payload.native_changes;const dom=render(c);expect(dom.querySelector('[aria-label="Native E3 changes"]')).toBe(null);expect(dom.body.textContent).toContain('Approve documentation');expect(dom.body.textContent).not.toContain('Approve and apply');
});

const state=vi.hoisted(()=>({project:'project',handler:null as null|((url:string,init?:RequestInit)=>Promise<Response>)}));
vi.mock('@/src/features/projects/context/ProjectShellContext',()=>({useProjectShell:()=>({activeProjectId:state.project})}));
vi.mock('@/src/lib/api',()=>({fetchWithAuth:(url:string,init?:RequestInit)=>state.handler!(url,init)}));
const json=(data:unknown,status=200)=>Promise.resolve({ok:status<400,status,json:async()=>data} as Response);
const list=(decisions:DecisionCard[])=>json({decisions,identity_mode:'local'});
function named(id:string,extra:Partial<DecisionCard>={}) {const c=card();return {...c,id,key:id,payload:{...c.payload,key:id,summary:`Proposal ${id}`},...extra};}
function doc(id:string,extra:Partial<DecisionCard>={}) {const c=named(id,extra);delete c.payload.native_changes;return c;}
let root:Root,container:HTMLDivElement;
beforeEach(()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);state.project='project';state.handler=()=>list([]);
  window.history.replaceState(null,'','/tracking-plan/p/project/decisions');
  Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:vi.fn()});
  container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
const mount=async()=>{await act(async()=>root.render(<DecisionInbox/>));};
const button=(text:string)=>[...container.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===text)!;
const click=async(text:string)=>{await act(async()=>button(text).click());};
const articles=()=>[...container.querySelectorAll('article')];
const open=async()=>{await act(async()=>{const details=container.querySelector<HTMLDetailsElement>('article details')!;details.open=true;details.dispatchEvent(new Event('toggle'));});};
const confirm=async()=>{await act(async()=>container.querySelector<HTMLInputElement>('article input[type=checkbox]')!.click());};
const change=async(label:string,value:string)=>{await act(async()=>{const input=container.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});};
it('defaults to current executable proposals with truthful queue counts, stale/deferred distinctions and collapsed history',async()=>{
  const old=named('old',{key:'same',state:'superseded'}),newer=named('latest',{key:'same',revision:2});
  state.handler=()=>list([old,newer,named('stale',{stale:true}),named('deferred',{state:'deferred'}),doc('choice'),doc('done',{state:'documented'}),named('restored',{restored:true})]);
  await mount();expect(articles()).toHaveLength(3);expect(container.textContent).toContain('E3 changes (3)');expect(container.textContent).toContain('Business choices (1)');expect(container.textContent).toContain('Completed / closed (2)');
  expect(container.textContent).toContain('1 ready to approve · 1 need updated evidence or data · 1 awaiting input');expect(articles().every(a=>!a.querySelector('details')!.open)).toBe(true);
  await click('Business choices (1)');expect(articles()).toHaveLength(1);expect(container.textContent).toContain('Proposal choice');expect(container.textContent).toContain('no automatic status, variant or required-field changes');
  await click('Completed / closed (2)');expect(articles()).toHaveLength(2);expect(articles().every(a=>!a.querySelector('details')!.open)).toBe(true);
  await click('All revisions (7)');expect(articles()).toHaveLength(7);
});
it('states clearly when no executable proposals exist without hiding unresolved choices',async()=>{
  state.handler=()=>list([doc('choice'),doc('done',{state:'documented'})]);await mount();expect(articles()).toHaveLength(0);
  expect(container.textContent).toContain('No executable E3 proposals are awaiting approval');expect(button('Business choices (1)')).toBeDefined();
});
it('searches event/use-case names and reveals exact historical linked records outside filters',async()=>{
  const old=doc('old',{state:'superseded'});old.payload.summary='Archived business choice';
  state.handler=()=>list([named('native'),old]);await mount();await change('Search decisions','cart_update');expect(articles()).toHaveLength(1);
  await change('Search decisions','does-not-match');expect(articles()).toHaveLength(0);
  await act(async()=>{window.location.hash='#decision-record-old';window.dispatchEvent(new Event('hashchange'));});
  expect(articles()).toHaveLength(1);expect(articles()[0].id).toBe('decision-record-old');expect(articles()[0].querySelector('details')!.open).toBe(true);
  expect(container.textContent).toContain('outside the selected queue or filters');
});
it('key links resolve to the latest revision and open it for review',async()=>{
  const old=named('old',{key:'KEY',state:'superseded'}),next=named('next',{key:'KEY',revision:2});
  window.history.replaceState(null,'','#decision-KEY');state.handler=()=>list([old,next]);await mount();
  expect(articles()).toHaveLength(1);expect(articles()[0].id).toBe('decision-record-next');expect(articles()[0].querySelector('details')!.open).toBe(true);
});
it('keeps last loaded cards after refresh failure and retries the read without any mutation',async()=>{
  let fail=false,posts=0;state.handler=(_url,init)=>{if(init?.method)posts++;return fail?Promise.reject(Error('Failed to fetch')):list([named('native')]);};
  await mount();fail=true;await click('Refresh');expect(articles()).toHaveLength(1);expect(container.querySelector('[role=alert]')!.textContent).toContain('last loaded decisions remain visible');
  fail=false;await click('Retry loading');expect(container.querySelector('[role=alert]')).toBe(null);expect(posts).toBe(0);
});
it('shows a retry for initial load failure and recovers without stale empty-state claims',async()=>{
  state.handler=()=>Promise.reject(Error('Failed to fetch'));await mount();expect(container.textContent).not.toContain('No executable');
  state.handler=()=>list([named('native')]);await click('Retry loading');expect(articles()).toHaveLength(1);expect(container.querySelector('[role=alert]')).toBe(null);
});
it('distinguishes a saved approval from a failed refresh, locks duplicate actions and reads the receipt on retry',async()=>{
  let approved=false,fail=false,posts=0;const c=named('native');state.handler=(_url,init)=>{
    if(init?.method==='POST'){posts++;approved=true;fail=true;return json({});}
    if(fail)return Promise.reject(Error('Failed to fetch'));
    return list([approved?{...c,state:'documented',history:[{id:'receipt',action:'approve_and_apply',actor:'Reviewer',created_at:'now',detail:{native_results:[]}}]}:c]);
  };
  await mount();await open();await confirm();await click('Approve and apply');
  expect(container.querySelector('[role=alert]')!.textContent).toContain('Action saved');expect(button('Approve and apply').disabled).toBe(true);await click('Approve and apply');expect(posts).toBe(1);
  fail=false;await click('Retry loading');expect(container.querySelector('[role=alert]')).toBe(null);expect(button('Completed / closed (1)')).toBeDefined();
  await click('Completed / closed (1)');await open();expect(container.querySelector('[aria-label="Execution receipt"]')).not.toBe(null);expect(container.querySelector('article input[type=checkbox]')).toBe(null);
});
it('treats a lost POST response as unknown and never sends an immediate duplicate',async()=>{
  let posts=0;state.handler=(_url,init)=>{if(init?.method==='POST'){posts++;return Promise.reject(Error('Failed to fetch'));}return list([named('native')]);};
  await mount();await open();await confirm();await click('Approve and apply');
  expect(container.querySelector('[role=alert]')!.textContent).toContain('outcome is unknown');expect(button('Approve and apply').disabled).toBe(true);await click('Approve and apply');expect(posts).toBe(1);
  await click('Retry loading');expect(button('Approve and apply').disabled).toBe(false);
});
it('keeps structured rejection actionable but treats an ambiguous server error as unknown',async()=>{
  let status=409;state.handler=(_url,init)=>init?.method==='POST'?json({error:'Baseline changed'},status):list([named('native')]);
  await mount();await open();await confirm();await click('Approve and apply');expect(container.querySelector('[role=alert]')!.textContent).toContain('Baseline changed');expect(button('Approve and apply').disabled).toBe(false);
  status=502;await click('Approve and apply');expect(container.querySelector('[role=alert]')!.textContent).toContain('outcome is unknown');expect(button('Approve and apply').disabled).toBe(true);
});
it('ignores delayed old-project reads after switching projects',async()=>{
  let resolve!:(r:Response)=>void;state.handler=url=>url.includes('/project/')?new Promise(r=>{resolve=r;}):list([named('new-project')]);
  await mount();state.project='new';await mount();expect(container.textContent).toContain('Proposal new-project');
  await act(async()=>resolve(await list([named('old-project')])));expect(container.textContent).not.toContain('Proposal old-project');
});
it('does not offer dead planning forms for documented records already requested or applied',()=>{
  const c=doc('requested',{state:'documented',history:[{id:'request',action:'request_execution_plan',actor:'Reviewer',created_at:'now',detail:{}}]});
  const dom=render(c);expect(dom.querySelector('input[type=checkbox]')).toBe(null);expect([...dom.querySelectorAll('button')].some(b=>b.textContent?.includes('Request execution plan'))).toBe(false);
});

it('shows exact required-field changes, supports bounded amendment and displays boolean receipts',async()=>{
  const c=named('required');c.payload.native_changes=[{op:'event_property_required',event_id:'event',property_id:'action',from:false,to:true}];
  state.handler=()=>list([c]);await mount();await open();expect(container.querySelector('[aria-label="Native E3 changes"]')!.textContent).toContain('cart_update.action: Optional → Required');
  await click('Amend');expect(container.querySelector('[aria-label="Expected current requirement for change 1"]')).not.toBe(null);expect(container.querySelector('[aria-label="New requirement for change 1"]')).not.toBe(null);
  c.state='documented';c.history=[{id:'receipt',action:'approve_and_apply',actor:'Reviewer',created_at:'now',detail:{native_results:[{op:'event_property_required',action:'updated',entity_id:'link',entity_name:'cart_update.action',before:false,after:true}]}}];
  const dom=render(c);expect(dom.querySelector('[aria-label="Execution receipt"]')!.textContent).toContain('cart_update.action: Optional → Required');
});
it('keeps stale or evidence-blocked native approvals disabled after confirmation',async()=>{
 const c=named('blocked');c.source_review.requires_review=true;state.handler=()=>list([c]);await mount();await open();await confirm();expect(button('Approve and apply').disabled).toBe(true);expect(container.textContent).toContain('Update required before approval');
});

it('links a successful application to its saved receipt after it leaves the active queue',async()=>{
 const c=named('native');let saved=false;
 state.handler=(_url,init)=>{
  const result={...c,state:'documented' as const,history:[{id:'receipt',action:'approve_and_apply',actor:'Reviewer',created_at:'now',detail:{native_results:[]}}]};
  if(init?.method==='POST'){saved=true;return json(result);}return list([saved?result:c]);
 };
 await mount();await open();await confirm();await click('Approve and apply');
 expect(articles()).toHaveLength(0);const link=container.querySelector<HTMLAnchorElement>('a[href="#decision-record-native"]')!;expect(link.textContent).toBe('View saved result and decision record');
 await act(async()=>{window.location.hash=link.hash;window.dispatchEvent(new Event('hashchange'));});
 expect(articles()).toHaveLength(1);expect(articles()[0].querySelector('details')!.open).toBe(true);expect(container.querySelector('[aria-label="Execution receipt"]')).not.toBe(null);
});
