import { httpServerHandler } from "cloudflare:node";
import app from "./server.js";

let expressHandlerPromise;
let configured=false;

function configure(env){
  if(configured) return;
  if(typeof app.configureRuntime !== 'function'){
    throw new Error('Server runtime configuration is unavailable.');
  }
  app.configureRuntime(env);
  configured=true;
}

async function getExpressHandler(env){
  configure(env);
  if(!expressHandlerPromise){
    app.listen(3000);
    expressHandlerPromise=httpServerHandler({port:3000});
  }
  return expressHandlerPromise;
}

function assetRequest(request,pathname){
  const url=new URL(request.url);
  if(pathname==='/admin'||pathname==='/admin/') url.pathname='/admin/index.html';
  else if(pathname.startsWith('/admin/')&&!pathname.split('/').pop().includes('.')) url.pathname='/admin/index.html';
  return new Request(url.toString(),request);
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api'||url.pathname.startsWith('/api/')){
      try{
        const handler=await getExpressHandler(env);
        return handler.fetch(request,env,ctx);
      }catch(error){
        console.error('API/Express initialization failed:',error);
        return Response.json({error:'Server configuration error.',detail:String(error?.message||error)},{status:500,headers:{'Cache-Control':'no-store'}});
      }
    }
    const assetResponse=await env.ASSETS.fetch(assetRequest(request,url.pathname));
    if(assetResponse.status!==404) return assetResponse;
    if(!url.pathname.startsWith('/admin/')){
      const fallback=new URL(request.url);
      fallback.pathname='/index.html';
      return env.ASSETS.fetch(new Request(fallback.toString(),request));
    }
    return assetResponse;
  }
};
