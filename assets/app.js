let currentUser = null;
let stock = [];
let customers = [];
let customerPurchaseItems = [];
let userProfile = {};

const $ = (id) => document.getElementById(id);
const API_BASE = location.origin + "/api";
const SESSION_KEY = "essenza_session_uid";

function money(v){ return Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }
function normalizeText(text){ return String(text||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[®™️]/g,"").trim(); }
function today(){ return new Date().toISOString().slice(0,10); }
function show(el){ if(el) el.classList.remove("hidden"); }
function hide(el){ if(el) el.classList.add("hidden"); }
function addDays(date, days){
  const d=new Date(`${date || today()}T00:00:00`);
  d.setDate(d.getDate()+Number(days||0));
  return d.toISOString().slice(0,10);
}
function daysUntil(date){
  if(!date) return null;
  const target=new Date(`${date}T00:00:00`);
  const now=new Date(`${today()}T00:00:00`);
  return Math.round((target-now)/(1000*60*60*24));
}

async function request(url, options={}){
  const res = await fetch(url, options);
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || "Erro de comunicação com o servidor.");
  return data;
}

function showAuthMessage(text,type="error"){
  const el=$("authMsg");
  if(!el) return;
  el.textContent=text;
  el.className="msg "+type;
  el.classList.remove("hidden");
}

function banner(text){
  const el=$("setupBanner");
  if(!el) return;
  el.innerHTML=text;
  el.classList.remove("hidden");
}
function hideBanner(){ const el=$("setupBanner"); if(el) el.classList.add("hidden"); }

async function register(){
  try{
    const name=$("displayName").value.trim();
    const email=$("email").value.trim().toLowerCase();
    const password=$("password").value.trim();
    const {user}=await request(`${API_BASE}/auth/register`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({name,email,password})
    });
    localStorage.setItem(SESSION_KEY,user.uid);
    showAuthMessage("Conta criada com sucesso.","success");
    await startSession(user);
  }catch(err){ showAuthMessage("Erro ao criar conta: "+err.message); }
}

async function login(){
  try{
    const email=$("email").value.trim().toLowerCase();
    const password=$("password").value.trim();
    const {user}=await request(`${API_BASE}/auth/login`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({email,password})
    });
    localStorage.setItem(SESSION_KEY,user.uid);
    await startSession(user);
  }catch(err){ showAuthMessage("Erro ao entrar: "+err.message); }
}

function showAuth(){
  currentUser=null;
  hideBanner();
  $("auth").classList.remove("hidden");
  $("app").classList.add("hidden");
}

async function startSession(user){
  currentUser={uid:user.uid,email:user.email,displayName:user.name || user.email};
  $("auth").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("userLabel").textContent=currentUser.displayName || currentUser.email;
  await loadUserData();
  showPage("dashboard");
}

function logout(){
  localStorage.removeItem(SESSION_KEY);
  showAuth();
}

async function loadUserData(){
  if(!currentUser) return;
  try{
    const [profile, rows, customerRows] = await Promise.all([
      request(`${API_BASE}/users/${currentUser.uid}/profile`),
      request(`${API_BASE}/users/${currentUser.uid}/stock`),
      request(`${API_BASE}/users/${currentUser.uid}/customers`)
    ]);
    userProfile = profile || {};
    stock = Array.isArray(rows) ? rows : [];
    customers = Array.isArray(customerRows) ? customerRows : [];
    renderAll();
    renderProfile();
    hideBanner();
  }catch(err){
    banner(`<strong>Erro:</strong> ${err.message}`);
  }
}

async function saveStockRemote(item){
  if(item.id){
    await request(`${API_BASE}/users/${currentUser.uid}/stock/${item.id}`,{
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(item)
    });
  }else{
    await request(`${API_BASE}/users/${currentUser.uid}/stock`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(item)
    });
  }
  stock = await request(`${API_BASE}/users/${currentUser.uid}/stock`);
}

async function deleteStockRemote(id){
  await request(`${API_BASE}/users/${currentUser.uid}/stock/${id}`,{method:"DELETE"});
  stock = stock.filter(i=>i.id!==id);
}

async function saveCustomerRemote(item){
  if(item.id){
    await request(`${API_BASE}/users/${currentUser.uid}/customers/${item.id}`,{
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(item)
    });
  }else{
    await request(`${API_BASE}/users/${currentUser.uid}/customers`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(item)
    });
  }
  customers = await request(`${API_BASE}/users/${currentUser.uid}/customers`);
}

async function deleteCustomerRemote(id){
  await request(`${API_BASE}/users/${currentUser.uid}/customers/${id}`,{method:"DELETE"});
  customers = customers.filter(i=>i.id!==id);
}

function getCatalog(){
  return Array.isArray(window.PRODUCT_CATALOG) ? window.PRODUCT_CATALOG : [];
}

