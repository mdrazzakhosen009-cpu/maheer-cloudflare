const express=require('express');
const path=require('path');
const crypto=require('crypto');
const multer=require('multer');
const {createClient}=require('@libsql/client');

const app=express();
const PORT=Number(process.env.PORT||3000);
let runtimeEnv={};
let db=null;
const env=k=>String((runtimeEnv && runtimeEnv[k] !== undefined ? runtimeEnv[k] : process.env[k]) || '').trim();
function configureRuntime(input={}){
  runtimeEnv=input||{};
  const url=env('TURSO_DATABASE_URL');
  const token=env('TURSO_AUTH_TOKEN');
  if(!url||!token) throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required.');
  db=createClient({url,authToken:token});
  initPromise=null;
  return true;
}
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024}});
const chatSessions=new Map();
let initPromise=null;
const cache={settings:null,settingsAt:0,products:null,productsAt:0};
const now=()=>new Date().toISOString();
const sha256=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const randomToken=()=>crypto.randomBytes(32).toString('hex');
async function exec(sql,args=[]){if(!db)throw new Error('Database is not configured.');return db.execute({sql,args})}
async function one(sql,args=[]){const r=await exec(sql,args);return r.rows[0]||null}
async function many(sql,args=[]){const r=await exec(sql,args);return r.rows}
function bust(){cache.settings=null;cache.products=null}
async function getSettings(){if(cache.settings&&Date.now()-cache.settingsAt<15000)return cache.settings;cache.settings=Object.fromEntries((await many('SELECT key,value FROM settings')).map(x=>[x.key,x.value]));cache.settingsAt=Date.now();return cache.settings}
async function getProducts(){if(cache.products&&Date.now()-cache.productsAt<10000)return cache.products;cache.products=await many('SELECT * FROM products ORDER BY featured DESC,is_new DESC,id DESC');cache.productsAt=Date.now();return cache.products}
async function requireAdmin(req,res,next){try{const t=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();if(!t)return res.status(401).json({error:'অ্যাডমিন সেশন শেষ হয়েছে। আবার লগইন করুন।'});const row=await one('SELECT token_hash,expires_at FROM admin_sessions WHERE token_hash=?',[sha256(t)]);if(!row||new Date(row.expires_at).getTime()<Date.now()){if(row)await exec('DELETE FROM admin_sessions WHERE token_hash=?',[sha256(t)]);return res.status(401).json({error:'অ্যাডমিন সেশন শেষ হয়েছে। আবার লগইন করুন।'});}next()}catch(e){res.status(500).json({error:'অ্যাডমিন সেশন যাচাই করা যায়নি।'})}}
function imageData(file){if(!file||!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype))throw Error('JPG, PNG, WEBP বা GIF ছবি দিন।');return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`}

async function initDatabase(){
  await exec(`CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY,password_hash TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`);
  await exec(`CREATE TABLE IF NOT EXISTS admin_sessions(token_hash TEXT PRIMARY KEY,expires_at TEXT NOT NULL,created_at TEXT NOT NULL)`);
  await exec(`CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,price REAL NOT NULL DEFAULT 0,old_price REAL NOT NULL DEFAULT 0,category TEXT NOT NULL DEFAULT 'স্কিন কেয়ার',tags TEXT NOT NULL DEFAULT '',description TEXT NOT NULL DEFAULT '',image TEXT NOT NULL DEFAULT '',featured INTEGER NOT NULL DEFAULT 0,is_new INTEGER NOT NULL DEFAULT 1,stock INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`);
  await exec(`CREATE TABLE IF NOT EXISTS agents(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',whatsapp TEXT NOT NULL DEFAULT '',messenger TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`);
  await exec(`CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,order_code TEXT UNIQUE NOT NULL,customer_name TEXT NOT NULL,phone TEXT NOT NULL,address TEXT NOT NULL,items_json TEXT NOT NULL,subtotal REAL NOT NULL,delivery_fee REAL NOT NULL DEFAULT 0,total REAL NOT NULL,payment_method TEXT NOT NULL DEFAULT 'COD',transaction_id TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'Pending',created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`);
  await exec(`CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY AUTOINCREMENT,customer_name TEXT NOT NULL,rating INTEGER NOT NULL,comment TEXT NOT NULL,approved INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL)`);
  await exec(`CREATE TABLE IF NOT EXISTS customer_chats(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT NOT NULL,customer_name TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',message TEXT NOT NULL,reply TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL)`);
  await exec(`CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)`);
  if(!await one('SELECT id FROM admins WHERE id=1')){const p=env('ADMIN_PASSWORD');if(!p)throw Error('ADMIN_PASSWORD is required on first startup.');await exec('INSERT INTO admins(id,password_hash,created_at,updated_at) VALUES(1,?,?,?)',[sha256(p),now(),now()])}
  const defaults={
    store_name:'MAHEER STORE',site_language:'bn',store_tagline:'প্রিমিয়াম স্কিন কেয়ার সংগ্রহ',
    about_store:'মাহীর স্টোরে আপনাদের স্বাগতম। আমাদের এখানে বিভিন্ন ধরনের স্কিন কেয়ার প্রোডাক্ট বিক্রি করা হয়। যে কোনো ধরনের তথ্য বা অর্ডার সহায়তার জন্য আমাদের এজেন্টের সাথে যোগাযোগ করুন।',
    store_info:'মাহীর স্টোরে ফেসওয়াশ, সিরাম, ময়েশ্চারাইজার, সানস্ক্রিন, ফেস মাস্ক, আই কেয়ার, লিপ কেয়ার, টোনার, জেল ও অন্যান্য স্কিন কেয়ার প্রোডাক্ট পাওয়া যায়।',
    delivery_time:'ঢাকার ভিতরে ১–২ দিন, ঢাকার বাইরে ২–৪ দিন।',delivery_fee:'80',
    bkash_number:'',nagad_number:'',rocket_number:'',cod_enabled:'true',
    whatsapp_link:'',instagram_link:'',tiktok_link:'',facebook_link:'',
    chatbot_delivery:'ঢাকার ভিতরে ১–২ দিন, ঢাকার বাইরে ২–৪ দিন।',
    chatbot_store:'ফেসওয়াশ, সিরাম, ময়েশ্চারাইজার, সানস্ক্রিন, মাস্ক, আই কেয়ার, লিপ কেয়ার, টোনার, জেলসহ বিভিন্ন স্কিন কেয়ার প্রোডাক্ট।',
    chatbot_agent:'প্রয়োজনে আমাদের Agent-এর সাথে সরাসরি যোগাযোগ করতে পারেন।'
  };
  for(const[k,v]of Object.entries(defaults))if(!await one('SELECT key FROM settings WHERE key=?',[k]))await exec('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)',[k,String(v),now()]);
}
app.use(express.json({limit:'16mb'}));app.use(express.urlencoded({extended:true,limit:'16mb'}));app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');next()});
async function ensureDatabase(){if(!db)throw new Error('Database is not configured.');if(!initPromise)initPromise=initDatabase();return initPromise}
app.use(async(req,res,next)=>{try{await ensureDatabase();next()}catch(e){console.error('Startup failed:',e);res.status(500).json({error:'Database initialization failed.',detail:String(e.message||e)})}});
app.get('/api/health',async(req,res)=>{try{await one('SELECT 1');res.json({ok:true,database:'turso'})}catch(e){res.status(500).json({ok:false,error:'Turso connection failed'})}});
app.get('/api/settings',async(req,res)=>{try{res.json(await getSettings())}catch(e){res.status(500).json({error:'সেটিংস লোড করা যায়নি।'})}});
app.get('/api/products',async(req,res)=>{try{const all=await getProducts(),q=String(req.query.search||'').trim().toLowerCase(),cat=String(req.query.category||'').trim();let out=all;if(q)out=out.filter(p=>`${p.name} ${p.category} ${p.tags} ${p.description}`.toLowerCase().includes(q));if(cat)out=out.filter(p=>p.category===cat);res.json(out)}catch(e){res.status(500).json({error:'পণ্য লোড করা যায়নি।'})}});
app.get('/api/agents',async(req,res)=>{try{res.json(await many('SELECT * FROM agents WHERE active=1 ORDER BY id DESC'))}catch(e){res.status(500).json({error:'এজেন্ট লোড করা যায়নি।'})}});
app.get('/api/reviews',async(req,res)=>{try{const rows=await many('SELECT id,customer_name,rating,comment,created_at FROM reviews WHERE approved=1 ORDER BY id DESC');const avg=rows.length?rows.reduce((s,x)=>s+Number(x.rating),0)/rows.length:0;res.json({reviews:rows,average:Number(avg.toFixed(1)),count:rows.length})}catch(e){res.status(500).json({error:'রিভিউ লোড করা যায়নি।'})}});
app.post('/api/reviews',async(req,res)=>{try{const name=String(req.body?.customer_name||'').trim(),comment=String(req.body?.comment||'').trim(),rating=Number(req.body?.rating);if(name.length<2||name.length>80)return res.status(400).json({error:'সঠিক নাম দিন।'});if(!Number.isInteger(rating)||rating<1||rating>5)return res.status(400).json({error:'১ থেকে ৫ স্টার দিন।'});if(comment.length<3||comment.length>500)return res.status(400).json({error:'রিভিউ ৩–৫০০ অক্ষরের মধ্যে দিন।'});await exec('INSERT INTO reviews(customer_name,rating,comment,approved,created_at) VALUES(?,?,?,?,?)',[name,rating,comment,1,now()]);res.json({ok:true,message:'আপনার রিভিউ সফলভাবে যোগ হয়েছে।'})}catch(e){res.status(500).json({error:'রিভিউ সংরক্ষণ করা যায়নি।'})}});

