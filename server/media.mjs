import {createReadStream} from 'node:fs';
import {realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {pipeline} from 'node:stream/promises';

const types={'.mp4':'video/mp4','.webm':'video/webm','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};

// Keep large media out of the embedded Worker bundle and support seeking.
export async function serveMedia(req,res,directory){
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(!pathname.startsWith('/media/'))return false;
  if(!['GET','HEAD'].includes(req.method)){
    res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return true;
  }
  let root,file,info;
  try{
    root=await realpath(directory);
    const relative=decodeURIComponent(pathname.slice('/media/'.length));
    if(relative.split(/[\\/]/).some(part=>part.startsWith('.')))throw new Error('Invalid media path');
    file=await realpath(path.resolve(root,relative));
    if(!file.startsWith(root+path.sep)||!types[path.extname(file).toLowerCase()])throw new Error('Invalid media path');
    info=await stat(file);
    if(!info.isFile())throw new Error('Invalid media file');
  }catch{
    res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:'Медиа не найдено.');return true;
  }
  const etag=`W/"${info.size}-${Math.trunc(info.mtimeMs)}"`;
  const headers={'Content-Type':types[path.extname(file).toLowerCase()],'Accept-Ranges':'bytes','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff','Last-Modified':info.mtime.toUTCString(),'ETag':etag};
  if(req.headers['if-none-match']===etag){res.writeHead(304,headers);res.end();return true;}
  let start=0,end=info.size-1,status=200;
  const range=req.headers.range;
  const ifRange=req.headers['if-range'];
  // A weak ETag is valid for cache revalidation, but not as an If-Range validator.
  const useRange=range&&(!ifRange||Date.parse(ifRange)>=Math.trunc(info.mtimeMs/1000)*1000);
  if(useRange){
    const match=range.match(/^bytes=(\d*)-(\d*)$/);
    if(match&&(match[1]||match[2])){
      if(!match[1]){const suffix=Number(match[2]);start=Math.max(0,info.size-suffix);if(!suffix)start=info.size;}
      else{start=Number(match[1]);if(match[2])end=Math.min(Number(match[2]),end);}
    }else start=info.size;
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=info.size||end<start){
      res.writeHead(416,{...headers,'Content-Range':`bytes */${info.size}`,'Content-Length':'0'});res.end();return true;
    }
    status=206;headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;
  }
  headers['Content-Length']=String(Math.max(0,end-start+1));
  res.writeHead(status,headers);
  if(req.method==='HEAD'||!info.size){res.end();return true;}
  try{await pipeline(createReadStream(file,{start,end}),res);}catch(error){if(!res.destroyed)res.destroy(error);}
  return true;
}