function escapeAttr(value){
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtml(value){
  return escapeAttr(value).replace(/'/g, "&#39;");
}

function fallbackProductImage(p){
  const text = normalizeText(`${p?.name || ""} ${p?.category || ""} ${p?.size || ""}`);
  const rules = [
    [["on guard"], "assets/produtos/real-cinnamon.jpg"],
    [["breathe", "air-x"], "assets/produtos/real-eucalyptus.jpg"],
    [["deep blue", "pasttense", "rescuer"], "assets/produtos/real-mint.jpg"],
    [["zengest"], "assets/produtos/real-ginger.jpg"],
    [["zendocrine", "ddr prime", "turmeric", "curcuma", "cúrcuma"], "assets/produtos/real-turmeric.jpg"],
    [["smart & sassy", "metapwr", "grapefruit", "toranja"], "assets/produtos/real-grapefruit.jpg"],
    [["purify", "correct-x"], "assets/produtos/real-lemon.jpg"],
    [["hygge", "brave", "forgive"], "assets/produtos/real-cinnamon.jpg"],
    [["tamer"], "assets/produtos/real-ginger.jpg"],
    [["thinker", "motivate"], "assets/produtos/real-rosemary.jpg"],
    [["stronger", "hd clear"], "assets/produtos/real-melaleuca.jpg"],
    [["steady", "console", "intune", "balance"], "assets/produtos/real-frankincense.jpg"],
    [["helichrysum", "spikenard", "whisper"], "assets/produtos/real-ylang.jpg"],
    [["copaiba", "copaíba"], "assets/produtos/real-copaiba.jpg"],
    [["pink pepper", "pimenta-rosa", "pimenta rosa"], "assets/produtos/real-pink-pepper.jpg"],
    [["black pepper", "pimenta-preta", "pimenta preta"], "assets/produtos/real-black-pepper.jpg"],
    [["clary sage", "clarycalm", "sálvia-esclareia", "salvia-esclareia", "sálvia esclareia", "salvia esclareia"], "assets/produtos/real-clary-sage.jpg"],
    [["cilantro", "coentro", "coriander"], "assets/produtos/real-coriander.jpg"],
    [["lemongrass", "capim-limão", "capim-limao"], "assets/produtos/real-lemongrass.jpg"],
    [["lime -", "lime oil"], "assets/produtos/real-lime.jpg"],
    [["citronella", "terashield", "terrashield"], "assets/produtos/real-citronella.jpg"],
    [["black spruce", "douglas fir", "siberian fir", "cypress", "cipreste", "abeto", "pinheiro"], "assets/produtos/real-eucalyptus.jpg"],
    [["wintergreen"], "assets/produtos/real-mint.jpg"],
    [["petitgrain"], "assets/produtos/real-orange.jpg"],
    [["livro culinária", "livro culinaria", "culinária essencial", "culinaria essencial"], "assets/produtos/real-basil.jpg"],
    [["wooden box", "colecionador"], "assets/produtos/real-frankincense.jpg"],
    [["kit início", "kit inicio", "living kit", "soluções naturais", "solucoes naturais", "kit de apresentação", "kit de apresentacao"], "assets/produtos/real-orange.jpg"],
    [["citrus bliss", "wild orange", "tangerine", "tangerina", "mandarin", "mandarina", "bergamot", "bergamota", "orange", "laranja"], "assets/produtos/real-orange.jpg"],
    [["lemon eucalyptus", "doterra dawn"], "assets/produtos/real-eucalyptus.jpg"],
    [["lemon", "limão", "limao"], "assets/produtos/real-lemon.jpg"],
    [["adaptiv", "serenity", "calmer", "peace", "console", "lavender", "lavanda"], "assets/produtos/real-lavender.jpg"],
    [["ylang", "passion", "cheer", "motivate", "elevation", "hope", "jasmine", "rose", "geranium", "geranio", "salubelle"], "assets/produtos/real-ylang.jpg"],
    [["peppermint", "spearmint", "hortel", "supermint"], "assets/produtos/real-mint.jpg"],
    [["rosemary", "alecrim"], "assets/produtos/real-rosemary.jpg"],
    [["basil", "manjeric"], "assets/produtos/real-basil.jpg"],
    [["eucalyptus", "eucalipto"], "assets/produtos/real-eucalyptus.jpg"],
    [["melaleuca", "tea tree", "hd clear", "correct-x"], "assets/produtos/real-melaleuca.jpg"],
    [["cinnamon", "canela", "cassia"], "assets/produtos/real-cinnamon.jpg"],
    [["clove", "cravo"], "assets/produtos/real-clove.jpg"],
    [["ginger", "gengibre"], "assets/produtos/real-ginger.jpg"],
    [["juniper", "zimbro"], "assets/produtos/real-juniper.jpg"],
    [["oregano", "orégano", "tomilho", "thyme", "marjoram", "manjerona"], "assets/produtos/real-oregano.jpg"],
    [["cardamom", "cardamomo"], "assets/produtos/real-cardamom.jpg"],
    [["celery", "aipo", "fennel", "erva-doce", "erva doce"], "assets/produtos/real-cardamom.jpg"],
    [["coconut", "coco"], "assets/produtos/real-coconut.jpg"],
    [["frankincense", "olibano", "olíbano", "myrrh", "mirra", "cedarwood", "cedro", "sandalwood", "patchouli", "vetiver", "breu", "guaiacwood", "balance", "forgive", "aromatouch", "whisper", "intune"], "assets/produtos/real-frankincense.jpg"],
    [["difusor", "umidificador"], "assets/produtos/real-eucalyptus.jpg"],
    [["veráge", "verage", "yarrow", "pūr", "pure", "spa", "condicionador", "shampoo", "creme", "serum", "sérum", "loção", "locao", "sabonete"], "assets/produtos/real-coconut.jpg"],
    [["pastilha", "suplement", "alimento", "lifeshot", "collagen", "colageno", "colágeno", "vm complex", "xeo mega", "daily nutrient"], "assets/produtos/real-orange.jpg"]
  ];

  const match = rules.find(([keywords]) => keywords.some(keyword => text.includes(keyword)));
  return match ? match[1] : "assets/produtos/real-lavender.jpg";
}

function officialProductInfo(p){
  const code = String(p?.code || p?.productCode || "");
  const text = normalizeText(`${p?.name || ""} ${p?.category || ""} ${p?.size || ""}`);
  const topicalCare = "Uso externo. Evite olhos, ouvidos e áreas sensíveis. Em gravidez, tratamento médico ou irritação, procure orientação profissional.";
  const dilutedCare = "Para uso tópico, dilua em Óleo Carreador doTERRA. Para uso aromático, use 3 a 4 gotas no aromatizador.";
  const photosensitiveCare = `${dilutedCare} Evite sol ou raios UV na pele após aplicação, conforme orientação do rótulo.`;
  const entries = [
    {
      codes: ["60210367"],
      keys: ["adaptiv"],
      source: "https://www.doterra.com/BR/pt_BR/p/adaptiv-oil",
      use: "Banho de imersão, massagem confortante e inalação nas mãos em momentos de inquietude.",
      wellness: "Serve para ajudar na adaptação a novos ambientes, tensão do dia a dia e sensação de equilíbrio emocional.",
      mode: "Diluir 1 a 3 gotas para aplicação tópica ou usar 3 a 4 gotas no aromatizador.",
      care: photosensitiveCare
    },
    {
      codes: ["60210337"],
      keys: ["adaptiv touch"],
      source: "https://www.doterra.com/BR/pt_BR/p/adaptiv-touch-oil",
      use: "Aplicar nos punhos, têmporas, ombros ou pescoço e inalar quando precisar se recompor.",
      wellness: "Serve para tranquilidade, equilíbrio de humor, conforto emocional e energia leve.",
      mode: "Roll-on pronto para uso externo sobre a pele limpa e seca.",
      care: topicalCare
    },
    {
      codes: ["60203392"],
      keys: ["breathe"],
      source: "https://www.doterra.com/BR/pt_BR/p/doterra-breathe-oil",
      use: "Aplicar diluído no peito, costas ou planta dos pés; também pode ser difundido à noite.",
      wellness: "Serve para sensação de vias aéreas limpas, frescor respiratório e ambiente restaurador para dormir.",
      mode: "Diluir 1 a 3 gotas para aplicação tópica ou usar 3 a 4 gotas no aromatizador.",
      care: "Não trata bronquite, asma, sinusite, pneumonia ou falta de ar. Nesses casos, procure orientação médica."
    },
    {
      codes: ["60206570"],
      keys: ["breathe touch"],
      source: "https://www.doterra.com/BR/pt_BR/p/doterra-breathe-touch",
      use: "Aplicar no pescoço, peito, costas ou planta dos pés, especialmente na rotina noturna.",
      wellness: "Serve para aroma suave e refrescante, sensação de vias aéreas limpas e ambiente positivo.",
      mode: "Roll-on pronto para uso externo sobre a pele limpa e seca.",
      care: "Não trata bronquite, asma, sinusite, pneumonia ou falta de ar. Nesses casos, procure orientação médica."
    },
    {
      codes: ["60203394"],
      keys: ["deep blue"],
      source: "https://www.doterra.com/BR/pt_BR/p/doterra-deep-blue-oil",
      use: "Massagem diluída em pés, joelhos, costas, ombros, pescoço, dedos e punhos.",
      wellness: "Serve para massagem relaxante, sensação refrescante e conforto depois de trabalho ou treino.",
      mode: "Diluir 1 a 3 gotas em Óleo Carreador doTERRA antes de aplicar na pele.",
      care: "Não aplique em feridas, olhos ou mucosas. Não substitui avaliação para dores intensas ou persistentes."
    },
    {
      codes: ["60206574"],
      keys: ["deep blue touch"],
      source: "https://www.doterra.com/BR/pt_BR/p/doterra-deep-blue-touch",
      use: "Aplicar em pequenas áreas, pés, joelhos e costas antes/depois de exercícios ou no fim do dia.",
      wellness: "Serve para desconfortos musculares do cotidiano, massagem confortante e sensação quente/fria no local.",
      mode: "Roll-on pronto para uso externo sobre a pele limpa e seca.",
      care: "Não aplique em feridas, olhos ou mucosas. Não substitui avaliação para dores intensas ou persistentes."
    },
    {
      codes: ["60203410", "60214244"],
      keys: ["on guard"],
      source: "https://www.doterra.com/BR/pt_BR/p/on-guard-oil",
      use: "Difusão no ambiente ou aplicação tópica diluída quando desejar aroma de especiarias.",
      wellness: "Serve para aroma energizante, revigorante e sensação de ambiente mais leve.",
      mode: "Diluir 1 a 3 gotas para aplicação tópica ou usar 3 a 4 gotas no aromatizador.",
      care: "Óleo de especiarias pode sensibilizar a pele. Não é tratamento para infecções, gripe ou imunidade baixa."
    },
    {
      codes: ["60203327", "60214667"],
      keys: ["lavender lavanda"],
      source: "https://www.doterra.com/BR/pt_BR/p/lavender-oil",
      use: "Difusão, banho, perfume natural ou aplicação diluída em áreas de relaxamento.",
      wellness: "Serve para relaxar, acalmar, apoiar o descanso e cuidar da aparência saudável da pele.",
      mode: "Diluir 1 a 3 gotas para aplicação tópica ou usar 3 a 4 gotas no aromatizador.",
      care: dilutedCare
    },
    {
      codes: ["60206564"],
      keys: ["lavender touch"],
      source: "https://www.doterra.com/BR/pt_BR/p/doterra-lavender-touch",
      use: "Aplicar nas têmporas, nuca, pontos de pulsação ou planta dos pés antes de dormir.",
      wellness: "Serve para efeito calmante, relaxante, sono tranquilo e pequenas irritações na pele.",
      mode: "Roll-on pronto para uso externo sobre a pele limpa e seca.",
      care: topicalCare
    },
    {
      codes: ["60203419", "60225674"],
      keys: ["lemon limao siciliano"],
      source: "https://www.doterra.com/BR/pt_BR/p/lemon-oil",
      use: "Difusão para refrescar o ambiente ou aplicação tópica diluída quando quiser aroma cítrico.",
      wellness: "Serve para energizar, refrescar o ambiente e promover sensação de humor positivo.",
      mode: "Diluir 1 a 3 gotas para aplicação tópica ou usar 3 a 4 gotas no aromatizador.",
      care: photosensitiveCare
    },
    {
      codes: ["60203323", "60215479"],
      keys: ["peppermint hortela"],
      source: "https://www.doterra.com/BR/pt_BR/p/peppermint-oil",
      use: "Difusão ou aplicação tópica diluída quando quiser aroma mentolado e revigorante.",
      wellness: "Serve para refrescar, tonificar, despertar os sentidos e apoiar foco na rotina.",
      mode: "Diluir 1 a 3 gotas para aplicação tópica ou usar 3 a 4 gotas no aromatizador.",
      care: dilutedCare
    },
    {
      codes: ["60206569"],
      keys: ["peppermint touch"],
      source: "https://www.doterra.com/BR/pt_BR/p/doterra-peppermint-touch",
      use: "Aplicar nas têmporas, nuca ou áreas desejadas para frescor e foco durante o dia.",
      wellness: "Serve para reduzir sensação de tensão, elevar o humor e promover foco.",
      mode: "Roll-on pronto para uso externo sobre a pele limpa e seca.",
      care: topicalCare
    },
    {
      codes: ["60203415", "60214245"],
      keys: ["wild orange laranja selvagem"],
      source: "https://www.doterra.com/BR/pt_BR/p/wild-orange-oil",
      use: "Difusão para aroma doce e cítrico ou aplicação tópica diluída.",
      wellness: "Serve para criar ambiente refrescante, leve, alegre e energizante.",
      mode: "Diluir 1 a 3 gotas para aplicação tópica ou usar 3 a 4 gotas no aromatizador.",
      care: photosensitiveCare
    },
    {
      codes: ["60203605", "60215576"],
      keys: ["copaiba copaiba"],
      source: "https://www.doterra.com/BR/pt_BR/p/copaiba-oil",
      use: "Difusão, massagem diluída ou aplicação tópica dentro da rotina de cuidado pessoal.",
      wellness: "Serve para sensação de leveza, apoio ao cuidado da pele e rotina de bem-estar.",
      mode: "Diluir 1 a 3 gotas para aplicação tópica ou usar 3 a 4 gotas no aromatizador.",
      care: dilutedCare
    },
    {
      codes: ["60219361"],
      keys: ["copaiba touch"],
      source: "https://www.doterra.com/BR/pt_BR/p/copaiba-touch-oil",
      use: "Aplicar diretamente em áreas desejadas como parte da rotina de pele e bem-estar.",
      wellness: "Serve para hidratação natural, aparência saudável da pele e sensação de leveza.",
      mode: "Roll-on pronto para uso externo sobre a pele limpa e seca.",
      care: topicalCare
    },
    {
      codes: ["60203411", "60215519"],
      keys: ["frankincense olibano"],
      source: "https://www.doterra.com/BR/pt_BR/p/frankincense-oil",
      use: "Difusão, meditação, massagem diluída ou aplicação tópica para cuidado da pele.",
      wellness: "Serve para relaxamento, meditação e suavização da aparência da pele.",
      mode: "Diluir 1 a 3 gotas para aplicação tópica ou usar 3 a 4 gotas no aromatizador.",
      care: dilutedCare
    },
    {
      codes: ["60206649"],
      keys: ["frankincense touch"],
      source: "https://www.doterra.com/BR/pt_BR/p/doterra-frankincense-touch",
      use: "Aplicar topicamente durante o dia, em meditação ou na rotina de cuidado da pele.",
      wellness: "Serve para relaxamento, sensação de bem-estar e pele com aparência mais suave.",
      mode: "Roll-on pronto para uso externo sobre a pele limpa e seca.",
      care: topicalCare
    },
    {
      codes: ["60203322", "60214248"],
      keys: ["lemongrass capim limao"],
      source: "https://www.doterra.com/BR/pt_BR/p/lemongrass-oil",
      use: "Massagem diluída, difusão e aplicação após atividades para sensação refrescante.",
      wellness: "Serve para perspectiva positiva, pele tonificada e massagem confortante.",
      mode: "Para uso tópico, diluir 1 gota em 10 gotas de Óleo Carreador; para difusão, usar 3 a 4 gotas.",
      care: "Pode sensibilizar a pele. Use bem diluído e evite olhos, mucosas e áreas sensíveis."
    },
    {
      codes: ["60210370"],
      keys: ["lemon eucalyptus eucalipto limao"],
      source: "https://www.doterra.com/BR/pt_BR/p/lemon-eucalyptus-oil",
      use: "Difusão para ambiente revigorante ou aplicação tópica diluída para sensação refrescante na pele.",
      wellness: "Serve para aroma purificante, ambiente alegre e pele com sensação de frescor.",
      mode: "Diluir 1 a 3 gotas para aplicação tópica ou usar 3 a 4 gotas no aromatizador.",
      care: dilutedCare
    },
    {
      codes: ["60206562"],
      keys: ["pasttense"],
      source: "https://www.doterra.com/BR/pt_BR/p/pasttense-oil",
      use: "Aplicar no pescoço, ombros ou atrás das orelhas quando quiser relaxar.",
      wellness: "Serve para equilibrar emoções e promover sensação rápida de relaxamento.",
      mode: "Roll-on para uso externo sobre a pele limpa e seca.",
      care: topicalCare
    },
    {
      codes: ["60214935"],
      keys: ["zengest touch"],
      source: "https://www.doterra.com/BR/pt_BR/p/zengest-touch-oil",
      use: "Aplicar no abdômen em massagem suave, em casa, no trabalho ou em viagens.",
      wellness: "Serve para massagem abdominal relaxante e sensação de conforto digestivo.",
      mode: "Roll-on pronto para uso externo sobre a pele limpa e seca.",
      care: "Não trata gastrite, refluxo, intoxicação alimentar ou dor persistente. Use conforme rótulo."
    },
    {
      codes: ["60206613"],
      keys: ["melaleuca touch"],
      source: "https://www.doterra.com/BR/pt_BR/p/doterra-melaleuca-touch",
      use: "Aplicar pontualmente na pele ou unhas como parte da rotina de limpeza e cuidado.",
      wellness: "Serve para purificar a aparência da pele e unhas e apoiar pele com aspecto saudável.",
      mode: "Roll-on pronto para uso externo sobre a pele limpa e seca.",
      care: "Não trata acne, micose, feridas ou infecções. Evite olhos, mucosas e áreas irritadas."
    },
    {
      codes: ["60206614"],
      keys: ["oregano touch"],
      source: "https://www.doterra.com/BR/pt_BR/p/doterra-oregano-touch",
      use: "Aplicar em pequenas áreas desejadas, com cuidado, por ser um óleo potente.",
      wellness: "Serve para rotina tópica purificante em uma versão já diluída para peles sensíveis.",
      mode: "Roll-on pronto para uso externo sobre a pele limpa e seca.",
      care: "Óleo potente. Não use em pele ferida ou irritada; não substitui tratamento para infecções."
    },
    {
      codes: ["60206659"],
      keys: ["hd clear"],
      source: "https://www.doterra.com/BR/pt_BR/p/hd-clear-oil",
      use: "Aplicar camada fina em áreas específicas da face ou corpo, conforme rotina de pele.",
      wellness: "Serve para controle da oleosidade, pele limpa e cuidado localizado.",
      mode: "Uso tópico externo conforme orientação do produto.",
      care: "Não trata acne severa, infecção ou lesões. Suspenda em caso de irritação."
    },
    {
      codes: ["60206670"],
      keys: ["intune"],
      source: "https://www.doterra.com/BR/pt_BR/p/intune-oil",
      use: "Aplicar durante trabalho, estudo ou tarefas que exigem atenção.",
      wellness: "Serve para foco, concentração e sensação de alerta com aroma relaxante e edificante.",
      mode: "Roll-on para uso externo sobre a pele limpa e seca.",
      care: topicalCare
    },
    {
      codes: ["60206563"],
      keys: ["clarycalm"],
      source: "https://www.doterra.com/BR/pt_BR/p/clarycalm-oil",
      use: "Aplicar topicamente em períodos de desconforto feminino ou tensão do dia a dia.",
      wellness: "Serve para sensação confortante, aconchegante, fresca e humor mais positivo.",
      mode: "Roll-on para uso externo sobre a pele limpa e seca.",
      care: topicalCare
    },
    {
      codes: ["60209560"],
      keys: ["brave"],
      source: "https://www.doterra.com/BR/pt_BR/p/doterra-brave-oil",
      use: "Aplicar na nuca e pulsos junto de afirmações positivas ou antes de situações desafiadoras.",
      wellness: "Serve para confiança, coragem, energia e sensação de recomeço.",
      mode: "Exclusivamente tópico. Aplicar na região desejada.",
      care: topicalCare
    },
    {
      codes: ["60209630"],
      keys: ["calmer"],
      source: "https://www.doterra.com/BR/pt_BR/p/doterra-calmer-oil",
      use: "Aplicar como parte do ritual noturno, antes de descanso ou sono.",
      wellness: "Serve para atmosfera calma, serenidade, paz e tranquilidade antes de dormir.",
      mode: "Exclusivamente tópico. Aplicar na região desejada.",
      care: topicalCare
    },
    {
      codes: ["60209586"],
      keys: ["rescuer"],
      source: "https://www.doterra.com/BR/pt_BR/p/doterra-rescuer-oil",
      use: "Aplicar em pernas, mãos ou ombros depois de exercícios ou atividades intensas.",
      wellness: "Serve para massagem relaxante, sensação refrescante e pernas cansadas.",
      mode: "Exclusivamente tópico. Aplicar na região desejada.",
      care: topicalCare
    },
    {
      codes: ["60209588"],
      keys: ["steady"],
      source: "https://www.doterra.com/BR/pt_BR/p/doterra-steady-oil",
      use: "Aplicar nos punhos ou dorso das mãos em pausas durante a rotina.",
      wellness: "Serve para atmosfera equilibrada, presença e sensações de relaxamento.",
      mode: "Exclusivamente tópico. Aplicar na região desejada.",
      care: topicalCare
    },
    {
      codes: ["60209587"],
      keys: ["stronger"],
      source: "https://www.doterra.com/BR/pt_BR/p/doterra-stronger-oil",
      use: "Aplicar nas mãos, joelhos ou pés após atividades intensas ou em dias corridos.",
      wellness: "Serve para vitalidade, bem-estar, conforto emocional e aparência saudável da pele.",
      mode: "Exclusivamente tópico. Aplicar na região desejada.",
      care: topicalCare
    },
    {
      codes: ["60210369"],
      keys: ["tamer"],
      source: "https://www.doterra.com/BR/pt_BR/p/doterra-tamer-oil",
      use: "Aplicar no abdômen em massagem suave quando quiser conforto durante a rotina.",
      wellness: "Serve para massagem abdominal confortante e sensação de bem-estar em viagens ou no dia a dia.",
      mode: "Exclusivamente tópico. Aplicar na região desejada.",
      care: "Não trata gastrite, refluxo, enjoo persistente ou dor abdominal. Busque orientação quando necessário."
    },
    {
      codes: ["60209589"],
      keys: ["thinker"],
      source: "https://www.doterra.com/BR/pt_BR/p/doterra-thinker-oil",
      use: "Aplicar em momentos de estudo, tarefas, leitura ou distração.",
      wellness: "Serve para atenção, foco e sensação de estar mais concentrado.",
      mode: "Exclusivamente tópico. Aplicar na região desejada.",
      care: topicalCare
    }
  ];
  const codeMatch = entries.find(entry => entry.codes.includes(code));
  if (codeMatch) return codeMatch;
  return entries.find(entry => entry.keys.some(keyword => text.includes(keyword))) || null;
}

function productUseInfo(p){
  const text = normalizeText(`${p?.name || ""} ${p?.category || ""} ${p?.size || ""}`);
  const defaultCare = "Uso externo/aromático conforme o rótulo. Dilua quando aplicar na pele e evite olhos, mucosas, crianças pequenas e gestantes sem orientação profissional.";
  const supplementCare = "Usar somente conforme o rótulo do produto. Em caso de gravidez, uso de medicamentos ou condição de saúde, confirme com um profissional.";
  const citrusCare = "Pode causar sensibilidade ao sol quando aplicado na pele. Evite exposição solar na região aplicada conforme orientação do rótulo.";
  const rules = [
    {
      keys: ["on guard", "canela", "cinnamon", "cassia", "clove", "cravo", "hygge", "stronger"],
      use: "Aroma quente de especiarias, muito usado em difusor e rotinas de limpeza aromática.",
      wellness: "Serve para deixar o ambiente com sensação de limpeza, proteção aromática e aconchego.",
      care: "Não é tratamento para gripes, infecções ou imunidade baixa. Óleos quentes podem sensibilizar a pele; use bem diluído."
    },
    {
      keys: ["breathe", "air-x", "eucalyptus", "eucalipto", "lemon eucalyptus", "douglas fir", "siberian fir", "black spruce", "abeto", "pinheiro", "cypress", "cipreste"],
      use: "Aroma fresco para difusão, banho de vapor ou aplicação diluída no peito e nuca.",
      wellness: "Serve para dar sensação de vias aéreas mais abertas, frescor no peito e ambiente renovado.",
      care: "Não trata bronquite, asma, sinusite, pneumonia ou falta de ar. Nesses casos, procure orientação médica."
    },
    {
      keys: ["deep blue", "pasttense", "wintergreen", "rescuer", "aromatouch"],
      use: "Massagem localizada, sempre diluído, principalmente depois de treino, esforço físico ou tensão do dia.",
      wellness: "Serve para massagem em áreas tensionadas, conforto muscular e relaxamento depois de esforço físico.",
      care: "Não aplique sobre feridas, olhos ou mucosas. Wintergreen exige cuidado extra e deve seguir o rótulo."
    },
    {
      keys: ["zengest", "ginger", "gengibre", "fennel", "erva doce", "erva-doce", "cardamom", "cardamomo", "peppermint", "hortel", "tamer"],
      use: "Aroma herbal ou especiado para rotina após refeições, massagem abdominal diluída ou uso conforme rótulo.",
      wellness: "Serve para sensação de conforto após refeições, leveza abdominal e rotina digestiva.",
      care: "Não trata gastrite, refluxo, intoxicação alimentar ou dor persistente. Use conforme rótulo e busque orientação se necessário."
    },
    {
      keys: ["lavender", "lavanda", "serenity", "calmer", "adaptiv", "peace", "console"],
      use: "Difusão à noite, aromatização do quarto ou aplicação diluída em pulsos, nuca e pés.",
      wellness: "Serve para acalmar, relaxar, preparar o ambiente para dormir e reduzir a sensação de agitação do dia.",
      care: "Não substitui tratamento para ansiedade, insônia ou depressão. Use como apoio de bem-estar."
    },
    {
      keys: ["lemon", "limão", "limao", "orange", "laranja", "wild orange", "tangerine", "tangerina", "mandarin", "mandarina", "bergamot", "bergamota", "lime", "grapefruit", "toranja", "citrus bliss", "smart & sassy", "metapwr"],
      use: "Difusão para frescor e energia, aromatização do ambiente e rotinas de limpeza.",
      wellness: "Serve para energizar o ambiente, melhorar a sensação de ânimo, frescor e clareza durante a rotina.",
      care: citrusCare
    },
    {
      keys: ["melaleuca", "tea tree", "hd clear", "correct-x"],
      use: "Cuidados pessoais e rotina de pele, sempre com aplicação pontual e diluída quando necessário.",
      wellness: "Serve para rotina de pele, sensação de limpeza e cuidado pontual em pequenas áreas.",
      care: "Não trata acne, micose, feridas ou infecções de pele. Faça teste de sensibilidade e evite olhos e mucosas."
    },
    {
      keys: ["rosemary", "alecrim", "basil", "manjeric", "thinker", "intune", "motivate", "peppermint", "supermint"],
      use: "Difusão em momentos de estudo, trabalho, leitura ou organização da rotina.",
      wellness: "Serve para foco, estudo, trabalho, concentração e sensação de mente mais desperta.",
      care: defaultCare
    },
    {
      keys: ["copaiba", "copaíba", "frankincense", "olibano", "olíbano", "myrrh", "mirra", "cedarwood", "cedro", "sandalwood", "patchouli", "vetiver", "breu", "guaiacwood", "balance", "steady", "forgive"],
      use: "Difusão, meditação, massagem diluída e rotinas de cuidado da pele.",
      wellness: "Serve para meditação, equilíbrio emocional, massagem relaxante e sensação de estabilidade.",
      care: defaultCare
    },
    {
      keys: ["ylang", "rose", "jasmine", "geranium", "geranio", "passion", "cheer", "elevation", "hope", "whisper", "clary sage", "clarycalm", "salvia", "sálvia"],
      use: "Aroma floral para difusão, autocuidado, banho aromático ou aplicação diluída.",
      wellness: "Serve para autocuidado, perfume natural, bom humor, acolhimento e bem-estar emocional.",
      care: defaultCare
    },
    {
      keys: ["turmeric", "curcuma", "cúrcuma", "zendocrine", "ddr prime", "lifeshot", "collagen", "colageno", "colágeno", "vm complex", "xeo mega", "daily nutrient", "pastilha", "suplement", "alimento"],
      use: "Suplemento ou alimento funcional para complementar uma rotina de bem-estar.",
      wellness: "Serve para complementar alimentação, energia, autocuidado e rotina nutricional conforme a proposta do produto.",
      care: supplementCare
    },
    {
      keys: ["difusor", "umidificador", "wooden box", "colecionador", "livro", "kit"],
      use: "Acessório ou material de apoio para organizar, aprender e usar os óleos no dia a dia.",
      wellness: "Serve para organizar os óleos, facilitar o uso diário e apoiar a educação sobre os produtos.",
      care: "Siga as instruções do fabricante e mantenha fora do alcance de crianças quando houver peças pequenas."
    },
    {
      keys: ["verage", "veráge", "yarrow", "pūr", "pure", "spa", "condicionador", "shampoo", "creme", "serum", "sérum", "loção", "locao", "sabonete", "coconut", "coco"],
      use: "Cuidados pessoais para pele, cabelo, hidratação ou banho.",
      wellness: "Serve para hidratação, banho, cabelo, pele macia e rotina de autocuidado.",
      care: "Faça teste de sensibilidade e interrompa o uso se houver irritação."
    }
  ];
  const info = officialProductInfo(p) || rules.find(rule => rule.keys.some(keyword => text.includes(keyword))) || {
    use: "Uso aromático ou tópico diluído conforme a orientação do rótulo do produto.",
    wellness: "Serve para aromatizar o ambiente, apoiar autocuidado e criar uma rotina de bem-estar.",
    care: defaultCare
  };
  const modeLine = info.mode ? `<div><strong>Modo:</strong> ${escapeHtml(info.mode)}</div>` : "";
  const sourceLine = info.source
    ? `<small>Fonte: <a href="${escapeAttr(info.source)}" target="_blank" rel="noopener">doTERRA Brasil</a>. Informação educativa, sem indicação de diagnóstico, tratamento, cura ou prevenção de doenças.</small>`
    : `<small>Informação educativa. Não substitui orientação médica e não indica diagnóstico, tratamento, cura ou prevenção de doenças.</small>`;

  return `<details class="product-info">
    <summary>Uso e cuidados</summary>
    <div><strong>Uso:</strong> ${escapeHtml(info.use)}</div>
    <div><strong>Serve para:</strong> ${escapeHtml(info.wellness)}</div>
    ${modeLine}
    <div><strong>Cuidados:</strong> ${escapeHtml(info.care)}</div>
    ${sourceLine}
  </details>`;
}

function productIcon(p){
  const code = p?.code || p?.productCode || "";
  const name = String((p && (p.name || p.productName)) || "DT");
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join("")
    .toUpperCase();

  const customUrl = "";
  const imageUrl = fallbackProductImage(p);
  const fallbackUrl = fallbackProductImage(p);

  if (imageUrl) {
    return `
      <div class="product-icon product-icon-img">
        <img
          src="${imageUrl}"
          data-fallback="${fallbackUrl}"
          data-initials="${escapeAttr(initials || "DT")}"
          alt="${escapeAttr(name)}"
          loading="lazy"
          onerror="
            if (this.src.indexOf(this.dataset.fallback) === -1) {
              this.src=this.dataset.fallback;
            } else {
              this.onerror=null;
              this.parentElement.textContent=this.dataset.initials;
              this.parentElement.classList.remove('product-icon-img');
            }
          "
        >
      </div>
    `;
  }

  return `<div class="product-icon">${initials || "DT"}</div>`;
}
function findCatalogBySearch(value){
  const q=normalizeText(value);
  if(!q) return null;
  return getCatalog().find(p=>{
    const hay=normalizeText(`${p.name} ${p.code} ${p.size} ${p.category}`);
    return hay.includes(q) || q.includes(normalizeText(p.code));
  }) || null;
}

function scoreProduct(p,q){
  if(!q) return 1;
  const hay=normalizeText(`${p.name} ${p.code} ${p.size} ${p.category}`);
  const tokens=normalizeText(q).split(/\s+/).filter(Boolean);
  let score=0;
  tokens.forEach(t=>{
    if(hay.includes(t)) score += 1;
    if(normalizeText(p.name).startsWith(t)) score += 2;
    if(String(p.code).includes(t)) score += 3;
  });
  return score;
}

function populateFilters(){
  const cats=["Todas as categorias",...Array.from(new Set(getCatalog().map(p=>p.category || "Sem categoria"))).sort()];
  if($("catalogCategoryFilter")) $("catalogCategoryFilter").innerHTML=cats.map(c=>`<option value="${c==="Todas as categorias"?"":c}">${c}</option>`).join("");
  if($("stockCategoryFilter")) $("stockCategoryFilter").innerHTML=cats.map(c=>`<option value="${c==="Todas as categorias"?"":c}">${c}</option>`).join("");
}

function populateDatalist(){
  if(!$("catalogList")) return;
  $("catalogList").innerHTML=getCatalog().map(p=>`<option value="${p.name} | ${p.size || ""} | cód. ${p.code || ""}"></option>`).join("");
}

function handleProductSearch(){
  const p=findCatalogBySearch($("productSearch").value);
  if(!p){
    hide($("selectedPreview"));
    return;
  }
  $("productName").value=p.name || "";
  $("productCode").value=p.code || "";
  $("productSize").value=p.size || "";
  $("price").value=Number(p.retail || p.wholesale || 0);
  $("selectedPreview").innerHTML=`<strong>${p.name}</strong><br><span>${p.category || "Sem categoria"} • ${p.size || ""} • Cód. ${p.code || ""}</span>`;
  show($("selectedPreview"));
}

function customerPurchaseLine(item){
  return `${item.qty}x ${item.name}${item.size ? ` (${item.size})` : ""} - ${money(item.unitPrice)} un. = ${money(item.total)}`;
}

function purchaseItemsNote(){
  if(!customerPurchaseItems.length) return "";
  return `Itens estruturados: ${JSON.stringify(customerPurchaseItems)}`;
}

function extractPurchaseItems(notes){
  const match=String(notes || "").match(/Itens estruturados:\s*(\[.*\])(?:\n|$)/);
  if(!match) return [];
  try{
    const parsed=JSON.parse(match[1]);
    return Array.isArray(parsed) ? parsed.map(item=>({
      code:String(item.code || ""),
      name:String(item.name || "Produto"),
      size:String(item.size || ""),
      qty:Math.max(1, Number(item.qty || 1)),
      unitPrice:Number(item.unitPrice || 0),
      total:Number(item.total || 0) || Math.max(1, Number(item.qty || 1))*Number(item.unitPrice || 0)
    })) : [];
  }catch{
    return [];
  }
}

function numberFromMoney(text){
  const raw=String(text || "").replace(/[^\d,.-]/g,"").replace(/\./g,"").replace(",",".");
  return Number(raw || 0);
}

function parsePurchaseSummary(products){
  return String(products || "").split(/\n+/).map(line=>{
    const match=line.match(/^(\d+(?:[.,]\d+)?)x\s+(.+?)\s+-\s+(R\$\s*[\d.,]+)\s+un\.\s+=\s+(R\$\s*[\d.,]+)$/);
    if(!match) return null;
    const qty=Math.max(1, Number(String(match[1]).replace(",",".")));
    const productText=String(match[2] || "").trim();
    const sizeMatch=productText.match(/\(([^()]*)\)\s*$/);
    const size=sizeMatch ? sizeMatch[1].trim() : "";
    const name=(sizeMatch ? productText.slice(0,sizeMatch.index) : productText).trim();
    const unitPrice=numberFromMoney(match[3]);
    const total=numberFromMoney(match[4]) || qty*unitPrice;
    const catalogItem=getCatalog().find(p=>normalizeText(p.name)===normalizeText(name) && (!size || normalizeText(p.size)===normalizeText(size))) || findCatalogBySearch(name);
    return {
      code: catalogItem ? String(catalogItem.code || "") : "",
      name,
      size,
      qty,
      unitPrice,
      total
    };
  }).filter(Boolean);
}

function cleanCustomerNotes(notes){
  return String(notes || "").replace(/\n?Itens estruturados:\s*\[.*\](?:\n|$)/s,"").trim();
}

function syncCustomerPurchaseSummary(){
  const productsEl=$("customerProducts");
  const amountEl=$("customerAmount");
  if(!productsEl || !amountEl) return;
  const total=customerPurchaseItems.reduce((sum,item)=>sum+Number(item.total||0),0);
  productsEl.value=customerPurchaseItems.map(customerPurchaseLine).join("\n");
  amountEl.value=total ? total.toFixed(2) : "";
  renderCustomerSelectedProducts();
  renderInstallmentPreview();
}

function renderCustomerSelectedProducts(){
  const wrap=$("customerSelectedProducts");
  if(!wrap) return;
  if(!customerPurchaseItems.length){
    wrap.innerHTML=`<div class="empty compact">Nenhum óleo selecionado.</div>`;
    return;
  }
  wrap.innerHTML=customerPurchaseItems.map((item,index)=>`
    <div class="selected-product">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <span>${money(item.unitPrice)} cada • ${money(item.total)} total</span>
      </div>
      <input class="selected-product-qty" type="number" min="1" step="1" value="${item.qty}" aria-label="Quantidade de ${escapeAttr(item.name)}" onchange="updateCustomerPurchaseQty(${index}, this.value)">
      <button type="button" class="mini danger" onclick="removeCustomerPurchaseItem(${index})">Remover</button>
    </div>
  `).join("");
}

function addCustomerPurchaseItem(){
  const product=findCatalogBySearch($("customerProductSearch").value);
  if(!product){
    alert("Selecione um produto do catálogo para adicionar.");
    return;
  }
  const qty=Math.max(1, Number($("customerProductQty").value || 1));
  const unitPrice=Number(product.retail || product.wholesale || 0);
  const existing=customerPurchaseItems.find(item=>item.code===product.code && item.size===(product.size || ""));
  if(existing){
    existing.qty += qty;
    existing.total = existing.qty * existing.unitPrice;
  }else{
    customerPurchaseItems.push({
      code: product.code || "",
      name: product.name || "Produto",
      size: product.size || "",
      qty,
      unitPrice,
      total: qty * unitPrice
    });
  }
  $("customerProductSearch").value="";
  $("customerProductQty").value=1;
  syncCustomerPurchaseSummary();
}

function removeCustomerPurchaseItem(index){
  customerPurchaseItems.splice(index,1);
  syncCustomerPurchaseSummary();
}

function updateCustomerPurchaseQty(index,value){
  const item=customerPurchaseItems[index];
  if(!item) return;
  item.qty=Math.max(1, Number(value || 1));
  item.total=item.qty*Number(item.unitPrice || 0);
  syncCustomerPurchaseSummary();
}

function buildInstallmentPlan(){
  const amount=Number($("customerAmount") ? $("customerAmount").value : 0);
  const count=Math.max(1, Number($("customerInstallments") ? $("customerInstallments").value : 1));
  const gap=Number($("customerInstallmentGap") ? $("customerInstallmentGap").value : 30);
  const firstDate=$("customerDueDate") ? ($("customerDueDate").value || today()) : today();
  const part=count ? amount/count : amount;
  return Array.from({length:count},(_,i)=>({number:i+1,date:addDays(firstDate,i*gap),amount:part}));
}

function renderInstallmentPreview(){
  const wrap=$("installmentPreview");
  if(!wrap) return;
  const amount=Number($("customerAmount") ? $("customerAmount").value : 0);
  const count=Math.max(1, Number($("customerInstallments") ? $("customerInstallments").value : 1));
  if(!amount || count<=1){
    wrap.innerHTML="";
    return;
  }
  wrap.innerHTML=buildInstallmentPlan().map(p=>`<span>${p.number}x • ${p.date} • ${money(p.amount)}</span>`).join("");
}

function installmentNotes(){
  const count=Math.max(1, Number($("customerInstallments") ? $("customerInstallments").value : 1));
  if(count<=1) return "";
  return `Parcelamento: ${buildInstallmentPlan().map(p=>`${p.number}/${count} em ${p.date}: ${money(p.amount)}`).join(" | ")}`;
}

function showPage(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  document.querySelectorAll(".nav").forEach(n=>n.classList.remove("active"));
  const pageEl=$(page);
  if(pageEl) pageEl.classList.remove("hidden");
  document.querySelectorAll(`.nav[data-page="${page}"]`).forEach(nav=>nav.classList.add("active"));
  const titles={dashboard:"Dashboard",stock:"Meu estoque",catalog:"Catálogo doTERRA",customers:"Clientes",reports:"Relatórios",profile:"Usuários / Perfil"};
  $("pageTitle").textContent=titles[page] || "Sistema";
  closeMobileMenu();
  renderAll();
}

function filteredStock(){
  const q=normalizeText($("stockFilter") ? $("stockFilter").value : "");
  const cat=$("stockCategoryFilter") ? $("stockCategoryFilter").value : "";
  return stock.filter(i=>{
    const hay=normalizeText(`${i.productName} ${i.productCode} ${i.size} ${i.category} ${i.notes}`);
    return (!q || hay.includes(q)) && (!cat || i.category===cat);
  });
}

function statusLabel(status){
  const labels={pending:"Pendente",partial:"Parcial",paid:"Pago"};
  return labels[status] || "Pendente";
}

function billingState(customer){
  if(customer.status==="paid") return "paid";
  const diff=daysUntil(customer.dueDate);
  if(diff===null) return "open";
  if(diff<0) return "overdue";
  if(diff===0) return "today";
  if(diff<=3) return "soon";
  return "open";
}

function billingLabel(customer){
  const labels={paid:"Pago",overdue:"Vencido",today:"Cobrar hoje",soon:"Próximo",open:statusLabel(customer.status)};
  return labels[billingState(customer)] || statusLabel(customer.status);
}

function whatsappLink(customer){
  const phone=String(customer.phone || "").replace(/\D/g,"");
  const text=[
    `Olá, ${customer.customerName || ""}!`,
    `Passando para lembrar da compra dos óleos:`,
    customer.products || "-",
    `Valor: ${money(customer.amount)}`,
    customer.dueDate ? `Data combinada: ${customer.dueDate}` : "",
    `Obrigado!`
  ].filter(Boolean).join("\n");
  return `https://wa.me/${phone ? `55${phone.replace(/^55/,"")}` : ""}?text=${encodeURIComponent(text)}`;
}

function filteredCustomers(){
  const q=normalizeText($("customerFilter") ? $("customerFilter").value : "");
  const status=$("customerStatusFilter") ? $("customerStatusFilter").value : "";
  return customers.filter(i=>{
    const hay=normalizeText(`${i.customerName} ${i.phone} ${i.products} ${i.notes}`);
    return (!q || hay.includes(q)) && (!status || i.status===status);
  });
}

function renderStock(){
  const rows=filteredStock();
  const tbody=$("stockRows");
  if(!tbody) return;
  $("emptyStock").classList.toggle("hidden", rows.length>0);
  tbody.innerHTML=rows.map(i=>{
    const total=Number(i.qty||0)*Number(i.price||0);
    const low=Number(i.qty||0)<=2;
    return `<tr>
      <td><strong>${i.productName || "-"}</strong><br><small>${i.size || ""}</small></td>
      <td>${i.productCode || "-"}</td>
      <td><span class="tag">${i.category || "Sem categoria"}</span></td>
      <td><span class="tag ${low ? "warn" : ""}">${i.qty || 0}</span></td>
      <td>${money(i.price)}</td>
      <td>${money(total)}</td>
      <td>${i.expiry || "-"}</td>
      <td><div class="row-actions"><button class="mini" onclick="editItem('${i.id}')">Editar</button><button class="mini danger" onclick="removeItem('${i.id}')">Excluir</button></div></td>
    </tr>`;
  }).join("");
}

function renderCatalog(){
  const grid=$("catalogGrid");
  if(!grid) return;
  const q=normalizeText($("catalogFilter") ? $("catalogFilter").value : "");
  const cat=$("catalogCategoryFilter") ? $("catalogCategoryFilter").value : "";
  const catalog = getCatalog();
  const rows=catalog
    .map(p=>({...p,_score:scoreProduct(p,q)}))
    .filter(p=>(!q || p._score>0) && (!cat || p.category===cat))
    .sort((a,b)=>b._score-a._score || String(a.name).localeCompare(String(b.name)));

  if($("catalogStatus")){
    $("catalogStatus").textContent = `${rows.length} de ${catalog.length} produto(s) do catálogo carregado(s).`;
  }

  grid.innerHTML=rows.map(p=>`<article class="product-card">
    ${productIcon(p)}
    <div class="product-meta"><span>${p.code || "-"}</span><span>${p.size || "-"}</span></div>
    <h3>${p.name || "-"}</h3>
    <p>${p.category || "Sem categoria"}</p>
    ${productUseInfo(p)}
    <div class="catalog-prices"><span>Venda: ${money(p.retail)}</span><span>Atacado: ${money(p.wholesale)}</span><span>PV: ${p.pv || 0}</span></div>
    <button type="button" onclick="addCatalogToStock('${p.code}')">Adicionar ao estoque</button>
  </article>`).join("");

  if(!rows.length){
    grid.innerHTML = `<div class="empty">Nenhum produto encontrado no catálogo.</div>`;
  }
}

function renderCustomers(){
  const wrap=$("customerCards");
  if(!wrap) return;
  const rows=filteredCustomers();
  const pending=customers.filter(i=>i.status!=="paid").reduce((s,i)=>s+Number(i.amount||0),0);
  const paid=customers.filter(i=>i.status==="paid").reduce((s,i)=>s+Number(i.amount||0),0);
  if($("customerStatusText")){
    $("customerStatusText").textContent = `${customers.length} cliente(s) • ${money(pending)} em aberto • ${money(paid)} pago(s).`;
  }
  renderCustomerHistory();
  $("emptyCustomers").classList.toggle("hidden", rows.length>0);
  wrap.innerHTML=rows.map(i=>`<article class="customer-card billing-${billingState(i)}">
    <div class="customer-card-head">
      <div>
        <h3>${escapeHtml(i.customerName || "-")}</h3>
        <span>${escapeHtml(i.phone || "Sem telefone")}</span>
      </div>
      <strong class="tag ${i.status==="paid" ? "" : "warn"}">${billingLabel(i)}</strong>
    </div>
    <p>${escapeHtml(i.products || "-")}</p>
    <div class="customer-meta">
      <span>Compra: ${escapeHtml(i.purchaseDate || "-")}</span>
      <span>Cobrar: ${escapeHtml(i.dueDate || "-")}</span>
      <strong>${money(i.amount)}</strong>
    </div>
    ${cleanCustomerNotes(i.notes) ? `<div class="customer-notes">${escapeHtml(cleanCustomerNotes(i.notes))}</div>` : ""}
    <div class="row-actions">
      <a class="mini whatsapp" href="${whatsappLink(i)}" target="_blank" rel="noopener">WhatsApp</a>
      <button class="mini" onclick="editCustomer('${i.id}')">Editar</button>
      <button class="mini danger" onclick="removeCustomer('${i.id}')">Excluir</button>
    </div>
  </article>`).join("");
}

function renderCustomerHistory(){
  const wrap=$("customerHistory");
  if(!wrap) return;
  const map={};
  customers.forEach(i=>{
    const key=normalizeText(i.customerName || "Sem nome");
    if(!map[key]) map[key]={name:i.customerName || "Sem nome",count:0,open:0,paid:0,last:""};
    map[key].count += 1;
    if(i.status==="paid") map[key].paid += Number(i.amount||0);
    else map[key].open += Number(i.amount||0);
    if(String(i.purchaseDate || "").localeCompare(map[key].last)>0) map[key].last=i.purchaseDate || "";
  });
  const rows=Object.values(map).sort((a,b)=>b.open-a.open || b.count-a.count).slice(0,6);
  wrap.innerHTML=rows.length ? rows.map(i=>`<div class="history-chip"><strong>${escapeHtml(i.name)}</strong><span>${i.count} compra(s) • aberto ${money(i.open)} • pago ${money(i.paid)}</span></div>`).join("") : "";
}

function renderMetrics(){
  const products=stock.length;
  const units=stock.reduce((s,i)=>s+Number(i.qty||0),0);
  const value=stock.reduce((s,i)=>s+(Number(i.qty||0)*Number(i.price||0)),0);
  const low=stock.filter(i=>Number(i.qty||0)<=2).length;
  const receivable=customers.filter(i=>i.status!=="paid").reduce((s,i)=>s+Number(i.amount||0),0);
  const paid=customers.filter(i=>i.status==="paid").reduce((s,i)=>s+Number(i.amount||0),0);
  const overdue=customers.filter(i=>billingState(i)==="overdue").length;
  const dueToday=customers.filter(i=>billingState(i)==="today").length;
  $("mProducts").textContent=products;
  $("mUnits").textContent=units;
  $("mValue").textContent=money(value);
  $("mLow").textContent=low;
  if($("mReceivable")) $("mReceivable").textContent=money(receivable);
  if($("mPaid")) $("mPaid").textContent=money(paid);
  if($("mOverdue")) $("mOverdue").textContent=overdue;
  if($("mDueToday")) $("mDueToday").textContent=dueToday;
  $("summary").innerHTML=`<div class="report-item">Você tem <strong>${products}</strong> produto(s), totalizando <strong>${units}</strong> unidade(s) e <strong>${money(value)}</strong> em estoque.</div>`;
}

function groupByCategory(){
  const map={};
  stock.forEach(i=>{
    const c=i.category || "Sem categoria";
    if(!map[c]) map[c]={qty:0,value:0,count:0};
    map[c].qty += Number(i.qty||0);
    map[c].value += Number(i.qty||0)*Number(i.price||0);
    map[c].count += 1;
  });
  return Object.entries(map).sort((a,b)=>b[1].value-a[1].value);
}

function renderDashboardDetails(){
  const cats=groupByCategory().slice(0,5);
  $("dashboardCategories").innerHTML = cats.length ? cats.map(([c,d])=>`<div class="bar-row"><span>${c}</span><strong>${money(d.value)}</strong><div><i style="width:${Math.min(100,d.value/Math.max(1,cats[0][1].value)*100)}%"></i></div></div>`).join("") : `<div class="empty">Sem dados ainda.</div>`;
  const lows=stock.filter(i=>Number(i.qty||0)<=2).slice(0,6);
  $("dashboardLow").innerHTML = lows.length ? lows.map(i=>`<div class="report-item"><strong>${i.productName}</strong><br><span>${i.qty} unidade(s)</span></div>`).join("") : `<div class="report-item">Nenhum item crítico no momento.</div>`;
}

function renderReports(){
  const value=stock.reduce((s,i)=>s+(Number(i.qty||0)*Number(i.price||0)),0);
  $("financialReport").innerHTML=`<div class="report-item"><strong>Total em estoque:</strong><br>${money(value)}</div>`;
  const lows=stock.filter(i=>Number(i.qty||0)<=2);
  $("lowReport").innerHTML=lows.length?lows.map(i=>`<div class="report-item">${i.productName}: <strong>${i.qty}</strong></div>`).join(""):`<div class="report-item">Sem produtos com baixo estoque.</div>`;
  const cats=groupByCategory();
  $("categoryReport").innerHTML=cats.length?cats.map(([c,d])=>`<div class="report-item"><strong>${c}</strong><br>${d.qty} unidade(s) • ${money(d.value)}</div>`).join(""):`<div class="report-item">Sem categorias registradas.</div>`;
  const now=new Date();
  const expiring=stock.filter(i=>{
    if(!i.expiry) return false;
    const diff=(new Date(i.expiry)-now)/(1000*60*60*24);
    return diff<=60;
  }).sort((a,b)=>String(a.expiry).localeCompare(String(b.expiry)));
  $("expiryReport").innerHTML=expiring.length?expiring.map(i=>`<div class="report-item"><strong>${i.productName}</strong><br>Validade: ${i.expiry}</div>`).join(""):`<div class="report-item">Sem produtos vencendo nos próximos 60 dias.</div>`;
  const month=today().slice(0,7);
  const monthRows=customers.filter(i=>String(i.purchaseDate || "").startsWith(month));
  const monthTotal=monthRows.reduce((s,i)=>s+Number(i.amount||0),0);
  const monthPaid=monthRows.filter(i=>i.status==="paid").reduce((s,i)=>s+Number(i.amount||0),0);
  if($("monthlySalesReport")) $("monthlySalesReport").innerHTML=`<div class="report-item"><strong>${monthRows.length}</strong> venda(s) em ${month}<br>Total: ${money(monthTotal)}<br>Recebido: ${money(monthPaid)}</div>`;
  const billing=customers.filter(i=>i.status!=="paid").sort((a,b)=>String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999"))).slice(0,8);
  if($("billingReport")) $("billingReport").innerHTML=billing.length?billing.map(i=>`<div class="report-item"><strong>${escapeHtml(i.customerName)}</strong><br>${billingLabel(i)} • ${money(i.amount)} • ${i.dueDate || "sem data"}</div>`).join(""):`<div class="report-item">Nenhuma cobrança em aberto.</div>`;
}

function stockKey(item){
  return item.code ? `code:${item.code}` : `name:${normalizeText(`${item.name || item.productName || ""} ${item.size || ""}`)}`;
}

function findStockForPurchaseItem(item){
  return stock.find(s=>String(s.productCode || "")===String(item.code || "")) ||
    stock.find(s=>normalizeText(`${s.productName || ""} ${s.size || ""}`)===normalizeText(`${item.name || ""} ${item.size || ""}`));
}

function summarizePurchaseItems(items){
  const map={};
  items.forEach(item=>{
    const key=stockKey(item);
    if(!map[key]) map[key]={...item, qty:0};
    map[key].qty += Number(item.qty || 0);
  });
  return map;
}

async function adjustStockForCustomerItems(previousItems,newItems){
  const before=summarizePurchaseItems(previousItems);
  const after=summarizePurchaseItems(newItems);
  const keys=Array.from(new Set([...Object.keys(before),...Object.keys(after)]));
  for(const key of keys){
    const oldQty=Number(before[key]?.qty || 0);
    const newQty=Number(after[key]?.qty || 0);
    const delta=newQty-oldQty;
    if(!delta) continue;
    const ref=after[key] || before[key];
    const stockItem=findStockForPurchaseItem(ref);
    if(stockItem){
      await saveStockRemote({...stockItem, qty:Math.max(0, Number(stockItem.qty||0)-delta)});
    }
  }
}

function renderGlobalSearch(){
  const input=$("globalSearch");
  const wrap=$("globalSearchResults");
  if(!input || !wrap) return;
  const q=normalizeText(input.value);
  if(!q){
    hide(wrap);
    wrap.innerHTML="";
    return;
  }
  const results=[
    ...customers.filter(i=>normalizeText(`${i.customerName} ${i.phone} ${i.products}`).includes(q)).slice(0,5).map(i=>({type:"Cliente",title:i.customerName,detail:`${money(i.amount)} • ${billingLabel(i)}`,page:"customers"})),
    ...stock.filter(i=>normalizeText(`${i.productName} ${i.productCode} ${i.category}`).includes(q)).slice(0,5).map(i=>({type:"Estoque",title:i.productName,detail:`${i.qty} un. • ${money(i.price)}`,page:"stock"})),
    ...getCatalog().filter(i=>normalizeText(`${i.name} ${i.code} ${i.category}`).includes(q)).slice(0,5).map(i=>({type:"Catálogo",title:i.name,detail:`${i.code} • ${money(i.retail)}`,page:"catalog"}))
  ].slice(0,10);
  wrap.innerHTML=results.length ? results.map(r=>`<button type="button" onclick="showPage('${r.page}'); hide($('globalSearchResults'));">
    <span>${r.type}</span><strong>${escapeHtml(r.title || "-")}</strong><small>${escapeHtml(r.detail || "")}</small>
  </button>`).join("") : `<div class="empty compact">Nada encontrado.</div>`;
  show(wrap);
}

function csvEscape(value){
  return `"${String(value ?? "").replace(/"/g,'""')}"`;
}

function downloadCsv(filename, headers, rows){
  const csv=[headers.map(csvEscape).join(","),...rows.map(row=>headers.map(h=>csvEscape(row[h])).join(","))].join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportStockCsv(){
  downloadCsv(`estoque-${today()}.csv`,["Produto","Codigo","Categoria","Quantidade","Valor unitario","Total","Validade"],stock.map(i=>({
    Produto:i.productName,
    Codigo:i.productCode,
    Categoria:i.category,
    Quantidade:i.qty,
    "Valor unitario":i.price,
    Total:Number(i.qty||0)*Number(i.price||0),
    Validade:i.expiry
  })));
}

function exportCustomersCsv(){
  downloadCsv(`clientes-${today()}.csv`,["Cliente","Telefone","Produtos","Valor","Compra","Cobrar em","Status","Observacoes"],customers.map(i=>({
    Cliente:i.customerName,
    Telefone:i.phone,
    Produtos:i.products,
    Valor:i.amount,
    Compra:i.purchaseDate,
    "Cobrar em":i.dueDate,
    Status:billingLabel(i),
    Observacoes:cleanCustomerNotes(i.notes)
  })));
}

async function saveCustomerForm(e){
  e.preventDefault();
  try{
    const existingId=$("customerEditId").value || "";
    const existingCustomer=existingId ? customers.find(i=>i.id===existingId) : null;
    const previousItems=existingCustomer ? (extractPurchaseItems(existingCustomer.notes).length ? extractPurchaseItems(existingCustomer.notes) : parsePurchaseSummary(existingCustomer.products)) : [];
    const nextItems=customerPurchaseItems.map(item=>({...item}));
    const notes=[String($("customerNotes").value || "").trim(), installmentNotes(), purchaseItemsNote()].filter(Boolean).join("\n");
    const item={
      id:existingId,
      customerName:$("customerName").value.trim(),
      phone:$("customerPhone").value.trim(),
      products:$("customerProducts").value.trim(),
      amount:Number($("customerAmount").value || 0),
      purchaseDate:$("customerPurchaseDate").value || today(),
      dueDate:$("customerDueDate").value || "",
      status:$("customerStatus").value || "pending",
      notes
    };
    await saveCustomerRemote(item);
    await adjustStockForCustomerItems(previousItems,nextItems);
    resetCustomerForm();
    renderAll();
    showPage("customers");
  }catch(err){ alert("Erro ao salvar cliente: "+err.message); }
}

function resetCustomerForm(){
  $("customerForm").reset();
  $("customerPurchaseDate").value=today();
  $("customerEditId").value="";
  $("customerProductQty").value=1;
  $("customerInstallments").value=1;
  $("customerInstallmentGap").value="30";
  customerPurchaseItems=[];
  syncCustomerPurchaseSummary();
  if($("customerStatus")) $("customerStatus").value="pending";
  hide($("cancelCustomerEdit"));
}

function editCustomer(id){
  const i=customers.find(x=>x.id===id);
  if(!i) return;
  showPage("customers");
  const parsedItems=extractPurchaseItems(i.notes);
  const recoveredItems=parsedItems.length ? parsedItems : parsePurchaseSummary(i.products);
  $("customerEditId").value=i.id;
  $("customerName").value=i.customerName || "";
  $("customerPhone").value=i.phone || "";
  $("customerProducts").value=i.products || "";
  $("customerAmount").value=i.amount || 0;
  customerPurchaseItems=recoveredItems;
  renderCustomerSelectedProducts();
  $("customerPurchaseDate").value=i.purchaseDate || today();
  $("customerDueDate").value=i.dueDate || "";
  $("customerStatus").value=i.status || "pending";
  $("customerNotes").value=cleanCustomerNotes(i.notes);
  if(recoveredItems.length) syncCustomerPurchaseSummary();
  show($("cancelCustomerEdit"));
}

async function removeCustomer(id){
  if(!confirm("Deseja excluir este cliente/compra?")) return;
  try{
    await deleteCustomerRemote(id);
    renderAll();
  }catch(err){ alert("Erro ao excluir cliente: "+err.message); }
}

function renderProfile(){
  if(!userProfile) return;
  if($("profileName")) $("profileName").value=userProfile.name || "";
  if($("profileEmail")) $("profileEmail").value=userProfile.email || "";
  if($("profilePhone")) $("profilePhone").value=userProfile.phone || "";
  if($("profileCity")) $("profileCity").value=userProfile.city || "";
  if($("profileNotes")) $("profileNotes").value=userProfile.notes || "";
  if($("profileInfoName")) $("profileInfoName").textContent=userProfile.name || "-";
  if($("profileInfoEmail")) $("profileInfoEmail").textContent=userProfile.email || "-";
  if($("profileInfoUid")) $("profileInfoUid").textContent=userProfile.uid || "-";
}

function renderAll(){
  populateFilters();
  populateDatalist();
  renderMetrics();
  renderDashboardDetails();
  renderStock();
  renderCatalog();
  renderCustomers();
  renderReports();
}

async function saveStockForm(e){
  e.preventDefault();
  try{
    const existingId=$("editId").value;
    const catalogItem=findCatalogBySearch($("productCode").value) || findCatalogBySearch($("productName").value);
    const item={
      id: existingId || "",
      productName:$("productName").value.trim(),
      productCode:$("productCode").value.trim(),
      size:$("productSize").value.trim(),
      qty:Number($("qty").value || 0),
      price:Number($("price").value || 0),
      entryDate:$("entryDate").value || today(),
      expiry:$("expiry").value || "",
      notes:$("notes").value || "",
      category: catalogItem ? (catalogItem.category || "Sem categoria") : "Sem categoria"
    };
    await saveStockRemote(item);
    resetForm();
    renderAll();
    showPage("stock");
  }catch(err){ alert("Erro ao salvar produto: "+err.message); }
}

function resetForm(){
  $("stockForm").reset();
  $("entryDate").value=today();
  $("editId").value="";
  hide($("cancelEdit"));
  hide($("selectedPreview"));
}

function editItem(id){
  const i=stock.find(x=>x.id===id);
  if(!i) return;
  showPage("stock");
  $("editId").value=i.id;
  $("productName").value=i.productName || "";
  $("productCode").value=i.productCode || "";
  $("productSize").value=i.size || "";
  $("qty").value=i.qty || 0;
  $("price").value=i.price || 0;
  $("entryDate").value=i.entryDate || today();
  $("expiry").value=i.expiry || "";
  $("notes").value=i.notes || "";
  show($("cancelEdit"));
}

async function removeItem(id){
  if(!confirm("Deseja excluir este produto do estoque?")) return;
  try{
    await deleteStockRemote(id);
    renderAll();
  }catch(err){ alert("Erro ao excluir: "+err.message); }
}

function addCatalogToStock(code){
  const p=getCatalog().find(x=>x.code===code);
  if(!p) return;
  showPage("stock");
  $("productSearch").value=`${p.name} | ${p.size || ""} | cód. ${p.code || ""}`;
  $("productName").value=p.name || "";
  $("productCode").value=p.code || "";
  $("productSize").value=p.size || "";
  $("qty").value=1;
  $("price").value=Number(p.retail || p.wholesale || 0);
  $("entryDate").value=today();
  $("expiry").value="";
  $("notes").value="";
  $("selectedPreview").innerHTML=`<strong>${p.name}</strong><br><span>${p.category || "Sem categoria"} • ${p.size || ""} • Cód. ${p.code || ""}</span>`;
  show($("selectedPreview"));
}

async function saveProfile(e){
  e.preventDefault();
  try{
    const profile=await request(`${API_BASE}/users/${currentUser.uid}/profile`,{
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        name:$("profileName").value.trim(),
        phone:$("profilePhone").value.trim(),
        city:$("profileCity").value.trim(),
        notes:$("profileNotes").value.trim()
      })
    });
    userProfile=profile;
    currentUser.displayName=profile.name || profile.email;
    $("userLabel").textContent=currentUser.displayName;
    renderProfile();
    showMessage("profileMessage","Perfil salvo com sucesso.","success");
  }catch(err){ showMessage("profileMessage",err.message,"error"); }
}

async function savePassword(e){
  e.preventDefault();
  try{
    await request(`${API_BASE}/users/${currentUser.uid}/password`,{
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({password:$("newPassword").value})
    });
    $("newPassword").value="";
    showMessage("passwordMessage","Senha atualizada com sucesso.","success");
  }catch(err){ showMessage("passwordMessage",err.message,"error"); }
}

function showMessage(id,text,type){
  const el=$(id);
  if(!el) return;
  el.textContent=text;
  el.className=`profile-message ${type}`;
  el.classList.remove("hidden");
}

function openMobileMenu(){
  document.body.classList.add("menu-open");
}
function closeMobileMenu(){
  document.body.classList.remove("menu-open");
}

function bindEvents(){
  $("loginBtn").addEventListener("click", login);
  $("registerBtn").addEventListener("click", register);
  $("logout").addEventListener("click", logout);
  $("quickAdd").addEventListener("click", ()=>showPage("stock"));
  $("stockForm").addEventListener("submit", saveStockForm);
  $("cancelEdit").addEventListener("click", resetForm);
  $("customerForm").addEventListener("submit", saveCustomerForm);
  $("cancelCustomerEdit").addEventListener("click", resetCustomerForm);
  $("addCustomerProduct").addEventListener("click", addCustomerPurchaseItem);
  $("customerInstallments").addEventListener("input", renderInstallmentPreview);
  $("customerInstallmentGap").addEventListener("change", renderInstallmentPreview);
  $("customerDueDate").addEventListener("change", renderInstallmentPreview);
  $("globalSearch").addEventListener("input", renderGlobalSearch);
  $("exportStock").addEventListener("click", exportStockCsv);
  $("exportCustomers").addEventListener("click", exportCustomersCsv);
  $("customerProductSearch").addEventListener("keydown", e=>{
    if(e.key==="Enter"){
      e.preventDefault();
      addCustomerPurchaseItem();
    }
  });
  $("productSearch").addEventListener("input", handleProductSearch);
  $("stockFilter").addEventListener("input", renderStock);
  $("stockCategoryFilter").addEventListener("change", renderStock);
  $("customerFilter").addEventListener("input", renderCustomers);
  $("customerStatusFilter").addEventListener("change", renderCustomers);
  $("catalogFilter").addEventListener("input", renderCatalog);
  $("catalogCategoryFilter").addEventListener("change", renderCatalog);
  $("refreshCatalog").addEventListener("click", renderCatalog);
  $("profileForm").addEventListener("submit", saveProfile);
  $("passwordForm").addEventListener("submit", savePassword);
  $("mobileMenuBtn").addEventListener("click", openMobileMenu);
  $("mobileOverlay").addEventListener("click", closeMobileMenu);
  document.querySelectorAll(".nav").forEach(btn=>btn.addEventListener("click",()=>showPage(btn.dataset.page)));
}

async function autoLogin(){
  const uid=localStorage.getItem(SESSION_KEY);
  if(!uid) return showAuth();
  try{
    const user=await request(`${API_BASE}/users/${uid}/profile`);
    await startSession(user);
  }catch{
    localStorage.removeItem(SESSION_KEY);
    showAuth();
  }
}

window.addEventListener("DOMContentLoaded", ()=>{
  bindEvents();
  $("entryDate").value=today();
  $("customerPurchaseDate").value=today();
  renderCustomerSelectedProducts();
  populateFilters();
  populateDatalist();
  autoLogin();
});