async function createOrder(body){
  const items=Array.isArray(body.items)?body.items:[];if(!body.customer_name||!body.phone||!body.address||!items.length)throw Error('নাম, মোবাইল, ঠিকানা এবং কমপক্ষে একটি পণ্য লাগবে।');
  const ids=[...new Set(items.map(x=>Number(x.id)).filter(Number.isInteger))];if(!ids.length)throw Error('সঠিক পণ্য নির্বাচন করুন।');
  const ps=await many(`SELECT * FROM products WHERE id IN (${ids.map(()=>'?').join(',')})`,ids);const map=new Map(ps.map(p=>[Number(p.id),p]));
  const clean=[];let subtotal=0;
  for(const x of items){const p=map.get(Number(x.id));if(!p)throw Error('একটি পণ্য পাওয়া যায়নি।');const qty=Math.max(1,Math.min(9999,Number(x.qty||x.quantity||1)));if(Number(p.stock)>0&&qty>Number(p.stock))throw Error(`${p.name}-এর পর্যাপ্ত stock নেই।`);subtotal+=Number(p.price)*qty;clean.push({id:p.id,name:p.name,price:Number(p.price),qty,image:p.image})}
  const s=await getSettings(),method=String(body.payment_method||'COD');const allowed=['COD','bKash','Nagad','Rocket'];if(!allowed.includes(method))throw Error('এই payment method available নয়।');if(method!=='COD'&&!String(body.transaction_id||'').trim())throw Error('Online payment হলে Transaction ID দিন।');
  const delivery=Number(s.delivery_fee||0),total=subtotal+delivery;const max=await one('SELECT MAX(id) id FROM orders');const code=`MAH-${String(Number(max?.id||0)+1).padStart(6,'0')}`;
  await exec('INSERT INTO orders(order_code,customer_name,phone,address,items_json,subtotal,delivery_fee,total,payment_method,transaction_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[code,String(body.customer_name).trim(),String(body.phone).trim(),String(body.address).trim(),JSON.stringify(clean),subtotal,delivery,total,method,String(body.transaction_id||'').trim(),'Pending',now(),now()]);
  for(const x of clean){const p=map.get(Number(x.id));if(Number(p.stock)>0)await exec('UPDATE products SET stock=MAX(0,stock-?),updated_at=? WHERE id=?',[x.qty,now(),x.id])}
  bust();return{order_id:code,total,delivery_fee:delivery};
}
app.post('/api/orders',async(req,res)=>{try{res.json({ok:true,...await createOrder(req.body||{})})}catch(e){res.status(400).json({error:e.message})}});
app.get('/api/orders/:code',async(req,res)=>{try{const o=await one('SELECT * FROM orders WHERE order_code=?',[String(req.params.code).toUpperCase()]);if(!o)return res.status(404).json({error:'অর্ডার পাওয়া যায়নি।'});o.items=JSON.parse(o.items_json);delete o.items_json;res.json(o)}catch(e){res.status(500).json({error:'অর্ডার লোড করা যায়নি।'})}});

app.post('/api/admin/login',async(req,res)=>{try{const a=await one('SELECT password_hash FROM admins WHERE id=1');if(!a||sha256(req.body?.password||'')!==a.password_hash)return res.status(401).json({error:'পাসওয়ার্ড সঠিক নয়।'});const t=randomToken(),expires=new Date(Date.now()+7*24*60*60*1000).toISOString();await exec('DELETE FROM admin_sessions WHERE expires_at < ?',[now()]);await exec('INSERT INTO admin_sessions(token_hash,expires_at,created_at) VALUES(?,?,?)',[sha256(t),expires,now()]);res.json({ok:true,token:t})}catch(e){res.status(500).json({error:'লগইন করা যায়নি।'})}});
app.post('/api/admin/logout',requireAdmin,async(req,res)=>{try{const t=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();await exec('DELETE FROM admin_sessions WHERE token_hash=?',[sha256(t)]);res.json({ok:true})}catch(e){res.status(500).json({error:'লগআউট করা যায়নি।'})}});
app.post('/api/admin/password',requireAdmin,async(req,res)=>{try{const a=await one('SELECT password_hash FROM admins WHERE id=1');if(sha256(req.body?.old_password||'')!==a.password_hash)return res.status(401).json({error:'বর্তমান পাসওয়ার্ড সঠিক নয়।'});const n=String(req.body?.new_password||'');if(n.length<6)return res.status(400).json({error:'নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।'});await exec('UPDATE admins SET password_hash=?,updated_at=? WHERE id=1',[sha256(n),now()]);await exec('DELETE FROM admin_sessions');res.json({ok:true})}catch(e){res.status(500).json({error:'পাসওয়ার্ড পরিবর্তন করা যায়নি।'})}});
app.get('/api/admin/dashboard',requireAdmin,async(req,res)=>{try{const[o,p,a,c,r,rv]=await Promise.all([one('SELECT COUNT(*) c FROM orders'),one('SELECT COUNT(*) c FROM products'),one('SELECT COUNT(*) c FROM agents'),one('SELECT COUNT(DISTINCT phone) c FROM orders'),one("SELECT COALESCE(SUM(total),0) revenue FROM orders WHERE status!='Cancelled'"),one('SELECT COUNT(*) c FROM reviews')]);res.json({orders:Number(o.c),products:Number(p.c),agents:Number(a.c),customers:Number(c.c),revenue:Number(r.revenue),reviews:Number(rv.c)})}catch(e){res.status(500).json({error:'ড্যাশবোর্ড লোড করা যায়নি।'})}});
app.get('/api/admin/orders',requireAdmin,async(req,res)=>{try{res.json(await many('SELECT * FROM orders ORDER BY id DESC'))}catch(e){res.status(500).json({error:'অর্ডার লোড করা যায়নি।'})}});
app.patch('/api/admin/orders/:id',requireAdmin,async(req,res)=>{try{const allowed=['Pending','Confirmed','Shipped','Delivered','Cancelled'],s=allowed.includes(req.body?.status)?req.body.status:'Pending';await exec('UPDATE orders SET status=?,updated_at=? WHERE id=?',[s,now(),Number(req.params.id)]);res.json({ok:true})}catch(e){res.status(500).json({error:'অর্ডার আপডেট করা যায়নি।'})}});
app.get('/api/admin/products',requireAdmin,async(req,res)=>{try{res.json(await many('SELECT * FROM products ORDER BY id DESC'))}catch(e){res.status(500).json({error:'পণ্য লোড করা যায়নি।'})}});
app.post('/api/admin/products',requireAdmin,upload.single('image'),async(req,res)=>{try{const b=req.body;if(!String(b.name||'').trim())throw Error('পণ্যের নাম দিন।');await exec('INSERT INTO products(name,price,old_price,category,tags,description,image,featured,is_new,stock,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[String(b.name).trim(),Number(b.price)||0,Number(b.old_price)||0,String(b.category||'স্কিন কেয়ার'),String(b.tags||''),String(b.description||''),req.file?imageData(req.file):String(b.image||''),b.featured==='true'?1:0,b.is_new==='false'?0:1,Math.max(0,Number(b.stock)||0),now(),now()]);bust();res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}});
app.put('/api/admin/products/:id',requireAdmin,upload.single('image'),async(req,res)=>{try{const old=await one('SELECT * FROM products WHERE id=?',[Number(req.params.id)]);if(!old)return res.status(404).json({error:'পণ্য পাওয়া যায়নি।'});const b=req.body;await exec('UPDATE products SET name=?,price=?,old_price=?,category=?,tags=?,description=?,image=?,featured=?,is_new=?,stock=?,updated_at=? WHERE id=?',[String(b.name||old.name).trim(),Number(b.price)||0,Number(b.old_price)||0,String(b.category||old.category),String(b.tags||''),String(b.description||''),req.file?imageData(req.file):String(old.image||''),b.featured==='true'?1:0,b.is_new==='false'?0:1,Math.max(0,Number(b.stock)||0),now(),Number(req.params.id)]);bust();res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}});
app.delete('/api/admin/products/:id',requireAdmin,async(req,res)=>{try{await exec('DELETE FROM products WHERE id=?',[Number(req.params.id)]);bust();res.json({ok:true})}catch(e){res.status(500).json({error:'পণ্য মুছে ফেলা যায়নি।'})}});
app.get('/api/admin/agents',requireAdmin,async(req,res)=>{try{res.json(await many('SELECT * FROM agents ORDER BY id DESC'))}catch(e){res.status(500).json({error:'এজেন্ট লোড করা যায়নি।'})}});
app.post('/api/admin/agents',requireAdmin,async(req,res)=>{try{const b=req.body;if(!String(b.name||'').trim())throw Error('এজেন্টের নাম দিন।');await exec('INSERT INTO agents(name,phone,whatsapp,messenger,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',[b.name,b.phone||'',b.whatsapp||'',b.messenger||'',b.active===false?0:1,now(),now()]);res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}});
app.put('/api/admin/agents/:id',requireAdmin,async(req,res)=>{try{const b=req.body;await exec('UPDATE agents SET name=?,phone=?,whatsapp=?,messenger=?,active=?,updated_at=? WHERE id=?',[b.name,b.phone||'',b.whatsapp||'',b.messenger||'',b.active?1:0,now(),Number(req.params.id)]);res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}});
app.delete('/api/admin/agents/:id',requireAdmin,async(req,res)=>{try{await exec('DELETE FROM agents WHERE id=?',[Number(req.params.id)]);res.json({ok:true})}catch(e){res.status(500).json({error:'এজেন্ট মুছে ফেলা যায়নি।'})}});
app.get('/api/admin/reviews',requireAdmin,async(req,res)=>{try{res.json(await many('SELECT * FROM reviews ORDER BY id DESC'))}catch(e){res.status(500).json({error:'রিভিউ লোড করা যায়নি।'})}});
app.patch('/api/admin/reviews/:id',requireAdmin,async(req,res)=>{try{await exec('UPDATE reviews SET approved=? WHERE id=?',[req.body?.approved?1:0,Number(req.params.id)]);res.json({ok:true})}catch(e){res.status(500).json({error:'রিভিউ আপডেট করা যায়নি।'})}});
app.delete('/api/admin/reviews/:id',requireAdmin,async(req,res)=>{try{await exec('DELETE FROM reviews WHERE id=?',[Number(req.params.id)]);res.json({ok:true})}catch(e){res.status(500).json({error:'রিভিউ মুছে ফেলা যায়নি।'})}});
app.put('/api/admin/settings',requireAdmin,async(req,res)=>{try{for(const[k,v]of Object.entries(req.body||{})){if(!/^[a-z_]+$/.test(k))continue;await exec('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',[k,String(v),now()])}bust();res.json({ok:true})}catch(e){res.status(500).json({error:'সেটিংস সংরক্ষণ করা যায়নি।'})}});

async function gemini(contents,systemInstruction,tools=[]){
  const key=env('GEMINI_API_KEY');if(!key)throw Error('GEMINI_API_KEY missing');
  const model=env('GEMINI_MODEL')||'gemini-3.1-flash-lite';
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const body={systemInstruction:{parts:[{text:systemInstruction}]},contents,generationConfig:{temperature:0.2,maxOutputTokens:600}};if(tools.length)body.tools=[{functionDeclarations:tools}];
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const text=await r.text();if(!r.ok)throw Error(text);return JSON.parse(text)
}
function relevantProducts(products,msg){const q=String(msg||'').toLowerCase().trim(),words=q.split(/[^\p{L}\p{N}%]+/u).filter(x=>x.length>1);if(!words.length)return products.slice(0,8);const scored=products.map(p=>{const h=`${p.name} ${p.category} ${p.tags} ${p.description}`.toLowerCase();let s=0;for(const w of words)if(h.includes(w))s+=2;return{p,s}}).sort((a,b)=>b.s-a.s);const m=scored.filter(x=>x.s>0).slice(0,8).map(x=>x.p);return m.length?m:products.slice(0,8)}
const orderTool={name:'create_order',description:'Create a real customer order in MAHEER STORE after the customer has provided all required details AND explicitly confirmed the final order summary. Never call this before explicit confirmation.',parameters:{type:'OBJECT',properties:{customer_name:{type:'STRING',description:'Customer full name'},phone:{type:'STRING',description:'Customer mobile number'},address:{type:'STRING',description:'Complete delivery address'},items:{type:'ARRAY',description:'Products to order using exact catalog IDs and quantities',items:{type:'OBJECT',properties:{id:{type:'INTEGER'},qty:{type:'INTEGER'}},required:['id','qty']}},payment_method:{type:'STRING',enum:['COD','bKash','Nagad','Rocket']},transaction_id:{type:'STRING',description:'Required for online payment; empty for COD'}},required:['customer_name','phone','address','items','payment_method','transaction_id']}};
async function saveChat(sessionId,message,reply,customer={}){try{await exec('INSERT INTO customer_chats(session_id,customer_name,phone,message,reply,created_at) VALUES(?,?,?,?,?,?)',[String(sessionId||'').slice(0,100),String(customer.name||'').slice(0,120),String(customer.phone||'').slice(0,40),String(message||'').slice(0,4000),String(reply||'').slice(0,8000),now()])}catch(e){console.error('CHAT SAVE:',e.message)}}
app.get('/api/admin/chats',requireAdmin,async(req,res)=>{try{res.json(await many('SELECT * FROM customer_chats ORDER BY id DESC LIMIT 300'))}catch(e){res.status(500).json({error:'কাস্টমার চ্যাট লোড করা যায়নি।'})}});

app.post('/api/chat',async(req,res)=>{
  const session=String(req.body?.session||'guest').slice(0,100),message=String(req.body?.message||'').trim();if(!message)return res.status(400).json({error:'বার্তা লিখুন।'});
  try{
    const cfg=await getSettings(),products=await getProducts(),rel=relevantProducts(products,message);
    const catalog=rel.map(p=>`ID ${p.id}: ${p.name} | দাম ৳${p.price}${p.old_price?` | আগের দাম ৳${p.old_price}`:''} | বিভাগ ${p.category} | stock ${p.stock>0?p.stock:'নেই'} | ${p.description}`).join('\n');
    const system=`তুমি MAHEER STORE-এর official customer support ও order-taking assistant। গ্রাহকের ভাষায় সংক্ষিপ্ত, পরিষ্কার ও ভদ্রভাবে উত্তর দাও। Store তথ্য বা product facts বানাবে না।\n\nতিন ধরনের quick-help intent আছে: delivery time, store info (কী কী বিক্রি হয়), এবং order। Delivery: ${cfg.chatbot_delivery||cfg.delivery_time}. Store info: ${cfg.chatbot_store||cfg.store_info}. Agent: ${cfg.chatbot_agent}. Payment: COD=${cfg.cod_enabled==='true'?'চালু':'বন্ধ'}, bKash=${cfg.bkash_number||'সেট করা নেই'}, Nagad=${cfg.nagad_number||'সেট করা নেই'}, Rocket=${cfg.rocket_number||'সেট করা নেই'}.\n\nORDER RULES: customer order করতে চাইলে product, quantity, name, phone, full address এবং payment method সংগ্রহ করো। Online payment হলে transaction ID নাও। সব তথ্য পাওয়ার পর একটি final summary দেখিয়ে স্পষ্টভাবে জিজ্ঞেস করো 'অর্ডারটি নিশ্চিত করবেন?' Customer-এর explicit yes/confirm/নিশ্চিত করছি না পাওয়া পর্যন্ত create_order call করবে না। Confirmation পাওয়ার পর exact catalog ID/quantity ব্যবহার করে create_order call করো। Tool সফল হলে order code ও total জানাও এবং বলো order tracking-এ code ব্যবহার করা যাবে। Website cart/checkout-এর কথা না বলে chat থেকেই order নেওয়ার চেষ্টা করো।\n\nCATALOG:\n${catalog}`;
    const history=chatSessions.get(session)||[];const contents=[...history.slice(-10),{role:'user',parts:[{text:message}]}];
    let data=await gemini(contents,system,[orderTool]),candidate=data.candidates?.[0]?.content;let call=candidate?.parts?.find(p=>p.functionCall)?.functionCall;
    if(call&&call.name==='create_order'){
      let result;try{result=await createOrder(call.args||{});result={success:true,...result}}catch(e){result={success:false,error:e.message}}
      const modelContent=candidate;contents.push(modelContent,{role:'user',parts:[{functionResponse:{name:'create_order',response:result}}]});
      data=await gemini(contents,system,[orderTool]);candidate=data.candidates?.[0]?.content;
      const reply=candidate?.parts?.map(p=>p.text||'').join('')|| (result.success?`অর্ডার সফল হয়েছে। আপনার অর্ডার নম্বর ${result.order_id} এবং মোট ৳${Number(result.total).toLocaleString()}।`:`অর্ডারটি সম্পন্ন করা যায়নি: ${result.error}`);
      chatSessions.set(session,[...contents,candidate].slice(-12));await saveChat(session,message,reply,{name:call.args?.customer_name||'',phone:call.args?.phone||''});return res.json({reply,order:result.success?result:null});
    }
    const reply=candidate?.parts?.map(p=>p.text||'').join('')||'আপনাকে কীভাবে সাহায্য করতে পারি?';chatSessions.set(session,[...contents,candidate].slice(-12));await saveChat(session,message,reply);res.json({reply})
  }catch(e){console.error('CHAT:',e.message);try{const s=await getSettings();res.json({reply:`এই মুহূর্তে এআই উত্তর দিতে পারছে না। ${s.chatbot_agent||'দয়া করে Agent-এর সাথে যোগাযোগ করুন।'}`})}catch{res.json({reply:'এই মুহূর্তে এআই উত্তর দিতে পারছে না।'})}}
});

app.use('/admin',express.static(path.join(__dirname,'admin')));app.use(express.static(path.join(__dirname,'public')));
app.get('/admin/*',(req,res)=>res.sendFile(path.join(__dirname,'admin','index.html')));app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.configureRuntime=configureRuntime;
module.exports=app;
if(require.main===module){configureRuntime(process.env);ensureDatabase().then(()=>app.listen(PORT,()=>console.log(`MAHEER STORE running on ${PORT}; Turso connected.`))).catch(e=>{console.error('Startup failed:',e);process.exit(1)})}
