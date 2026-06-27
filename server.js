/* KITHOME — backend local sécurisé (Node 18+)
   La clé Gemini reste côté serveur (variable d'environnement GEMINI_API_KEY),
   jamais exposée au navigateur.
   Lancement :
     GEMINI_API_KEY=ta_cle  node server.js
   puis ouvrir http://localhost:3000
*/
const http = require('http');
const fs   = require('fs');
const path = require('path');

const KEY = process.env.GEMINI_API_KEY || '';
const PORT = process.env.PORT || 3000;
const TEXT_MODEL  = 'gemini-2.0-flash';
const IMAGE_MODEL = 'gemini-2.0-flash-preview-image-generation';
const MIME = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};

function readBody(req){return new Promise(r=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>r(b));});}
function splitData(d){const m=(d||'').match(/^data:(.+?);base64,(.+)$/);return m?{mime:m[1],data:m[2]}:null;}

async function gemini(model,payload){
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!r.ok) throw new Error('Gemini '+r.status+' '+(await r.text()).slice(0,200));
  return r.json();
}

const server = http.createServer(async (req,res)=>{
  // ---- API ----
  if(req.method==='POST' && req.url.startsWith('/api/')){
    if(!KEY){res.writeHead(500,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'GEMINI_API_KEY manquante'}));}
    try{
      const body=JSON.parse(await readBody(req)||'{}');
      if(req.url==='/api/suggest'){
        const parts=[{text:`Tu es décorateur. Pièce : "${body.description||''}". Liste UNIQUEMENT et EXACTEMENT les meubles présents. `+
          `Pour chacun, donne l'équivalent réel chez IKEA et chez Maisons du Monde. `+
          `Réponds UNIQUEMENT par un tableau JSON d'objets {"object":"Canapé","ikea":{"name":"KIVIK","price":"599 €","query":"KIVIK canapé"},"mdm":{"name":"Canapé en lin","price":"899 €","query":"canapé lin"}}.`}];
        const img=splitData(body.image); if(img) parts.push({inline_data:{mime_type:img.mime,data:img.data}});
        const d=await gemini(TEXT_MODEL,{contents:[{parts}]});
        let txt=(d.candidates?.[0]?.content?.parts?.[0]?.text||'').replace(/```json|```/g,'').trim();
        res.writeHead(200,{'Content-Type':'application/json'});
        return res.end(JSON.stringify({items:JSON.parse(txt)}));
      }
      if(req.url==='/api/generate'){
        const parts=[{text: body.prompt || `Photo d'intérieur réaliste et lumineuse. ${body.description||''}. Meubles : ${(body.furniture||[]).join(', ')}. Déco haut de gamme.`}];
        const img=splitData(body.image); if(img) parts.push({inline_data:{mime_type:img.mime,data:img.data}});
        const d=await gemini(IMAGE_MODEL,{contents:[{parts}],generationConfig:{responseModalities:['TEXT','IMAGE']}});
        const ps=d.candidates?.[0]?.content?.parts||[];
        const im=ps.find(p=>p.inline_data?.data||p.inlineData?.data);
        const data=im&&(im.inline_data?.data||im.inlineData?.data);
        if(!data) throw new Error('Aucune image renvoyée');
        res.writeHead(200,{'Content-Type':'application/json'});
        return res.end(JSON.stringify({image:'data:image/png;base64,'+data}));
      }
      res.writeHead(404);return res.end();
    }catch(e){res.writeHead(500,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:String(e.message||e)}));}
  }
  // ---- fichiers statiques ----
  let f=decodeURIComponent(req.url.split('?')[0]); if(f==='/') f='/index.html';
  const fp=path.join(__dirname,path.normalize(f));
  if(!fp.startsWith(__dirname)){res.writeHead(403);return res.end();}
  fs.readFile(fp,(err,data)=>{
    if(err){res.writeHead(404);return res.end('Not found');}
    res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});
    res.end(data);
  });
});
server.listen(PORT,()=>console.log(`KITHOME → http://localhost:${PORT}  (clé ${KEY?'OK':'MANQUANTE'})`));
