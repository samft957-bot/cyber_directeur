'use strict';
// CyberDirecteur — Accès Premium vérifié par Stripe, sans secret dans le navigateur.
const express = require('express');
const Stripe = require('stripe');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const app = express();
app.disable('x-powered-by');
const PORT = Number(process.env.PORT || 3000);
const SITE_URL = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
const secret = process.env.SESSION_SECRET || '';
const stripeKey = process.env.STRIPE_SECRET_KEY || '';
const prices = {
 monthly: process.env.STRIPE_PRICE_MONTHLY || process.env.STRIPE_PRICE_ID || '',
 annual: process.env.STRIPE_PRICE_ANNUAL || '',
 lifetime: process.env.STRIPE_PRICE_LIFETIME || ''
};
const expectedProducts = {monthly:'prod_VUiq9YfDbrgA2f',annual:'prod_VUicouxQJ4T45V',lifetime:'prod_VUitLfHuBTmPmr'};
const recurring = new Set(['monthly']);
// Prix affichés : on refuse un tarif Stripe dont le montant serait différent.
const expectedAmounts = {monthly:500, annual:2500, lifetime:4000};
const validPlan = p => Object.prototype.hasOwnProperty.call(prices,p);
const accessCookieYears = 10;
const stripe = stripeKey ? new Stripe(stripeKey) : null;
const secured = SITE_URL.startsWith('https://');
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'premium.json'), 'utf8'));
if (!secret || secret.length < 32) console.warn('SESSION_SECRET manquant ou trop court : Stripe inaccessible.');
const configured = () => Boolean(stripe && secret.length >= 32);
const ready = p => configured() && validPlan(p) && Boolean(prices[p]);
const hmac = value => crypto.createHmac('sha256', secret).update(value).digest('hex');
function sign(value) {return `${value}.${hmac(value)}`;}
function verify(value) {if(typeof value !== 'string') return null;const dot=value.lastIndexOf('.');if(dot<0)return null;const val=value.slice(0,dot),mac=value.slice(dot+1),valid=hmac(val);if(mac.length!==valid.length)return null;return crypto.timingSafeEqual(Buffer.from(mac),Buffer.from(valid))?val:null;}
function cookies(req){const out={};for(const part of (req.headers.cookie||'').split(';')){let p=part.indexOf('=');if(p>=0){try{out[part.slice(0,p).trim()]=decodeURIComponent(part.slice(p+1))}catch{}}}return out;}
function setCookie(res,key,val,maxAge){res.cookie(key,val,{httpOnly:true,secure:secured,sameSite:'lax',path:'/',maxAge});}
function requireOrigin(req,res,next){if(req.method==='POST'&&req.get('origin')!==SITE_URL)return res.status(403).json({error:'Origine refusée'});next();}
const api = express.Router();
api.use(express.json({limit:'10kb'}));
api.use((req,res,next)=>{res.set('Cache-Control','private, no-store');next()});
api.use(requireOrigin);
async function premiumCustomer(req){
 if(!configured())return null;
 const raw=verify(cookies(req).cd_account);
 if(!raw)return null;
 let token;
 try{token=JSON.parse(Buffer.from(raw,'base64url').toString('utf8'))}catch{return null}
 if(!token||!validPlan(token.plan)||typeof token.customer!=='string'||!token.customer.startsWith('cus_')||token.exp<Date.now())return null;
 if(token.plan==='monthly'){
   if(!ready('monthly'))return null;
   const list=await stripe.subscriptions.list({customer:token.customer,status:'all',limit:100});
   return list.data.some(s=>['active','trialing'].includes(s.status)&&s.items.data.some(i=>i.price.id===prices.monthly))?token.customer:null;
 }
 if(!ready(token.plan)||typeof token.checkout!=='string')return null;
 const session=await stripe.checkout.sessions.retrieve(token.checkout,{expand:['line_items']});
 if(session.mode!=='payment'||session.payment_status!=='paid'||session.customer!==token.customer||session.metadata?.plan!==token.plan)return null;
 if(!session.line_items?.data?.some(x=>x.price?.id===prices[token.plan]))return null;
 if(token.plan==='annual'){
   const expires=new Date(session.created*1000);expires.setUTCFullYear(expires.getUTCFullYear()+1);
   if(Date.now()>=expires.getTime())return null;
 }
 return token.customer;
}
api.get('/subscription/status',async(req,res)=>{try{res.json({premium:Boolean(await premiumCustomer(req)),checkoutReady:configured(),plans:Object.fromEntries(Object.keys(prices).map(p=>[p,ready(p)]))})}catch(e){console.error('status:',e.message);res.status(503).json({premium:false})}});
api.get('/premium/course/:id',async(req,res)=>{try{if(!await premiumCustomer(req))return res.status(403).json({error:'Premium requis'});const i=Number(req.params.id);if(!Number.isInteger(i)||i<0||i>=DATA.premium.length)return res.status(404).json({error:'Cours inconnu'});res.json({html:DATA.premium[i].html})}catch(e){console.error(e.message);res.status(503).json({error:'Validation momentanément indisponible'})}});
api.get('/premium/questions',async(req,res)=>{try{if(!await premiumCustomer(req))return res.status(403).json({error:'Premium requis'});res.json({questions:DATA.questions})}catch(e){console.error(e.message);res.status(503).json({error:'Validation momentanément indisponible'})}});
api.post('/checkout',async(req,res)=>{
 const plan=req.body?.plan;
 if(!validPlan(plan))return res.status(400).json({error:'Formule inconnue'});
 if(!ready(plan))return res.status(503).json({error:'Cette formule n’est pas encore configurée dans Stripe.'});
 try{
  if(await premiumCustomer(req))return res.status(409).json({error:'Premium est déjà actif. Vérifie ton accès avant un nouvel achat.'});
  const price = await stripe.prices.retrieve(prices[plan]);
  const productId=typeof price.product==='string'?price.product:price.product?.id;
  if(!price.active||price.currency!=='eur'||price.unit_amount!==expectedAmounts[plan]||productId!==expectedProducts[plan]||(plan==='monthly'&&price.recurring?.interval!=='month')||(plan!=='monthly'&&price.type!=='one_time'))return res.status(400).json({error:'Le tarif Stripe ne correspond pas au produit, au montant en euros ou au type de paiement prévus.'});
  const nonce=crypto.randomBytes(32).toString('hex');setCookie(res,'cd_checkout',sign(nonce),30*60*1000);
  const mode=recurring.has(plan)?'subscription':'payment';
  const payload={mode,line_items:[{price:prices[plan],quantity:1}],client_reference_id:hmac(nonce),
   success_url:SITE_URL+'/api/checkout/complete?session_id={CHECKOUT_SESSION_ID}',cancel_url:SITE_URL+'/#offres',
   metadata:{plan,product:'CyberDirecteur Premium'}};
  if(mode==='subscription')payload.subscription_data={metadata:{product:'CyberDirecteur Premium',plan}};
  if(mode==='payment')payload.customer_creation='always';
  const session=await stripe.checkout.sessions.create(payload);
  res.json({url:session.url});
 }catch(e){console.error('checkout:',e.message);res.status(502).json({error:'Paiement indisponible. Vérifie le tarif dans Stripe.'})}
});
api.get('/checkout/complete',async(req,res)=>{
 if(!configured())return res.redirect('/#offres');
 try{
  const id=String(req.query.session_id||'');if(!/^cs_(test_|live_)[a-zA-Z0-9]+$/.test(id))return res.redirect('/#offres');
  const nonce=verify(cookies(req).cd_checkout);if(!nonce)return res.redirect('/#offres');
  const session=await stripe.checkout.sessions.retrieve(id,{expand:['line_items']});
  const plan=session.metadata?.plan;
  if(!validPlan(plan)||!ready(plan)||session.client_reference_id!==hmac(nonce)||typeof session.customer!=='string')return res.redirect('/#offres');
  const expectedMode=recurring.has(plan)?'subscription':'payment';
  if(session.mode!==expectedMode||!session.line_items?.data?.some(x=>x.price?.id===prices[plan]))return res.redirect('/#offres');
  if(plan==='monthly'){
   const sub=await stripe.subscriptions.retrieve(session.subscription);
   if(!['active','trialing'].includes(sub.status)||!sub.items.data.some(i=>i.price.id===prices.monthly))return res.redirect('/#offres');
  } else if(session.payment_status!=='paid')return res.redirect('/#offres');
  const exp=Date.now()+accessCookieYears*365*24*60*60*1000;
  const ticket=Buffer.from(JSON.stringify({customer:session.customer,checkout:id,plan,exp})).toString('base64url');
  setCookie(res,'cd_account',sign(ticket),accessCookieYears*365*24*60*60*1000);
  res.clearCookie('cd_checkout',{path:'/'});res.redirect('/#premium');
 }catch(e){console.error('checkout complete:',e.message);res.redirect('/#offres')}
});
api.post('/portal',async(req,res)=>{
 if(!configured())return res.status(503).json({error:'Stripe non configuré'});
 try{const customer=await premiumCustomer(req);if(!customer)return res.status(403).json({error:'Aucun accès Premium confirmé sur ce navigateur'});const raw=verify(cookies(req).cd_account);const account=JSON.parse(Buffer.from(raw,'base64url').toString('utf8'));if(account.plan!=='monthly')return res.status(400).json({error:'Les paiements ponctuels ne se renouvellent pas et ne nécessitent pas de portail d’abonnement.'});const session=await stripe.billingPortal.sessions.create({customer,return_url:SITE_URL+'/#offres'});res.json({url:session.url})}catch(e){console.error('portal:',e.message);res.status(502).json({error:'Portail indisponible'})}
});
app.use('/api',api);
// Fichiers publics autorisés : le fichier premium.json et les secrets ne sont JAMAIS exposés.
app.get('/', (req,res) => res.sendFile(path.join(__dirname, 'index.html')));
for (const file of ['index.html', 'style.css', 'script.js']) {
  app.get('/' + file, (req,res) => res.sendFile(path.join(__dirname, file)));
}
app.use((req,res)=>res.status(404).send('Page introuvable'));
app.listen(PORT,()=>console.log('CyberDirecteur écoute sur http://localhost:'+PORT));
