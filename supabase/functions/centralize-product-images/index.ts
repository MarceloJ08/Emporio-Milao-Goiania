import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.0";
const corsHeaders = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const allowedHosts = new Set(["images.tcdn.com.br","www.vinhosevinhos.com","vinhosevinhos.com","carrefourbr.vtexassets.com","diawine.agilecdn.com.br","naracellar.com","static.paodeacucar.com","perfectewijn.nl","www.winedispensary.com","winedispensary.com","www.perfectcellar.com","perfectcellar.com","peak-wines.com","www.thewinecollective.com.au","thewinecollective.com.au"]);
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:corsHeaders});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST")return respond({error:"Método não permitido."},405);
 const authorization=req.headers.get("Authorization");
 if(!authorization?.startsWith("Bearer "))return respond({error:"Autenticação necessária."},401);
 const supabaseUrl=Deno.env.get("SUPABASE_URL"),anonKey=Deno.env.get("SUPABASE_ANON_KEY"),serviceRoleKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!supabaseUrl||!anonKey||!serviceRoleKey)return respond({error:"Configuração interna indisponível."},500);
 const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:userData,error:userError}=await userClient.auth.getUser();
 if(userError||!userData.user)return respond({error:"Sessão inválida ou expirada."},401);
 const {data:isAdmin,error:adminError}=await userClient.rpc("is_admin");
 if(adminError||isAdmin!==true)return respond({error:"Apenas administradores podem centralizar imagens."},403);
 const admin=createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:products,error:productsError}=await admin.from("products").select("id,name,image_url,image_alt").not("image_url","is",null).order("name").limit(150);
 if(productsError)return respond({error:"Não foi possível consultar o catálogo."},500);
 const storageBase=supabaseUrl+"/storage/v1/object/public/product-images/";
 let migrated=0,skipped=0;const errors:Array<{product:string;reason:string}>=[];
 for(const product of products??[]){
  const source=String(product.image_url||"");
  if(!source||source.startsWith(storageBase)){skipped++;continue;}
  let parsed:URL;try{parsed=new URL(source);}catch{skipped++;errors.push({product:product.id,reason:"URL inválida"});continue;}
  if(parsed.protocol!=="https:"||!allowedHosts.has(parsed.hostname)){skipped++;errors.push({product:product.id,reason:"Domínio não autorizado para importação automática"});continue;}
  try{
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
   const response=await fetch(parsed.toString(),{method:"GET",redirect:"error",signal:controller.signal,headers:{"Accept":"image/avif,image/webp,image/png,image/jpeg"}});
   clearTimeout(timeout);
   if(!response.ok)throw new Error("Origem respondeu HTTP "+response.status);
   const contentType=(response.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
   const extensions:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"},extension=extensions[contentType];
   if(!extension)throw new Error("Formato não permitido: "+(contentType||"desconhecido"));
   const declaredSize=Number(response.headers.get("content-length")||0);if(declaredSize>8388608)throw new Error("Imagem excede 8 MB");
   const bytes=new Uint8Array(await response.arrayBuffer());if(!bytes.length||bytes.length>8388608)throw new Error("Imagem vazia ou maior que 8 MB");
   const path="products/"+product.id+"."+extension;
   const {error:uploadError}=await admin.storage.from("product-images").upload(path,bytes,{upsert:true,contentType,cacheControl:"31536000"});
   if(uploadError)throw new Error("Falha ao gravar no armazenamento");
   const publicUrl=admin.storage.from("product-images").getPublicUrl(path).data.publicUrl;
   const {error:updateError}=await admin.from("products").update({image_url:publicUrl,image_alt:product.image_alt||product.name}).eq("id",product.id);
   if(updateError)throw new Error("Falha ao atualizar o cadastro do produto");
   migrated++;
  }catch(error){errors.push({product:product.id,reason:error instanceof Error?error.message:"Falha desconhecida"});}
 }
 return respond({migrated,skipped,errors});
});