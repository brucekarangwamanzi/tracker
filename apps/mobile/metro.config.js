const {getDefaultConfig}=require('expo/metro-config');
const path=require('path');
const config=getDefaultConfig(__dirname);
const root=path.resolve(__dirname,'../..');
config.watchFolders=[root];
config.resolver.nodeModulesPaths=[path.join(__dirname,'node_modules'),path.join(root,'node_modules')];
if(!config.resolver.assetExts.includes('wasm'))config.resolver.assetExts.push('wasm');
config.resolver.resolveRequest=(context,name,platform)=>{
 if(context.originModulePath.startsWith(path.join(root,'src'))&&name.startsWith('.')&&name.endsWith('.js')){
  try{return context.resolveRequest(context,name.slice(0,-3),platform);}catch{}
 }
 return context.resolveRequest(context,name,platform);
};
const enhance=config.server.enhanceMiddleware;
config.server.enhanceMiddleware=(middleware,server)=>{
 const next=enhance?enhance(middleware,server):middleware;
 return(req,res,done)=>{res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');next(req,res,done);};
};
module.exports=config;
