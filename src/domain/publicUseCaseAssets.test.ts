import {it,expect} from 'vitest';
import {sourceEnvironment,reviewedPublicAsset,assetEnvironmentWarnings} from './publicUseCaseAssets';

it('derives environments only from explicit Bloomreach project names; otherwise returns null',()=>{
 expect(sourceEnvironment('https://synthetic.bloomreach.co/p/example-production/campaigns/id')).toMatchObject({environment:'production',source_project_key:'example-production'});
 expect(sourceEnvironment('https://synthetic.bloomreach.co/p/example-staging/campaigns/id')).toMatchObject({environment:'staging'});
 for(const url of [null,'bad','https://synthetic.bloomreach.co/p/example/campaigns/production','https://synthetic.bloomreach.co.evil.test/p/example-production','http://synthetic.bloomreach.co/p/example-production'])expect(sourceEnvironment(url).environment).toBeNull();
 const original={link_id:'link',asset_type:'email_templates',asset_id:'id',source_url:null};
 expect(reviewedPublicAsset(original)).toMatchObject({id:'link',link_id:'link',asset_type:'email_template',source_asset_type:'email_templates',environment:null});expect(original.asset_type).toBe('email_templates');
});
it('groups conflicts by system, canonical type and exact external ID without treating unknown environments as conflicts',()=>{
 const a={link_id:'a',system:'bloomreach',asset_type:'scenario',asset_id:'id',environment:'production',environment_source:'source_url_project_name'};
 expect(assetEnvironmentWarnings([a,{...a,link_id:'b',environment:null}])).toEqual([]);
 expect(assetEnvironmentWarnings([a,{...a,link_id:'b',asset_id:'other',environment:'staging'}])).toEqual([]);
 expect(assetEnvironmentWarnings([a,{...a,link_id:'b',asset_type:'email_template',environment:'staging'}])).toEqual([]);
 expect(assetEnvironmentWarnings([a,{...a,link_id:'b',environment:'staging'}])).toEqual([expect.objectContaining({code:'ASSET_ENVIRONMENT_CONFLICT'})]);
});
