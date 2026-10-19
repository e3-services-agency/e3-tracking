import React from 'react';
import {it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {DecisionItem} from './DecisionInbox';
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
