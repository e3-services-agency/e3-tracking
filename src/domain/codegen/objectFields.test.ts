import {describe,it,expect} from 'vitest';
import {BR_PAYLOAD_SOURCE,computeBrPayload} from './brPayload';
import {validateDerivation,parseDerivation,describeDerivation,toNamedDerivation} from './derivation';
import {buildDataLayerModel,buildGtmTemplate} from './snippets';
import {buildCodegenV2,jsonSampleValueForProperty,toCodegenProperty,type AttachedPropertyForCodegen} from '../../backend/services/codegen.service';
import {draftFromDerivation,derivationFromDraft} from '../../features/properties/components/DerivationEditor';
import type {ItemSchemaField} from '../rules/types';

const fields=['product_id','sku','quantity','brand','price','image_url','category_3'];
const derivation={source:'items' as const,id_field:'product_id',form:'object_fields' as const,fields};
const rule=toNamedDerivation('product_list',derivation);
const schema:ItemSchemaField[]=fields.map(field=>({field,data_type:field==='quantity'||field==='price'?'number':'string',required:field!=='category_3',...(field==='image_url'?{data_formats:['uri'] as ItemSchemaField['data_formats']}:{})}));
const property:AttachedPropertyForCodegen={property_name:'product_list',property_data_type:'array',property_item_schema_json:schema,required:true,kind:'state_list',derivation};
const shipped=(br:unknown)=>new Function(BR_PAYLOAD_SOURCE+';return brPayload(arguments[0],arguments[1]);')(br,[rule]);

describe('explicit rich-item projection',()=>{
 it('copies only allowlisted own fields, preserves signed/zero values and raw ID types in both helpers',()=>{
   const br={items:[{product_id:0,sku:'A',quantity:0,price:-12,brand:'B',image_url:'https://example.com',secret:'private'},{product_id:'001',sku:'B',quantity:2,category_3:undefined},{sku:'no ID'}]};
   const expected={product_list:[{product_id:0,sku:'A',quantity:0,brand:'B',price:-12,image_url:'https://example.com'},{product_id:'001',sku:'B',quantity:2}]};
   expect(computeBrPayload(br,[rule])).toEqual(expected);expect(shipped(br)).toEqual(expected);
   expect(br.items[0]).toHaveProperty('secret','private');
 });
 it('preserves empty state and explicit producer override',()=>{
   expect(shipped({items:[]})).toEqual({product_list:[]});
   const br={properties:{product_list:[]},items:[{product_id:'a',sku:'b'}]};
   expect(shipped(br)).toEqual({product_list:[]});expect(computeBrPayload(br,[rule])).toEqual(shipped(br));
 });
 it('rejects malformed, duplicate, unsafe and ID-omitting projections before persistence',()=>{
   expect(validateDerivation(derivation)).toBeNull();
   for(const f of [[],['sku'],['product_id','product_id'],['product_id','__proto__'],['product_id','a.b']])expect(validateDerivation({...derivation,fields:f})).not.toBeNull();
   expect(validateDerivation({...derivation,form:'ids'})).not.toBeNull();
 });
 it('does not copy inherited item fields',()=>{
   const item=Object.assign(Object.create({brand:'inherited'}),{product_id:'a',sku:'b'});
   expect(shipped({items:[item]})).toEqual({product_list:[{product_id:'a',sku:'b'}]});
 });
 it('roundtrips through the property editor without losing projection fields',()=>{
   expect(derivationFromDraft('state_list',draftFromDerivation(derivation))).toEqual(derivation);
   expect(parseDerivation(derivation)).toEqual(derivation);expect(describeDerivation(derivation)).toContain('sku');
 });
 it('uses selected schema types and formats in generated payloads, not the old id/quantity pair',()=>{
   const model=buildDataLayerModel([toCodegenProperty(property)]);
   expect(model.payload.product_list).toEqual([{product_id:'string',sku:'string',quantity:123,brand:'string',price:123,image_url:'https://example.com',category_3:'string'}]);
   expect(jsonSampleValueForProperty(property)).toEqual([{product_id:'string',sku:'string',quantity:123,brand:'string',price:123,image_url:'https://example.com',category_3:'string'}]);
   const text=buildGtmTemplate({bloomreach:'cart_update',dataLayer:'bloomreach'},model);expect(text).toContain('object_fields');expect(text).toContain('"image_url"');
   const api=buildCodegenV2('purchase',[property],{method:'server_api'}).tracking_api;expect(api).toContain('sku');expect(api).toContain('image_url');
 });
 it('keeps legacy id_quantity generation unchanged until a projection is explicitly selected',()=>{
   const model=buildDataLayerModel([toCodegenProperty({...property,derivation:{source:'items',id_field:'product_id',form:'id_quantity'}})]);
   expect(model.payload.product_list).toEqual([{product_id:'string',quantity:1}]);
 });
});
