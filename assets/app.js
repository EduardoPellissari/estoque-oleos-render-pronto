let currentUser = null;
let stock = [];
let userProfile = {};

const $ = (id) => document.getElementById(id);
const API_BASE = location.origin + "/api";
const SESSION_KEY = "essenza_session_uid";

function money(v){ return Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }
function normalizeText(text){ return String(text||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[®™️]/g,"").trim(); }
function today(){ return new Date().toISOString().slice(0,10); }
function show(el){ if(el) el.classList.remove("hidden"); }
function hide(el){ if(el) el.classList.add("hidden"); }

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
    const [profile, rows] = await Promise.all([
      request(`${API_BASE}/users/${currentUser.uid}/profile`),
      request(`${API_BASE}/users/${currentUser.uid}/stock`)
    ]);
    userProfile = profile || {};
    stock = Array.isArray(rows) ? rows : [];
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

function showPage(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  document.querySelectorAll(".nav").forEach(n=>n.classList.remove("active"));
  const pageEl=$(page);
  if(pageEl) pageEl.classList.remove("hidden");
  const nav=document.querySelector(`.nav[data-page="${page}"]`);
  if(nav) nav.classList.add("active");
  const titles={dashboard:"Dashboard",stock:"Meu estoque",catalog:"Catálogo doTERRA",reports:"Relatórios",profile:"Usuários / Perfil"};
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
    <div class="catalog-prices"><span>Venda: ${money(p.retail)}</span><span>Atacado: ${money(p.wholesale)}</span><span>PV: ${p.pv || 0}</span></div>
    <button type="button" onclick="addCatalogToStock('${p.code}')">Adicionar ao estoque</button>
  </article>`).join("");

  if(!rows.length){
    grid.innerHTML = `<div class="empty">Nenhum produto encontrado no catálogo.</div>`;
  }
}

function renderMetrics(){
  const products=stock.length;
  const units=stock.reduce((s,i)=>s+Number(i.qty||0),0);
  const value=stock.reduce((s,i)=>s+(Number(i.qty||0)*Number(i.price||0)),0);
  const low=stock.filter(i=>Number(i.qty||0)<=2).length;
  $("mProducts").textContent=products;
  $("mUnits").textContent=units;
  $("mValue").textContent=money(value);
  $("mLow").textContent=low;
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
  $("productSearch").addEventListener("input", handleProductSearch);
  $("stockFilter").addEventListener("input", renderStock);
  $("stockCategoryFilter").addEventListener("change", renderStock);
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
  populateFilters();
  populateDatalist();
  autoLogin();
});
