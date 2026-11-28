import {authProject,listingColumns} from '../src/js/catalog-source.mjs';

const pageSize=1000;

export default {
  async fetch(request){
    if(request.method!=='GET'){
      return new Response(null,{status:405,headers:{Allow:'GET','Cache-Control':'no-store'}});
    }
    if(new URL(request.url).search){
      return new Response(null,{status:400,headers:{'Cache-Control':'no-store'}});
    }
    try{
      const [project,key]=authProject;
      const products=[];
      const signal=AbortSignal.timeout(8000);
      for(let offset=0;;offset+=pageSize){
        const url=new URL('/rest/v1/products',project);
        url.search=new URLSearchParams({
          select:listingColumns,active:'eq.true',order:'name.asc,id.asc',limit:String(pageSize),offset:String(offset)
        }).toString();
        const response=await fetch(url,{headers:{apikey:key},signal});
        if(!response.ok)throw Error('Catalog database returned '+response.status);
        const page=await response.json();
        products.push(...page);
        if(page.length<pageSize)break;
      }
      return Response.json(products,{headers:{
        'Cache-Control':'public, max-age=15',
        'Vercel-CDN-Cache-Control':'public, s-maxage=60, stale-while-revalidate=60, stale-if-error=300'
      }});
    }catch(error){
      console.warn('Public catalog refresh failed:',error.message);
      return Response.json({error:'Catálogo indisponível no momento.'},{status:503,headers:{'Cache-Control':'no-store'}});
    }
  }
};
