// ================= 1. INDEXEDDB इंजन =================
const IDB_NAME = "ChupaKhataIDB";
const IDB_VERSION = 1;
let idb = null;

function initIDB() {
  return new Promise((resolve) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("images")) {
        db.createObjectStore("images", { keyPath: "id" });
      }
    };
    req.onsuccess = (e) => {
      idb = e.target.result;
      resolve(idb);
    };
    req.onerror = (e) => {
      console.warn("IndexedDB fail, fallback:", e);
      resolve(null);
    };
  });
}

function putImageIDB(id, base64) {
  return new Promise((resolve) => {
    if (!idb) return resolve(false);
    try {
      const tx = idb.transaction("images", "readwrite");
      tx.objectStore("images").put({ id, data: base64 });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch(e) { resolve(false); }
  });
}

function getImageIDB(id) {
  return new Promise((resolve) => {
    if (!idb) return resolve(null);
    try {
      const tx = idb.transaction("images", "readonly");
      const req = tx.objectStore("images").get(id);
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => resolve(null);
    } catch(e) { resolve(null); }
  });
}

function deleteImageIDB(id) {
  return new Promise((resolve) => {
    if (!idb) return resolve(false);
    try {
      const tx = idb.transaction("images", "readwrite");
      tx.objectStore("images").delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch(e) { resolve(false); }
  });
}

function getAllImagesIDB() {
  return new Promise((resolve) => {
    if (!idb) return resolve({});
    try {
      const tx = idb.transaction("images", "readonly");
      const req = tx.objectStore("images").getAll();
      req.onsuccess = () => {
        const out = {};
        (req.result || []).forEach(item => { out[item.id] = item.data; });
        resolve(out);
      };
      req.onerror = () => resolve({});
    } catch(e) { resolve({}); }
  });
}

function replaceAllImagesIDB(images) {
  return new Promise((resolve, reject) => {
    if (!idb) return reject(new Error("Image storage उपलब्ध नहीं है"));
    try {
      const tx = idb.transaction("images", "readwrite");
      const store = tx.objectStore("images");
      store.clear();
      Object.entries(images || {}).forEach(([id, data]) => {
        if (typeof data === "string" && data) store.put({ id, data });
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error("Image restore विफल"));
      tx.onabort = () => reject(tx.error || new Error("Image restore रद्द"));
    } catch (e) { reject(e); }
  });
}

// ================= 2. FIREBASE AUTH & FIRESTORE CONFIG =================
const firebaseConfig = {
  apiKey: "AIzaSyA2gMaeYqBnRt5bMu8PB-mZOV5L9CDmtNI",
  authDomain: "chupaji-5b27d.firebaseapp.com",
  projectId: "chupaji-5b27d",
  storageBucket: "chupaji-5b27d.firebasestorage.app",
  messagingSenderId: "989241811334",
  appId: "1:989241811334:web:582cb976abbc4deca54c07",
  measurementId: "G-0VR516Z4P3"
};
try { firebase.initializeApp(firebaseConfig); } catch(e){}
const auth = typeof firebase !== "undefined" && firebase.auth ? firebase.auth() : null;
const db = typeof firebase !== "undefined" && firebase.firestore ? firebase.firestore() : null;
let currentUser = null;

// ================= 3. STORAGE KEYS =================
const PK = "chupaProfile_final", CK = "chupaCustomers_final", EXPK = "chupaExpenses_final";
const RBK = "chupaRecycleBin_final", VK = "chupaVault_final", BK = "chupaBillCount_final";
const CLINIKEY = "chupaClinicProfile_final", PHARMAKEY = "chupaPharmaProfile_final";
const TEACHERKEY = "chupaTeacherProfile_final";
const BLOCKCHAIN_KEY = "chupaBlockchain_final";

function safeSet(k, v) { 
  try { 
    localStorage.setItem(k, JSON.stringify(v)); 
  } catch(e){
    console.error("LocalStorage write error on key:", k, e);
    toast("⚠️ स्टोरेज भर गया है! कृपया बैकअप लें");
  } 
}

function safeGet(k, f) {
  try {
    const r = localStorage.getItem(k);
    if (!r) return f;
    return JSON.parse(r);
  } catch(e) { return f; }
}

async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    await navigator.storage.persist();
  }
}

function triggerVoiceAlert(messageText) {
  if ("speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
      const speech = new SpeechSynthesisUtterance(messageText);
      speech.lang = "hi-IN";
      speech.rate = 1.0;
      speech.pitch = 1.0;
      window.speechSynthesis.speak(speech);
    } catch (e) {}
  }
}

// ================= 4. APP STATE =================
let profile = safeGet(PK, {
  userRole: "merchant",
  shopName: "मेरी दुकान का खाता",
  shopAddress: "मेन बाज़ार, उत्तर प्रदेश",
  shopPhone: "9876543210",
  merchantName: "सत्यप्रकाश सिंह",
  upi: "",
  gstin: ""
});

let clinicProfile = safeGet(CLINIKEY, {
  name: "आरोग्य रिहैब व थेरेपी क्लिनिक",
  doc: "डॉ. आर. पी. सिंह (B.P.T, न्यूरोथेरेपिस्ट)",
  reg: "UP-RMP-2026/A",
  address: "मेन चौराहा, उत्तर प्रदेश",
  phone: "9369913187",
  mapUrl: "https://maps.google.com/?q=27.5706,81.5977"
});

let pharmaProfile = safeGet(PHARMAKEY, {
  name: "आरोग्य मेडिकल व फार्मेसी",
  dl: "UP-DL-8942",
  address: "निकट ज़िला अस्पताल, उत्तर प्रदेश",
  phone: "9369913187",
  mapUrl: "https://maps.google.com/?q=27.5706,81.5977"
});

let teacherProfile = safeGet(TEACHERKEY, {
  name: "रविंद्र प्रताप सिंह",
  subject: "सामान्य विज्ञान (SCIENCE)",
  upi: "",
  idProof: "[Aadhaar Redacted]",
  phone: "9876543210"
});

let customLogoBase64 = "";
let customers = safeGet(CK, []);
let expenses = safeGet(EXPK, []);
let recycleBin = safeGet(RBK, []);

let vault = parseFloat(localStorage.getItem(VK) || "0.00");
if (isNaN(vault)) vault = 0.00;

let billCount = Number(localStorage.getItem(BK) || "101");

let active = null;
let txType = "give";
let currentPartyView = "customer";
let activeBillMode = "kaccha";
let masterGSTRate = 0;
let currentTxImageId = null;
let currentTxTempBase64 = null;
let reportFilterMode = "all";

let cart = [
  { name: "सरसों तेल", qty: 2, unit: "लीटर", rate: 140 },
  { name: "गेहूँ आटा", qty: 5, unit: "किलो", rate: 35 }
];

let pharmaCart = [
  { name: "Paracetamol 650mg", batch: "B-2401", qty: 10, rate: 2.5 },
  { name: "Pantoprazole 40mg", batch: "P-988", qty: 10, rate: 9.0 }
];

let rxTagsLibrary = safeGet("chupaRxTags_final", {
  complaints: ["कमर दर्द (Lumbago)", "सर्वाइकल स्पॉन्डिलाइटिस", "साइटिका (L4-L5 डिस्क)", "घुटने का दर्द (OA)", "फ्रोजन शोल्डर", "माइग्रेन / आधासीसी", "नाभि डिगना / पेट दर्द", "कमजोरी व चक्कर"],
  treatment: ["ड्राई कपिंग थेरेपी (5 Cups)", "वेट कपिंग / डिटॉक्स (हिजामा)", "न्यूरोथेरेपी नवल स्टिम्युलेशन", "Tens + IFT फिजियोथेरेपी", "अल्ट्रासाउंड पेन रिलीफ", "हर्बल पोटली स्वेदन", "स्पाइन ट्रैक्शन"],
  advice: ["तकिया लगाना पूरी तरह बंद रखें", "गरम पानी की सिकाई (दिन में 2 बार)", "कमर सीधी रखकर बैठें", "भारी वज़न बिल्कुल न उठाएं", "सुबह 15 मिनट सूक्ष्म व्यायाम"]
});

let selComplaints = new Set();
let selTreatment = new Set();
let selAdvice = new Set();

// ================= 5. SHA-256 व आंतरिक लेज़र सील =================
async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getDeterministicPayload(b, nonce) {
  return JSON.stringify({
    idx: b.index,
    ts: b.timestamp,
    prev: b.prevHash,
    data: b.data || {},
    nonce: nonce
  });
}

async function auditAndSealReceiptBlock(receiptNo, summary) {
  const todayStr = new Date().toISOString().split("T")[0];
  const dailyCountKey = `chupa_audit_${todayStr}`;
  let count = Number(localStorage.getItem(dailyCountKey) || "0");
  let mintedReward = 0.00;

  let blockchain = safeGet(BLOCKCHAIN_KEY, []);
  if (!blockchain.length) {
    const genesis = { index: 0, timestamp: "GENESIS", prevHash: "0".repeat(64), data: { note: "ROOT_AUDIT" }, nonce: 0, hash: "0".repeat(64) };
    blockchain.push(genesis);
  }
  const lastBlock = blockchain[blockchain.length - 1];

  let newBlock = {
    index: blockchain.length,
    timestamp: new Date().toISOString(),
    prevHash: lastBlock.hash,
    receiptNo: receiptNo,
    data: { summary: summary },
    nonce: 0,
    hash: ""
  };

  let nonce = 0;
  while (true) {
    const hash = await sha256(getDeterministicPayload(newBlock, nonce));
    if (hash.startsWith("00")) {
      newBlock.nonce = nonce;
      newBlock.hash = hash;
      break;
    }
    nonce++;
    if (nonce % 500 === 0) await new Promise(r => setTimeout(r, 0));
  }

  blockchain.push(newBlock);
  safeSet(BLOCKCHAIN_KEY, blockchain);

  if (count < 10) {
    count++;
    localStorage.setItem(dailyCountKey, String(count));
    mintedReward = 0.10;
    vault = Math.round((vault + 0.10) * 100) / 100;
    localStorage.setItem(VK, vault.toFixed(2));
    updateHomeBalances();
  }

  return { block: newBlock, reward: mintedReward, count: count };
}

// ================= 6. UTILITIES & FIRESTORE SUB-COLLECTION SCALING =================
function esc(x){ return String(x??"").replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' })[m]); }
function money(n){ return "₹" + Number(n||0).toLocaleString("en-IN"); }
function bal(c){ return (c.tx||[]).reduce((s,t) => s + (t.type==="give" ? +t.amount : -t.amount), 0); }
function init(n){ return (n||"?").trim().charAt(0) || "?"; }
function toast(s){ let e = document.getElementById("toastMsg"); if(!e) return; e.textContent = s; e.classList.add("show"); clearTimeout(window.tt); window.tt = setTimeout(() => e.classList.remove("show"), 2200); }
function closeModal(id){ const el = document.getElementById(id); if (el) el.style.display = "none"; }

function getLiveShopName(){
  const p = safeGet(PK, profile);
  return p.shopName || profile.shopName || "मेरी दुकान का खाता";
}

function triggerSafePrint(htmlContent) {
  const pArea = document.getElementById("universalPrintArea");
  pArea.innerHTML = htmlContent;

  const cleanup = () => {
    pArea.innerHTML = "";
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);

  setTimeout(() => {
    window.print();
    setTimeout(cleanup, 2000);
  }, 250);
}

// सब-कलेक्शन सिंक
async function syncData(){
  safeSet(CK, customers);
  safeSet(PK, profile);
  safeSet(CLINIKEY, clinicProfile);
  safeSet(PHARMAKEY, pharmaProfile);
  safeSet(TEACHERKEY, teacherProfile);
  safeSet(EXPK, expenses);
  safeSet(RBK, recycleBin);
  safeSet("chupaRxTags_final", rxTagsLibrary);
  try {
    localStorage.setItem(VK, vault.toFixed(2));
    localStorage.setItem(BK, String(billCount));
  } catch(e){}

  if (currentUser && db) {
    try {
      const merchantRef = db.collection("merchants").doc(currentUser.uid);
      
      await merchantRef.set({
        profile, clinicProfile, pharmaProfile, teacherProfile,
        vault, billCount, rxTagsLibrary,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      const batch = db.batch();
      customers.forEach(c => {
        const cRef = merchantRef.collection("customers").doc(String(c.id));
        batch.set(cRef, c);
      });
      await batch.commit();

    } catch (e) {
      console.error("Subcollection cloud sync failed:", e);
      toast("⚠️ क्लाउड सिंक रुका; लोकल डेटा पूर्ण सुरक्षित है");
    }
  }
  updateHomeBalances();
}

function updateHomeBalances(){
  let get = 0, give = 0;
  customers.forEach(c => {
    let b = bal(c);
    if(b >= 0) get += b; else give += Math.abs(b);
  });
  document.getElementById("saGet").textContent = money(get);
  document.getElementById("saGive").textContent = money(give);
  document.getElementById("saShopTitle").textContent = getLiveShopName();
  document.getElementById("saVault").textContent = `🪙 ${vault.toFixed(2)}`;
  
  const logoEl = document.getElementById("saTopLogoImg");
  if (logoEl && customLogoBase64) logoEl.src = customLogoBase64;
}

async function loadCloudDataForUser(user) {
  if (!user || !db) return;
  try {
    const merchantRef = db.collection("merchants").doc(user.uid);
    const snap = await merchantRef.get();
    if (!snap.exists) {
      customers = []; expenses = []; recycleBin = [];
      profile = {
        userRole: "merchant",
        shopName: "मेरी दुकान का खाता", shopAddress: "मेन बाज़ार, उत्तर प्रदेश",
        shopPhone: "", merchantName: user.displayName || "", upi: "", gstin: ""
      };
      syncData();
      toast("✨ नया फ्रेश खाता तैयार हुआ ✓");
      return;
    }

    const d = snap.data() || {};
    if (d.profile) profile = d.profile;
    if (d.clinicProfile) clinicProfile = d.clinicProfile;
    if (d.pharmaProfile) pharmaProfile = d.pharmaProfile;
    if (d.teacherProfile) teacherProfile = d.teacherProfile;
    if (d.rxTagsLibrary) rxTagsLibrary = d.rxTagsLibrary;
    if (d.vault !== undefined) vault = Number(d.vault);
    if (d.billCount !== undefined) billCount = Number(d.billCount);

    const custSnap = await merchantRef.collection("customers").get();
    if (!custSnap.empty) {
      const loadedCusts = [];
      custSnap.forEach(doc => loadedCusts.push(doc.data()));
      customers = loadedCusts;
    }

    safeSet(CK, customers); safeSet(PK, profile); safeSet(CLINIKEY, clinicProfile);
    safeSet(PHARMAKEY, pharmaProfile); safeSet(TEACHERKEY, teacherProfile);
    safeSet("chupaRxTags_final", rxTagsLibrary);
    localStorage.setItem(VK, vault.toFixed(2)); localStorage.setItem(BK, String(billCount));
    updateHomeBalances();
    toast("☁️ असीमित क्लाउड डेटा लोड हो गया");
  } catch (e) {
    console.error("Cloud load failed:", e);
    toast("⚠️ क्लाउड डेटा नहीं पढ़ा जा सका; लोकल डेटा उपलब्ध है");
  }
}

// ================= 7. AUTH =================
if (auth) {
  auth.onAuthStateChanged(user => {
    currentUser = user;
    const nameEl = document.getElementById("authUserName");
    const emailEl = document.getElementById("authUserEmail");
    const subEl = document.getElementById("saAuthSub");
    const btn = document.getElementById("googleAuthBtn");
    if (user) {
      nameEl.textContent = user.displayName || "Google User";
      emailEl.textContent = user.email || "क्लाउड सिंक सक्रिय है";
      subEl.textContent = `🟢 ${user.displayName || 'सिंक एक्टिव'}`;
      btn.innerHTML = '<span>🚪</span> <span>लॉगआउट</span>';
      btn.onclick = handleSignOut;
      loadCloudDataForUser(user);
    } else {
      nameEl.textContent = "लोकल ऑटो-परसिस्ट सक्रिय";
      emailEl.textContent = "डेटा फ़ोन में स्थाई रूप से लॉक है";
      subEl.textContent = "सिंगल स्क्रीन गद्दी • 100% अखंड";
      btn.innerHTML = '<span>G</span> <span>लॉगिन</span>';
      btn.onclick = handleGoogleAuth;
    }
  });
}

function handleGoogleAuth(){
  if (!auth) { toast("Firebase Auth अनुपलब्ध"); return; }
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).then(() => {
    toast("Google लॉगिन सफल ✓");
  }).catch(err => alert("लॉगिन त्रुटि: " + err.message));
}

function handleSignOut(){
  if (!auth) return;
  auth.signOut().then(() => {
    localStorage.clear();
    location.reload();
  });
}

// ================= 8. ROUTING =================
const home = document.getElementById('singleHome');
const page = document.getElementById('singlePage');
const content = document.getElementById('saPageContent');

const pageTitles = {
  customer: 'ग्राहक बहीखाता',
  supplier: 'व्यापारी बहीखाता',
  report: 'हिसाब-किताब रिपोर्ट',
  expense: 'गद्दी रोज़नामचा (खर्च)',
  clinical: 'Clinical Desk (℞ पर्चा)',
  pharmacy: 'फार्मेसी काउंटर',
  billing: 'काउंटर बिलिंग डेस्क',
  insurance: 'बीमा व लोन सेवा',
  banking: 'व्यापारी बैंकिंग',
  buildingB: 'अखंड लेज़र डेस्क (Building B)',
  chupaGk: 'चुपा GK ज्ञान व स्पीड टेस्ट डेस्क',
  videoDesk: 'स्मार्ट पाठशाला (स्वतंत्र वीडियो क्लासरूम व टीचर्स हब)',
  gov: '12 आवश्यक सरकारी पोर्टल व IP डेस्क'
};

function saOpen(type){
  home.style.display = 'none';
  page.style.display = 'block';
  document.getElementById('saPageTitle').textContent = pageTitles[type] || type;
  content.innerHTML = '';
  window.scrollTo(0,0);

  if (type === 'customer' || type === 'supplier') {
    currentPartyView = type;
    renderLedgerView(type);
  } else if (type === 'expense') {
    renderExpenseView();
  } else if (type === 'report') {
    renderReportView();
  } else if (type === 'clinical') {
    renderClinicalView();
  } else if (type === 'pharmacy') {
    renderPharmacyView();
  } else if (type === 'billing') {
    renderBillingView();
  } else if (type === 'buildingB') {
    renderBuildingBView();
  } else if (type === 'chupaGk') {
    renderChupaGkQuizView();
  } else if (type === 'videoDesk') {
    renderVideoDeskView();
  } else if (type === 'gov') {
    renderGovView();
  } else if (type === 'insurance') {
    content.innerHTML = `
      <div class="sa-card" style="text-align:center;padding:24px 14px;">
        <div style="font-size:36px;">🛡️</div>
        <h3 style="margin:8px 0;font-size:16px;">PoSP बीमा सेवा</h3>
        <p style="font-size:11.5px;color:#64748b;line-height:1.5;">दुकान, स्वास्थ्य, जीवन व वाहन बीमा सुविधा सीधे गद्दी से उपलब्ध है।</p>
        <button class="sa-print-btn" onclick="window.open('https://advisor.turtlemintinsurance.com/profile/RAV4412722/ravindra_pratap_singh', '_blank')">बीमा पोर्टल खोलें ↗</button>
      </div>`;
  } else if (type === 'banking') {
    content.innerHTML = `
      <div class="sa-card" style="text-align:center;padding:24px 14px;">
        <div style="font-size:36px;">🏛️</div>
        <h3 style="margin:8px 0;font-size:16px;">व्यापारी बैंकिंग व चालू खाता</h3>
        <p style="font-size:11.5px;color:#64748b;line-height:1.5;">दुकानदारों के लिए जीरो-बैलेंस डिजिटल चालू खाता सुविधा 🔐</p>
        <span style="font-size:10px;padding:3px 10px;background:#fef3c7;color:#92400e;border-radius:10px;font-weight:800;">Coming Soon</span>
      </div>`;
  }
}

function handleDashScroll(){
  const vp = document.getElementById('dashCarousel');
  if(!vp) return;
  const isPage2 = vp.scrollLeft > (vp.clientWidth / 2);
  document.getElementById('dot1').classList.toggle('active', !isPage2);
  document.getElementById('dot2').classList.toggle('active', isPage2);
  document.getElementById('pageLabel').textContent = isPage2 ? 'पेज 2/2' : 'पेज 1/2';
}

function saBack(){
  page.style.display = 'none';
  home.style.display = 'block';
  window.scrollTo(0,0);
  updateHomeBalances();
}

// ================= 9. बहीखाता व लेनदेन =================
function renderLedgerView(type){
  const isCust = (type === 'customer');
  content.innerHTML = `
    <div style="display:flex;gap:6px;margin-bottom:10px;">
      <input id="ledgerSearchInput" class="d-input" placeholder="🔎 नाम या फ़ोन से खोजें..." oninput="filterLedgerList('${type}')">
      <button type="button" class="btn-save" style="width:125px;height:40px;font-size:11.5px;" onclick="openNewCustomerModal('${type}')">
        ＋ नया ${isCust ? 'ग्राहक' : 'व्यापारी'}
      </button>
    </div>
    <div id="ledgerListContainer"></div>
  `;
  filterLedgerList(type);
}

function filterLedgerList(type){
  const q = (document.getElementById("ledgerSearchInput")?.value || "").toLowerCase().trim();
  const box = document.getElementById("ledgerListContainer");
  if(!box) return;

  const list = customers.filter(c => {
    const pType = c.partyType || "customer";
    const matchesType = (pType === type);
    const matchesQuery = ((c.name||"").toLowerCase().includes(q) || String(c.phone||"").includes(q));
    return matchesType && matchesQuery;
  });

  if (!list.length) {
    box.innerHTML = `<div class="sa-card" style="text-align:center;color:#64748b;font-size:12px;">कोई ${type === 'customer' ? 'ग्राहक' : 'व्यापारी'} खाता नहीं मिला</div>`;
    return;
  }

  box.innerHTML = list.map(c => {
    const b = bal(c);
    const isGet = b >= 0;
    return `
      <div class="customer" onclick="openDetailView(${c.id})">
        <div class="left">
          <div class="avatar">${init(c.name)}</div>
          <div>
            <div class="cname">${esc(c.name)}</div>
            <div class="phone">📞 ${esc(c.phone)}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:14px;font-weight:900;" class="${isGet?'receive':'pay'}">${money(Math.abs(b))}</div>
          <div style="font-size:9.5px;font-weight:700;" class="${isGet?'receive':'pay'}">${isGet ? 'लेना है' : 'देना है'}</div>
        </div>
      </div>`;
  }).join("");
}

function openNewCustomerModal(targetType){
  document.getElementById("cName").value = "";
  document.getElementById("cPhone").value = "";
  document.getElementById("cPartyTypeHidden").value = targetType;
  document.getElementById("customerModalTitle").textContent = (targetType === 'customer' ? "＋ नया ग्राहक जोड़ें" : "＋ नया व्यापारी जोड़ें");
  document.getElementById("customerModal").style.display = "flex";
}

function saveCustomer(){
  const n = document.getElementById("cName").value.trim();
  const p = document.getElementById("cPhone").value.trim();
  const pType = document.getElementById("cPartyTypeHidden").value || currentPartyView;
  if(!n){ toast("नाम दर्ज करें"); return; }
  if(!/^\d{10}$/.test(p)){ toast("10 अंकों का फोन नंबर भरें"); return; }

  customers.unshift({ id: Date.now(), name: n, phone: p, partyType: pType, tx: [] });
  syncData();
  closeModal("customerModal");
  filterLedgerList(pType);
  triggerVoiceAlert(`${n} का नया खाता खोला गया`);
  toast(`${pType === 'customer' ? 'ग्राहक' : 'व्यापारी'} खाता खुला ✓`);
}

function openDetailView(id){
  active = id;
  const c = customers.find(x => x.id === id);
  if(!c) return;
  const b = bal(c);
  const isCust = (c.partyType !== 'supplier');

  content.innerHTML = `
    <div class="sa-card" style="text-align:center;padding:16px;">
      <div class="avatar" style="width:48px;height:48px;margin:auto;font-size:18px;">${init(c.name)}</div>
      <h2 style="font-size:17px;font-weight:900;margin-top:6px;">${esc(c.name)}</h2>
      <div style="font-size:11px;color:#64748b;">📞 ${esc(c.phone)} • <span style="color:var(--primary);font-weight:700;">${isCust ? 'ग्राहक' : 'व्यापारी'}</span></div>
      <div style="font-size:24px;font-weight:900;margin:10px 0 2px;color:${b>=0?'var(--red)':'var(--green)'};">${money(Math.abs(b))}</div>
      <div style="font-size:10.5px;font-weight:700;color:var(--muted);">${b>=0?'आपको लेना है (बाकी)':'आपको देना है (जमा)'}</div>

      <button type="button" class="btn-save" style="background:#ecfdf5;color:var(--primary);width:100%;margin-top:10px;height:38px;font-size:11.5px;" onclick="whatsappReminder()">
        💬 WhatsApp भुगतान रिमाइंडर
      </button>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">
        <button type="button" class="btn-save" style="background:var(--red);height:40px;font-size:12px;" onclick="openTxModal('give', -1)">＋ उधार दिया</button>
        <button type="button" class="btn-save" style="background:var(--green);height:40px;font-size:12px;" onclick="openTxModal('get', -1)">✓ भुगतान मिला</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:10px;">
        <button type="button" class="btn-cancel" style="height:36px;font-size:10.5px;background:#fef3c7;color:#92400e;font-weight:800;" onclick="printLedgerSlip()">🖨️ पर्चा (+0.10🪙)</button>
        <button type="button" class="btn-cancel" style="height:36px;font-size:10.5px;" onclick="editCustomer()">✏️ सुधारें</button>
        <button type="button" class="btn-cancel" style="height:36px;font-size:10.5px;background:#fff1f2;color:var(--red);border:1px solid #fecdd3;" onclick="deleteCustomerSafely(${c.id})">🗑️ डिलीट</button>
      </div>
    </div>

    <div style="font-size:12.5px;font-weight:800;margin:12px 4px 6px;">लेन-देन का इतिहास:</div>
    <div id="txDetailContainer"></div>
  `;

  renderTxHistory(c);
}

function deleteCustomerSafely(id) {
  const c = customers.find(x => x.id === id);
  if (!c) return;
  const currentBal = bal(c);
  if (currentBal !== 0) {
    alert(`⚠️ खाता डिलीट नहीं किया जा सकता!\n\nइस खाते पर अभी ₹${Math.abs(currentBal)} का हिसाब बाकी है। खाता हटाने से पहले शेष राशि शून्य (₹0) होनी अनिवार्य है।`);
    return;
  }
  if (!confirm(`क्या आप ${c.name} का खाता हटाना चाहते हैं? यह सुरक्षित रीसायकल बिन में जाएगा।`)) return;

  const idx = customers.findIndex(x => x.id === id);
  const deletedParty = customers.splice(idx, 1)[0];
  recycleBin.unshift({
    id: Date.now(),
    type: "PARTY",
    partyData: deletedParty,
    deletedAt: new Date().toLocaleDateString('hi-IN')
  });
  syncData();
  saOpen(deletedParty.partyType || currentPartyView);
  toast("खाता रीसायकल बिन में भेजा गया 🗑️");
}

function renderTxHistory(c){
  const box = document.getElementById("txDetailContainer");
  if(!box) return;
  if(!c.tx || !c.tx.length){
    box.innerHTML = `<div class="sa-card" style="text-align:center;color:#64748b;font-size:11.5px;">अभी कोई लेन-देन नहीं है</div>`;
    return;
  }
  box.innerHTML = c.tx.slice().reverse().map((t, idx) => {
    const realIdx = c.tx.length - 1 - idx;
    const hasImg = !!t.imgId;
    return `
      <div class="sa-row" style="background:#fff;padding:10px 12px;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:6px;">
        <div>
          <div style="font-weight:800;font-size:12px;">${esc(t.note || (t.type==='give'?'उधार दिया':'भुगतान मिला'))}</div>
          <div style="font-size:9.5px;color:#64748b;margin-top:2px;">
            📅 ${esc(t.date)} 
            ${hasImg ? `<button type="button" onclick="viewBillPhoto('${t.imgId}')" style="margin-left:6px;border:1px solid #cbd5e1;background:#f8fafc;color:#0284c7;font-size:9px;font-weight:800;padding:1px 5px;border-radius:6px;cursor:pointer;">🧾 बिल</button>` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <strong style="color:${t.type==='give'?'var(--red)':'var(--green)'};font-size:13.5px;">
            ${t.type==='give'?'+':'−'} ${money(t.amount)}
          </strong>
          <button type="button" title="हिसाब सुधारें" onclick="openTxModal('${t.type}', ${realIdx})" style="border:0;background:#e0f2fe;color:#0284c7;border-radius:6px;width:24px;height:24px;font-weight:800;">✏️</button>
          <button type="button" title="हटाएं" onclick="deleteTxEntry(${realIdx})" style="border:0;background:#fee2e2;color:#ef4444;border-radius:6px;width:24px;height:24px;font-weight:800;">✕</button>
        </div>
      </div>
    `;
  }).join("");
}

function openTxModal(type, editIdx = -1){
  txType = type;
  document.getElementById("txEditingIndex").value = editIdx;
  const todayStr = new Date().toISOString().split("T")[0];
  const dateInput = document.getElementById("txDate");
  const dateLabel = document.getElementById("txDateLabel");

  dateInput.max = todayStr;
  clearTxImage();

  if(editIdx >= 0){
    const c = customers.find(x => x.id === active);
    const item = c.tx[editIdx];
    document.getElementById("txTitle").textContent = "✏️ हिसाब सुधारें";
    document.getElementById("txAmount").value = item.amount;
    document.getElementById("txNote").value = item.note || "";
    document.getElementById("txSaveBtn").textContent = "सुधार सुरक्षित करें ✓";

    dateInput.value = item.rawDate || todayStr;
    dateInput.disabled = true;
    dateLabel.textContent = "दिनांक (अपरिवर्तनीय 🔒)";

    if(item.imgId){
      currentTxImageId = item.imgId;
      getImageIDB(item.imgId).then(b64 => {
        if(b64) {
          document.getElementById("txImgPreview").src = b64;
          document.getElementById("txImgPreviewBox").style.display = "block";
          document.getElementById("txRemoveImgBtn").style.display = "inline";
        }
      });
    }
  } else {
    document.getElementById("txTitle").textContent = (type === "give" ? "＋ उधार दर्ज करें" : "✓ भुगतान मिला दर्ज करें");
    document.getElementById("txAmount").value = "";
    document.getElementById("txNote").value = "";
    document.getElementById("txSaveBtn").textContent = "हिसाब सेव करें ✓";

    dateInput.value = todayStr;
    dateInput.disabled = false;
    dateLabel.textContent = "दिनांक";
  }

  document.getElementById("txModal").style.display = "flex";
}

function handleBillImageUpload(e){
  const file = e.target.files[0];
  if(!file) return;

  const reader = new FileReader();
  reader.onload = function(evt){
    const img = new Image();
    img.onload = function(){
      const canvas = document.createElement("canvas");
      let w = img.width, h = img.height;
      const maxSide = 1000;
      if(w > maxSide || h > maxSide){
        if(w > h){ h = Math.round((h * maxSide) / w); w = maxSide; }
        else { w = Math.round((w * maxSide) / h); h = maxSide; }
      }
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      currentTxTempBase64 = canvas.toDataURL("image/jpeg", 0.7);

      document.getElementById("txImgPreview").src = currentTxTempBase64;
      document.getElementById("txImgPreviewBox").style.display = "block";
      document.getElementById("txRemoveImgBtn").style.display = "inline";
      toast("बिल फ़ोटो तैयार 📷✓");
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
}

function clearTxImage(){
  currentTxTempBase64 = null;
  currentTxImageId = null;
  document.getElementById("txBillFile").value = "";
  document.getElementById("txImgPreviewBox").style.display = "none";
  document.getElementById("txRemoveImgBtn").style.display = "none";
}

async function viewBillPhoto(imgId){
  const b64 = await getImageIDB(imgId);
  if(!b64){ toast("फ़ोटो लोड नहीं हो सकी"); return; }
  document.getElementById("viewerImage").src = b64;
  document.getElementById("billViewerModal").style.display = "flex";
}

async function saveTx(){
  const a = Number(document.getElementById("txAmount").value);
  const note = document.getElementById("txNote").value.trim();
  const selDate = document.getElementById("txDate").value;
  const editIdx = parseInt(document.getElementById("txEditingIndex").value);

  if(!a || a <= 0){ toast("मान्य राशि दर्ज करें"); return; }
  const c = customers.find(x => x.id === active);
  if(!c) return;
  if(!c.tx) c.tx = [];

  const now = new Date();
  let dStr = "";
  if(selDate){
    const [y, m, d] = selDate.split("-");
    const mNames = ['जन॰','फ़र॰','मार्च','अप्रैल','मई','जून','जुलाई','अग॰','सित॰','अक्तू॰','नव॰','दिस॰'];
    dStr = `${Number(d)} ${mNames[Number(m)-1]} ${y}`;
  } else {
    dStr = now.toLocaleDateString('hi-IN');
  }

  let finalImgId = currentTxImageId;
  if (currentTxTempBase64) {
    finalImgId = "img_" + Date.now() + "_" + Math.floor(Math.random()*1000);
    const imageSaved = await putImageIDB(finalImgId, currentTxTempBase64);
    if (!imageSaved) {
      toast("⚠️ बिल फ़ोटो सेव नहीं हुई। स्टोरेज अनुमति/जगह जाँचें; हिसाब सेव नहीं किया गया");
      return;
    }
  }

  if(editIdx >= 0 && c.tx[editIdx]){
    if (c.tx[editIdx].imgId && c.tx[editIdx].imgId !== finalImgId) {
      await deleteImageIDB(c.tx[editIdx].imgId);
    }
    c.tx[editIdx].amount = a;
    c.tx[editIdx].note = note;
    c.tx[editIdx].imgId = finalImgId;
    toast("हिसाब अपडेट हुआ ✏️✓");
  } else {
    c.tx.push({ amount: a, type: txType, note, date: dStr, rawDate: selDate, imgId: finalImgId });
    
    const voiceMsg = (txType === "give") 
      ? `${c.name} के खाते में ${a} रुपये उधार दर्ज हुआ` 
      : `${c.name} से ${a} रुपये भुगतान प्राप्त हुआ`;
    triggerVoiceAlert(voiceMsg);

    toast("हिसाब सुरक्षित हुआ ✓");
  }

  syncData();
  closeModal("txModal");
  openDetailView(active);
}

async function deleteTxEntry(i){
  const c = customers.find(x => x.id === active);
  if(!c || !c.tx || !c.tx[i]) return;
  if(!confirm("क्या यह प्रविष्टि हटाना चाहते हैं?")) return;

  const removed = c.tx.splice(i, 1)[0];
  recycleBin.unshift({
    id: Date.now(), type: "TX", custId: c.id, custName: c.name, tx: removed,
    deletedAt: new Date().toLocaleDateString('hi-IN')
  });
  syncData();
  openDetailView(active);
  toast("प्रविष्टि रीसायकल बिन में भेजी गई 🗑️");
}

function editCustomer(){
  const c = customers.find(x => x.id === active);
  if(!c) return;
  const newName = prompt("नाम संपादित करें:", c.name);
  if(!newName || !newName.trim()) return;
  const newPhone = prompt("मोबाइल नंबर (10 अंक):", c.phone);
  if(!newPhone || !/^\d{10}$/.test(newPhone.trim())) return;

  c.name = newName.trim();
  c.phone = newPhone.trim();
  syncData();
  openDetailView(c.id);
  toast("विवरण अपडेट हुआ ✓");
}

function whatsappReminder(){
  const c = customers.find(x => x.id === active);
  if(!c) return;
  const b = bal(c);
  if(b <= 0){ alert("इस खाते पर कोई बाकी नहीं है!"); return; }
  const currentShop = getLiveShopName();
  const msg = `नमस्ते *${c.name}* जी 🙏\n${currentShop} पर आपका कुल *₹${b}* का हिसाब बाकी है।\nकृपया समय पर चुकता करें।${profile.upi ? `\nUPI ID: ${profile.upi}` : ''}\n\nधन्यवाद!`;
  window.open(`https://wa.me/91${c.phone}?text=${encodeURIComponent(msg)}`, "_blank");
}

async function printLedgerSlip(){
  const c = customers.find(x => x.id === active);
  if(!c) return;
  const b = bal(c);
  const isCust = (c.partyType !== 'supplier');
  const currentShop = getLiveShopName();
  
  let seq = Number(localStorage.getItem("chupa_receipt_seq") || "0") + 1;
  localStorage.setItem("chupa_receipt_seq", String(seq));
  const receiptNo = "CHUPA-" + String(seq).padStart(5, "0");

  const sortedTx = [...(c.tx || [])].sort((x, y) => {
    const dx = x.rawDate ? new Date(x.rawDate) : new Date(0);
    const dy = y.rawDate ? new Date(y.rawDate) : new Date(0);
    return dx - dy;
  });

  let rows = "";
  sortedTx.slice(-25).forEach((t, i) => {
    rows += `<tr>
      <td style="padding:3px 4px;border-bottom:1px solid #e2e8f0;text-align:center;">${i+1}</td>
      <td style="padding:3px 4px;border-bottom:1px solid #e2e8f0;">${t.date}</td>
      <td style="padding:3px 4px;border-bottom:1px solid #e2e8f0;">${esc(t.note||'-')}</td>
      <td style="padding:3px 4px;text-align:right;border-bottom:1px solid #e2e8f0;font-weight:700;color:${t.type==='give'?'#e11d48':'#059669'};">
        ${t.type==='give'?'+':'−'} ₹${t.amount}
      </td>
    </tr>`;
  });

  const auditRes = await auditAndSealReceiptBlock(receiptNo, `${c.name} शेष: ₹${Math.abs(b)}`);
  triggerVoiceAlert(`आधिकारिक पर्चा ${receiptNo} प्रमाणित हुआ`);

  const printHtml = `
    <div class="print-page-a4">
      <div style="border-bottom:2px solid #075c43;padding-bottom:4px;display:flex;justify-content:space-between;align-items:flex-end;">
        <div>
          <h1 style="font-size:15pt;margin:0;color:#075c43;font-weight:900;">${esc(currentShop)}</h1>
          <p style="font-size:8pt;color:#475569;margin:2px 0;">${esc(profile.shopAddress)}</p>
          <p style="font-size:8pt;color:#475569;">संपर्क: <b>${esc(profile.shopPhone)}</b> ${profile.gstin ? `| GSTIN: <b>${esc(profile.gstin)}</b>` : ''}</p>
          <p style="font-size:8.5pt;font-weight:700;margin-top:2px;">खाताधारक: ${esc(c.name)} | 📞 ${esc(c.phone)}</p>
        </div>
        <div style="text-align:right;">
          <div style="background:#eaf5ef;color:#075c43;padding:2px 8px;border-radius:4px;font-size:9pt;font-weight:800;">
            ${isCust ? 'ग्राहक खाता विवरण' : 'व्यापारी बही विवरण'}
          </div>
          <div style="font-size:8pt;color:#64748b;margin-top:2px;">दिनांक: ${new Date().toLocaleDateString('hi-IN')}</div>
          <div style="font-family:monospace;font-size:8pt;font-weight:700;color:#075c43;">${receiptNo}</div>
        </div>
      </div>

      <table style="width:100%;font-size:8.5pt;margin-top:6px;">
        <thead>
          <tr style="background:#f8fafc;border-top:1px solid #075c43;border-bottom:1px solid #075c43;color:#075c43;">
            <th style="width:6%;text-align:center;">#</th>
            <th style="width:24%;text-align:left;">दिनांक</th>
            <th style="width:48%;text-align:left;">विवरण</th>
            <th style="width:22%;text-align:right;">रकम</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="4" style="text-align:center;padding:10px;">कोई लेन-देन नहीं है</td></tr>'}</tbody>
      </table>

      <div style="margin-top:6px;border-top:1.5px solid #075c43;padding-top:4px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:9pt;font-weight:700;">कुल शेष (Net Balance):</span>
        <span style="font-size:12pt;font-weight:900;color:${b>=0?'#e11d48':'#059669'};">
          ${b>=0?'लेना है: ':'देना है: '}₹${Math.abs(b)}
        </span>
      </div>

      <div style="margin-top:6px;border-top:1px dashed #075c43;padding-top:4px;display:flex;justify-content:space-between;align-items:center;font-size:7pt;color:#475569;">
        <div>
          <div>🔒 सुरक्षा सील: <span style="font-family:monospace;">${auditRes.block.hash}</span></div>
          <div>🔗 डिजिटल पर्चा #${auditRes.block.index} | क्रमिक पर्चा: ${receiptNo} • 100% अखंड बहीखाता पर्ची</div>
        </div>
        <div style="text-align:right;font-size:8pt;font-weight:800;color:#075c43;">
          🪙 ${auditRes.reward > 0 ? '+0.10 ऑडिट रिवॉर्ड' : 'दैनिक सीमा पूर्ण'} [${auditRes.count}/10]
        </div>
      </div>
    </div>
  `;
  triggerSafePrint(printHtml);
}

// ================= 10. रोज़नामचा =================
function renderExpenseView(){
  content.innerHTML = `
    <div class="sa-card">
      <div style="font-size:12px;font-weight:800;color:#b45309;margin-bottom:8px;">＋ नया खर्च दर्ज करें</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
        <input id="expAmt" type="number" class="d-input" placeholder="रकम ₹">
        <select id="expCat" class="d-input" style="background:#fff;">
          <option>दूध व किराना</option>
          <option>दुकान खर्च / भाड़ा</option>
          <option>चाय-नाश्ता</option>
          <option>किराया व बिजली</option>
          <option>अन्य खर्च</option>
        </select>
      </div>
      <input id="expNote" class="d-input" style="margin-bottom:6px;" placeholder="विवरण (उदा. 2L तेल)">
      <button type="button" class="btn-save" style="background:#b45309;width:100%;height:38px;font-size:12px;" onclick="addExpense()">खर्च सेव करें ✓</button>
    </div>
    <div style="font-size:12px;font-weight:800;margin:12px 2px 6px;">हालिया खर्च सूची:</div>
    <div id="expListContainer"></div>
  `;
  renderExpensesList();
}

function addExpense(){
  const a = Number(document.getElementById("expAmt").value);
  const c = document.getElementById("expCat").value;
  const n = document.getElementById("expNote").value.trim();
  if(!a || a <= 0){ toast("खर्च राशि दर्ज करें"); return; }

  expenses.unshift({ id: Date.now(), amount: a, category: c, note: n || c, date: new Date().toLocaleDateString('hi-IN'), rawDate: new Date().toISOString().split("T")[0] });
  triggerVoiceAlert(`गद्दी रोज़नामचा: ${a} रुपये का खर्च दर्ज हुआ`);
  syncData();
  renderExpensesList();
  document.getElementById("expAmt").value = "";
  document.getElementById("expNote").value = "";
  toast("खर्च सुरक्षित हुआ ✓");
}

function renderExpensesList(){
  const box = document.getElementById("expListContainer");
  if(!box) return;
  if(!expenses.length){
    box.innerHTML = `<div class="sa-card" style="text-align:center;color:#64748b;font-size:11.5px;">कोई खर्च दर्ज नहीं है</div>`;
    return;
  }
  box.innerHTML = expenses.slice(0, 20).map((e, idx) => `
    <div class="sa-row" style="background:#fff;padding:8px 12px;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:6px;">
      <div>
        <div style="font-weight:800;font-size:11.5px;">${esc(e.note)} <span style="font-size:9px;background:#fef3c7;color:#92400e;padding:1px 4px;border-radius:4px;">${esc(e.category)}</span></div>
        <div style="font-size:9.5px;color:#64748b;">${esc(e.date)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <strong style="color:#b45309;font-size:12.5px;">₹${Number(e.amount).toLocaleString('en-IN')}</strong>
        <button type="button" onclick="deleteExpenseEntry(${idx})" style="border:0;background:#fee2e2;color:#ef4444;border-radius:6px;width:22px;height:22px;font-weight:800;">✕</button>
      </div>
    </div>
  `).join("");
}

function deleteExpenseEntry(idx){
  expenses.splice(idx, 1);
  syncData();
  renderExpensesList();
  toast("खर्च हटाया गया 🗑️");
}

// ================= 11. हिसाब रिपोर्ट =================
function renderReportView(){
  content.innerHTML = `
    <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:8px;margin-bottom:8px;">
      <button type="button" class="filter-pill ${reportFilterMode==='all'?'active':''}" onclick="setReportPeriod('all')">सब हिसाब</button>
      <button type="button" class="filter-pill ${reportFilterMode==='today'?'active':''}" onclick="setReportPeriod('today')">आज</button>
      <button type="button" class="filter-pill ${reportFilterMode==='week'?'active':''}" onclick="setReportPeriod('week')">इस हफ्ते</button>
      <button type="button" class="filter-pill ${reportFilterMode==='month'?'active':''}" onclick="setReportPeriod('month')">इस महीने</button>
      <button type="button" class="filter-pill ${reportFilterMode==='year'?'active':''}" onclick="setReportPeriod('year')">इस साल</button>
      <button type="button" class="filter-pill ${reportFilterMode==='custom'?'active':''}" onclick="setReportPeriod('custom')">तारीख से तारीख 📅</button>
    </div>

    <div id="customDateRangeBox" style="display:${reportFilterMode==='custom'?'grid':'none'};grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;background:#fff;padding:10px;border-radius:12px;border:1px solid #cbd5e1;">
      <div>
        <label style="font-size:10px;font-weight:800;color:#64748b;">आरंभ (From):</label>
        <input type="date" id="repFromDate" class="d-input" style="height:34px;font-size:11px;" onchange="applyCustomDateFilter()">
      </div>
      <div>
        <label style="font-size:10px;font-weight:800;color:#64748b;">समाप्त (To):</label>
        <input type="date" id="repToDate" class="d-input" style="height:34px;font-size:11px;" onchange="applyCustomDateFilter()">
      </div>
    </div>
    <div id="reportSummaryCardsBox"></div>
  `;
  calculateAndRenderReport();
}

function setReportPeriod(period){
  reportFilterMode = period;
  renderReportView();
}

function applyCustomDateFilter(){
  calculateAndRenderReport();
}

function calculateAndRenderReport(){
  const box = document.getElementById("reportSummaryCardsBox");
  if(!box) return;

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  let fromDate = null, toDate = null;

  if(reportFilterMode === 'today'){
    fromDate = todayStr; toDate = todayStr;
  } else if(reportFilterMode === 'week'){
    const prevWeek = new Date();
    prevWeek.setDate(now.getDate() - 7);
    fromDate = prevWeek.toISOString().split("T")[0]; toDate = todayStr;
  } else if(reportFilterMode === 'month'){
    const prevMonth = new Date();
    prevMonth.setDate(now.getDate() - 30);
    fromDate = prevMonth.toISOString().split("T")[0]; toDate = todayStr;
  } else if(reportFilterMode === 'year'){
    const prevYear = new Date();
    prevYear.setDate(now.getDate() - 365);
    fromDate = prevYear.toISOString().split("T")[0]; toDate = todayStr;
  } else if(reportFilterMode === 'custom'){
    fromDate = document.getElementById("repFromDate")?.value || null;
    toDate = document.getElementById("repToDate")?.value || null;
  }

  let totalGet = 0, totalGive = 0, txCount = 0;

  customers.forEach(c => {
    (c.tx || []).forEach(t => {
      let match = true;
      const raw = t.rawDate || todayStr;
      if(fromDate && raw < fromDate) match = false;
      if(toDate && raw > toDate) match = false;

      if(match){
        txCount++;
        if(t.type === 'give') totalGive += Number(t.amount || 0);
        else totalGet += Number(t.amount || 0);
      }
    });
  });

  let totalExp = 0;
  expenses.forEach(e => {
    let match = true;
    const raw = e.rawDate || todayStr;
    if(fromDate && raw < fromDate) match = false;
    if(toDate && raw > toDate) match = false;
    if(match) totalExp += Number(e.amount || 0);
  });

  box.innerHTML = `
    <div class="sa-card">
      <div class="sa-row"><span>कुल लेन-देन:</span><b>${txCount}</b></div>
      <div class="sa-row"><span>कुल मिला (आवक):</span><b style="color:var(--green);">${money(totalGet)}</b></div>
      <div class="sa-row"><span>कुल उधार (बाकी):</span><b style="color:var(--red);">${money(totalGive)}</b></div>
      <div class="sa-row"><span>कुल दर्ज खर्च:</span><b style="color:#b45309;">${money(totalExp)}</b></div>
      <button class="sa-print-btn" onclick="printCustomReport('${fromDate||''}','${toDate||''}',${totalGet},${totalGive},${totalExp})">
        🖨️ हिसाब रिपोर्ट प्रिंट करें
      </button>
    </div>
  `;
}

function printCustomReport(from, to, get, give, exp){
  const periodText = (from && to) ? `${from} से ${to}` : 'सम्पूर्ण खाता ब्योरा';
  const currentShop = getLiveShopName();

  const printHtml = `
    <div class="print-page-a4">
      <div style="border-bottom:2px solid #075c43;padding-bottom:10px;display:flex;justify-content:space-between;">
        <div>
          <h1 style="font-size:22px;margin:0;color:#075c43;font-weight:900;">${esc(currentShop)}</h1>
          <p style="font-size:11px;color:#475569;margin:2px 0;">${esc(profile.shopAddress)} | संपर्क: ${esc(profile.shopPhone)}</p>
        </div>
        <div style="text-align:right;">
          <div style="background:#eaf5ef;color:#075c43;padding:4px 8px;border-radius:6px;font-size:12px;font-weight:800;">व्यापार हिसाब रिपोर्ट</div>
          <div style="font-size:10px;color:#64748b;margin-top:3px;">अवधि: ${periodText}</div>
        </div>
      </div>
      <div style="margin:20px 0;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
        <div style="border:1px solid #cbd5e1;padding:12px;border-radius:8px;text-align:center;">
          <small style="color:#64748b;font-size:11px;">भुगतान आवक (मिला)</small>
          <div style="font-size:18px;font-weight:900;color:#059669;margin-top:4px;">${money(get)}</div>
        </div>
        <div style="border:1px solid #cbd5e1;padding:12px;border-radius:8px;text-align:center;">
          <small style="color:#64748b;font-size:11px;">कुल दिया उधार</small>
          <div style="font-size:18px;font-weight:900;color:#e11d48;margin-top:4px;">${money(give)}</div>
        </div>
        <div style="border:1px solid #cbd5e1;padding:12px;border-radius:8px;text-align:center;">
          <small style="color:#64748b;font-size:11px;">कुल दुकान/घरेलू खर्च</small>
          <div style="font-size:18px;font-weight:900;color:#b45309;margin-top:4px;">${money(exp)}</div>
        </div>
      </div>
    </div>
  `;
  triggerSafePrint(printHtml);
}

// ================= 12. क्लिनिकल डेस्क =================
function renderClinicalView(){
  content.innerHTML = `
    <div class="sa-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div>
          <b style="font-size:14px;color:var(--primary);">${esc(clinicProfile.name)}</b>
          <div style="font-size:10px;color:#64748b;">${esc(clinicProfile.doc)} | ${esc(clinicProfile.reg)}</div>
        </div>
        <span style="font-size:9.5px;color:var(--muted);background:#f1f5f9;padding:3px 6px;border-radius:6px;">👤 प्रोफाइल से सेट</span>
      </div>

      <div style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:6px;margin-bottom:8px;">
        <input id="rxPtName" class="d-input" placeholder="मरीज़ का नाम *">
        <input id="rxPtAgeGen" class="d-input" placeholder="42 / M">
      </div>
      <input id="rxPtPhone" type="tel" class="d-input" style="margin-bottom:8px;" placeholder="WhatsApp नंबर">

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-size:11px;font-weight:800;color:#475569;">लक्षण (चुनें या नया जोड़ें):</span>
        <button type="button" onclick="openRxCustomAdder('c')" style="border:0;background:#f0fdf4;color:var(--primary);font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:6px;cursor:pointer;">＋ नया जोड़ें</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;" id="cloudComplaintsBox"></div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-size:11px;font-weight:800;color:#475569;">थेरेपी व दवा (℞):</span>
        <button type="button" onclick="openRxCustomAdder('t')" style="border:0;background:#f0fdf4;color:var(--primary);font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:6px;cursor:pointer;">＋ नया जोड़ें</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;" id="cloudTreatmentBox"></div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-size:11px;font-weight:800;color:#475569;">परहेज व कसरत (Advice):</span>
        <button type="button" onclick="openRxCustomAdder('a')" style="border:0;background:#f0fdf4;color:var(--primary);font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:6px;cursor:pointer;">＋ नया जोड़ें</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;" id="cloudAdviceBox"></div>

      <div style="margin-bottom:10px;">
        <label style="font-size:10.5px;font-weight:800;color:#64748b;display:block;margin-bottom:3px;">विशेष क्लिनिकल विवरण व खुराक:</label>
        <textarea id="rxDetailedNotes" class="d-input" style="height:65px;padding:6px;resize:none;font-size:11.5px;" placeholder="उदा. सुबह खाली पेट 1 गोली, 3 दिन बाद फॉलो-अप सिटिंग..."></textarea>
      </div>

      <button type="button" class="sa-print-btn" onclick="printStandardRx()">🖨️ स्टैंडर्ड ℞ पर्चा प्रिंट करें</button>
    </div>
  `;
  renderRxChipsDomOnly();
}

function renderRxChipsDomOnly(){
  const cBox = document.getElementById("cloudComplaintsBox");
  const tBox = document.getElementById("cloudTreatmentBox");
  const aBox = document.getElementById("cloudAdviceBox");

  if(cBox) cBox.innerHTML = rxTagsLibrary.complaints.map(t => `<span class="rx-tag ${selComplaints.has(t)?'active':''}" onclick="toggleRxChipSafely('c','${t}',this)">${t}</span>`).join("");
  if(tBox) tBox.innerHTML = rxTagsLibrary.treatment.map(t => `<span class="rx-tag ${selTreatment.has(t)?'active':''}" onclick="toggleRxChipSafely('t','${t}',this)">${t}</span>`).join("");
  if(aBox) aBox.innerHTML = rxTagsLibrary.advice.map(t => `<span class="rx-tag ${selAdvice.has(t)?'active':''}" onclick="toggleRxChipSafely('a','${t}',this)">${t}</span>`).join("");
}

function toggleRxChipSafely(type, val, element){
  let set = (type === 'c' ? selComplaints : (type === 't' ? selTreatment : selAdvice));
  if(set.has(val)){
    set.delete(val);
    element.classList.remove("active");
  } else {
    set.add(val);
    element.classList.add("active");
  }
}

function openRxCustomAdder(type){
  document.getElementById("rxCustomTypeHidden").value = type;
  document.getElementById("rxCustomInputText").value = "";
  document.getElementById("rxCustomModalTitle").textContent = (type === 'c' ? "＋ नया लक्षण जोड़ें" : (type === 't' ? "＋ नई थेरेपी जोड़ें" : "＋ नया परहेज जोड़ें"));
  document.getElementById("rxCustomModal").style.display = "flex";
}

function saveCustomRxChip(){
  const val = document.getElementById("rxCustomInputText").value.trim();
  const type = document.getElementById("rxCustomTypeHidden").value;
  if(!val) return;

  if(type === 'c'){ if(!rxTagsLibrary.complaints.includes(val)) rxTagsLibrary.complaints.push(val); selComplaints.add(val); }
  else if(type === 't'){ if(!rxTagsLibrary.treatment.includes(val)) rxTagsLibrary.treatment.push(val); selTreatment.add(val); }
  else if(type === 'a'){ if(!rxTagsLibrary.advice.includes(val)) rxTagsLibrary.advice.push(val); selAdvice.add(val); }

  syncData();
  closeModal("rxCustomModal");
  renderRxChipsDomOnly();
  toast("पर्चे में नया आइटम जुड़ा ✓");
}

function printStandardRx(){
  const name = document.getElementById("rxPtName").value.trim();
  if(!name){ alert("कृपया मरीज़ का नाम दर्ज करें!"); return; }
  const age = document.getElementById("rxPtAgeGen").value.trim() || "-";
  const phone = document.getElementById("rxPtPhone").value.trim() || "-";
  const extraNotes = document.getElementById("rxDetailedNotes")?.value.trim() || "";
  const c = Array.from(selComplaints).join(", ") || "सामान्य क्लिनिकल परीक्षण";
  const t = Array.from(selTreatment).map((x,i) => `<div><b>${i+1}.</b> ${x}</div>`).join("") || "परामर्श दिया गया";
  const a = Array.from(selAdvice).map(x => `<div>• ${x}</div>`).join("") || "सावधानी रखें";
  const today = new Date().toLocaleDateString('hi-IN');

  const printHtml = `
    <div class="print-page-a4">
      <div style="border-bottom:2px solid #075c43;padding-bottom:10px;display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <h1 style="font-size:22px;font-weight:900;color:#075c43;margin:0;">${esc(clinicProfile.name)}</h1>
          <p style="font-size:12.5px;font-weight:800;margin:3px 0;">${esc(clinicProfile.doc)}</p>
          <p style="font-size:11px;color:#334155;">पंजीकरण सं.: <b>${esc(clinicProfile.reg)}</b></p>
          <p style="font-size:10.5px;color:#64748b;">${esc(clinicProfile.address)} | फ़ोन: ${esc(clinicProfile.phone)}</p>
        </div>
        <div style="text-align:right;">
          <div style="font-size:32px;font-weight:900;color:#075c43;line-height:1;">℞</div>
          <div style="font-size:11px;font-weight:700;margin-top:6px;">दिनांक: ${today}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px dashed #cbd5e1;font-size:12px;">
        <div>मरीज़ का नाम: <b>${esc(name)}</b> (${esc(age)})</div>
        <div>संपर्क नंबर: <b>${esc(phone)}</b></div>
      </div>
      <div style="margin-top:16px;line-height:1.7;">
        <div style="font-size:11.5px;font-weight:800;color:#475569;">लक्षण व समस्या:</div>
        <div style="font-size:13px;margin-bottom:12px;background:#f8fafc;padding:6px 10px;border-radius:6px;border:1px solid #e2e8f0;">${esc(c)}</div>
        <div style="font-size:11.5px;font-weight:800;color:#475569;">उपचार व थेरेपी प्रोटोकॉल (℞):</div>
        <div style="font-size:13px;margin-bottom:12px;padding:6px 10px;">${t}</div>
        <div style="font-size:11.5px;font-weight:800;color:#475569;">परहेज व कसरत:</div>
        <div style="font-size:12.5px;margin-bottom:12px;padding:6px 10px;">${a}</div>
        ${extraNotes ? `<div style="font-size:11.5px;font-weight:800;color:#475569;">विशेष निर्देश:</div><div style="font-size:12.5px;background:#f8fafc;padding:8px 10px;border-radius:6px;border:1px solid #e2e8f0;">${esc(extraNotes)}</div>` : ''}
      </div>
      <div style="margin-top:70px;display:flex;justify-content:space-between;align-items:flex-end;">
        <div style="font-size:10px;color:#64748b;">डिजिटल क्लिनिकल पर्चा • चुपाकाबरा 🐉</div>
        <div style="text-align:center;font-size:11.5px;font-weight:800;border-top:1px solid #000;width:150px;padding-top:4px;">अधिकृत हस्ताक्षर</div>
      </div>
    </div>
  `;
  triggerSafePrint(printHtml);
}

// ================= 13. फार्मेसी काउंटर =================
function renderPharmacyView(){
  content.innerHTML = `
    <div class="sa-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div>
          <b style="font-size:14px;color:var(--primary);">${esc(pharmaProfile.name)}</b>
          <div style="font-size:10px;color:#64748b;">D.L. सं.: ${esc(pharmaProfile.dl)}</div>
        </div>
        <span style="font-size:9.5px;color:var(--muted);background:#f1f5f9;padding:3px 6px;border-radius:6px;">👤 प्रोफाइल से सेट</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
        <input id="phCustName" class="d-input" placeholder="मरीज़ का नाम">
        <input id="phDocRef" class="d-input" placeholder="डॉक्टर संदर्भ">
      </div>
      <table style="width:100%;font-size:11px;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid #e2e8f0;color:#64748b;">
            <th style="text-align:left;padding:4px 2px;">दवा नाम</th>
            <th style="text-align:left;padding:4px 2px;">बैच</th>
            <th style="text-align:center;padding:4px 2px;">मात्रा</th>
            <th style="text-align:right;padding:4px 2px;">दर (₹)</th>
            <th style="width:24px;"></th>
          </tr>
        </thead>
        <tbody id="pharmaTableBody"></tbody>
      </table>
      <button type="button" onclick="addPharmaRow()" style="border:0;background:#f0f9ff;color:#0284c7;font-size:11px;font-weight:800;padding:6px;border-radius:8px;margin-top:8px;width:100%;">＋ नई दवा जोड़ें</button>
      <div style="margin-top:10px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:12px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="color:#64748b;">उप-योग:</span>
          <strong id="phSubTotal">₹0.00</strong>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="color:#64748b;">छूट (Discount):</span>
          <div style="display:flex;align-items:center;gap:3px;">
            <span>₹</span>
            <input type="number" id="phDiscount" value="0" oninput="recalcPharma()" style="width:65px;height:26px;border:1px solid var(--line);border-radius:6px;text-align:right;padding:2px 4px;font-size:11px;">
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:900;border-top:1px solid #e2e8f0;padding-top:4px;">
          <span>कुल देय:</span>
          <strong id="phGrandTotal" style="color:var(--primary);">₹0.00</strong>
        </div>
      </div>
      <button class="sa-print-btn" onclick="printPharmaBill()">🖨️ फार्मेसी बिल प्रिंट</button>
    </div>
  `;
  renderPharmaTableRows();
}

function renderPharmaTableRows(){
  const tb = document.getElementById("pharmaTableBody");
  if(!tb) return;
  tb.innerHTML = pharmaCart.map((it, idx) => `
    <tr>
      <td style="padding:2px;"><input type="text" value="${esc(it.name)}" oninput="pharmaCart[${idx}].name=this.value" class="d-input" style="height:30px;font-size:11px;padding:2px 4px;"></td>
      <td style="padding:2px;"><input type="text" value="${esc(it.batch)}" oninput="pharmaCart[${idx}].batch=this.value" class="d-input" style="height:30px;font-size:11px;padding:2px 4px;"></td>
      <td style="padding:2px;"><input type="number" value="${it.qty}" oninput="pharmaCart[${idx}].qty=Number(this.value);recalcPharma()" class="d-input" style="height:30px;text-align:center;font-size:11px;padding:2px;"></td>
      <td style="padding:2px;"><input type="number" value="${it.rate}" oninput="pharmaCart[${idx}].rate=Number(this.value);recalcPharma()" class="d-input" style="height:30px;text-align:right;font-size:11px;padding:2px 4px;"></td>
      <td style="padding:2px;"><button type="button" onclick="pharmaCart.splice(${idx},1);renderPharmaTableRows()" style="border:0;background:#fee2e2;color:#ef4444;border-radius:6px;width:22px;height:22px;font-weight:800;">✕</button></td>
    </tr>
  `).join("");
  recalcPharma();
}

function addPharmaRow(){
  pharmaCart.push({ name: "", batch: "", qty: 1, rate: 0 });
  renderPharmaTableRows();
}

function recalcPharma(){
  let sub = 0;
  pharmaCart.forEach(i => sub += (Number(i.qty||0) * Number(i.rate||0)));
  const disc = Number(document.getElementById("phDiscount")?.value || 0);
  const grand = Math.max(0, sub - disc);
  document.getElementById("phSubTotal").textContent = "₹" + sub.toFixed(2);
  document.getElementById("phGrandTotal").textContent = "₹" + grand.toFixed(2);
}

function printPharmaBill(){
  const cName = document.getElementById("phCustName")?.value.trim() || "नकद ग्राहक";
  const doc = document.getElementById("phDocRef")?.value.trim() || "-";
  let sub = 0, rows = "";

  pharmaCart.forEach((it, i) => {
    if(it.name){
      const tot = (Number(it.qty||1) * Number(it.rate||0));
      sub += tot;
      rows += `<tr>
        <td style="padding:6px 4px;border-bottom:1px dashed #cbd5e1;">${i+1}</td>
        <td style="padding:6px 4px;border-bottom:1px dashed #cbd5e1;"><b>${esc(it.name)}</b></td>
        <td style="padding:6px 4px;border-bottom:1px dashed #cbd5e1;">${esc(it.batch||'-')}</td>
        <td style="padding:6px 4px;text-align:center;border-bottom:1px dashed #cbd5e1;">${it.qty}</td>
        <td style="padding:6px 4px;text-align:right;border-bottom:1px dashed #cbd5e1;">₹${Number(it.rate).toFixed(2)}</td>
        <td style="padding:6px 4px;text-align:right;border-bottom:1px dashed #cbd5e1;">₹${tot.toFixed(2)}</td>
      </tr>`;
    }
  });

  const disc = Number(document.getElementById("phDiscount")?.value || 0);
  const grand = Math.max(0, sub - disc);

  const printHtml = `
    <div class="print-page-a4">
      <div style="border-bottom:2px solid #075c43;padding-bottom:10px;display:flex;justify-content:space-between;">
        <div>
          <h1 style="font-size:20px;font-weight:900;color:#075c43;margin:0;">${esc(pharmaProfile.name)}</h1>
          <p style="font-size:11px;color:#334155;margin:2px 0;">D.L. No.: <b>${esc(pharmaProfile.dl)}</b></p>
          <p style="font-size:10.5px;color:#64748b;">${esc(pharmaProfile.address)} | फ़ोन: ${esc(pharmaProfile.phone)}</p>
        </div>
        <div style="text-align:right;">
          <div style="background:#eaf5ef;color:#075c43;padding:4px 8px;border-radius:6px;font-size:12px;font-weight:800;">Rx CASH MEMO</div>
          <div style="font-size:10.5px;margin-top:4px;">दिनांक: ${new Date().toLocaleDateString('hi-IN')}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:12px;border-bottom:1px dashed #cbd5e1;margin-top:4px;">
        <div>मरीज़: <b>${esc(cName)}</b></div>
        <div>डॉक्टर: <b>${esc(doc)}</b></div>
      </div>
      <table style="width:100%;margin-top:10px;font-size:11.5px;">
        <thead>
          <tr style="border-bottom:1px solid #0f172a;background:#f8fafc;">
            <th style="padding:6px 4px;text-align:left;">#</th>
            <th style="padding:6px 4px;text-align:left;">दवा विवरण</th>
            <th style="padding:6px 4px;text-align:left;">बैच</th>
            <th style="padding:6px 4px;text-align:center;">मात्रा</th>
            <th style="padding:6px 4px;text-align:right;">दर</th>
            <th style="padding:6px 4px;text-align:right;">कुल</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="border-top:1px solid #0f172a;padding-top:8px;margin-top:10px;text-align:right;font-size:13.5px;">
        <div>उप-योग: ₹${sub.toFixed(2)}</div>
        ${disc > 0 ? `<div style="color:var(--red);">छूट: -₹${disc.toFixed(2)}</div>`:''}
        <div style="font-size:16px;font-weight:900;margin-top:2px;">कुल देय राशि: ₹${grand.toFixed(2)}</div>
      </div>
    </div>
  `;
  triggerSafePrint(printHtml);
}

// ================= 14. काउंटर बिलिंग (CGST/SGST 50-50% विभाजन) =================
function renderBillingView(){
  content.innerHTML = `
    <div class="sa-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <b style="font-size:14px;color:var(--primary);">🛒 काउंटर बिलिंग डेस्क</b>
        <div style="display:flex;gap:4px;background:#f1f5f9;padding:2px;border-radius:8px;">
          <button type="button" id="bTypeKaccha" class="btn-cancel" style="height:26px;padding:0 8px;font-size:10px;font-weight:800;background:${activeBillMode==='kaccha'?'var(--primary)':'transparent'};color:${activeBillMode==='kaccha'?'#fff':'#64748b'};border-radius:6px;" onclick="switchBillMode('kaccha')">कच्चा पर्चा</button>
          <button type="button" id="bTypeGst" class="btn-cancel" style="height:26px;padding:0 8px;font-size:10px;font-weight:800;background:${activeBillMode==='gst'?'var(--primary)':'transparent'};color:${activeBillMode==='gst'?'#fff':'#64748b'};border-radius:6px;" onclick="switchBillMode('gst')">पक्का GST</button>
        </div>
      </div>

      <table style="width:100%;font-size:11px;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid #e2e8f0;color:#64748b;">
            <th style="text-align:left;padding:4px 2px;">सामान</th>
            <th style="text-align:center;padding:4px 2px;">मात्रा</th>
            <th style="text-align:center;padding:4px 2px;">इकाई</th>
            <th style="text-align:right;padding:4px 2px;">भाव</th>
            <th style="width:24px;"></th>
          </tr>
        </thead>
        <tbody id="cartTableBody"></tbody>
      </table>

      <button type="button" onclick="addCartRow()" style="border:0;background:#f1f5f9;color:#0284c7;font-size:11px;font-weight:800;padding:6px;border-radius:8px;margin-top:6px;width:100%;">
        ＋ नया सामान जोड़ें
      </button>

      <div id="masterGstBox" style="display:${activeBillMode==='gst'?'block':'none'};margin-top:10px;background:#f8fafc;padding:8px;border-radius:10px;border:1px solid #cbd5e1;">
        <span style="font-size:10.5px;font-weight:800;color:#475569;display:block;margin-bottom:4px;">मास्टर GST दर चुनें (CGST 50% + SGST 50%):</span>
        <div style="display:flex;gap:6px;">
          <button type="button" class="filter-pill ${masterGSTRate===0?'active':''}" onclick="setMasterGst(0)">0%</button>
          <button type="button" class="filter-pill ${masterGSTRate===5?'active':''}" onclick="setMasterGst(5)">5% (2.5+2.5)</button>
          <button type="button" class="filter-pill ${masterGSTRate===12?'active':''}" onclick="setMasterGst(12)">12% (6+6)</button>
          <button type="button" class="filter-pill ${masterGSTRate===18?'active':''}" onclick="setMasterGst(18)">18% (9+9)</button>
        </div>
      </div>

      <div style="margin-top:8px;font-size:12px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
          <span style="color:#64748b;">उप-योग:</span>
          <strong id="cSubtotal">₹0.00</strong>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
          <span style="color:#64748b;">छूट (Discount):</span>
          <div style="display:flex;align-items:center;gap:3px;">
            <span>₹</span>
            <input type="number" id="cDiscount" value="0" oninput="recalcCart()" style="width:60px;height:24px;border:1px solid var(--line);border-radius:6px;text-align:right;padding:2px;font-size:11px;">
          </div>
        </div>
        <div id="cTaxRow" style="display:${activeBillMode==='gst'?'block':'none'};font-size:11px;color:#0284c7;margin:4px 0;">
          <div style="display:flex;justify-content:space-between;">
            <span>CGST (${(masterGSTRate/2).toFixed(1)}%):</span>
            <strong id="cCgstVal">₹0.00</strong>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span>SGST (${(masterGSTRate/2).toFixed(1)}%):</span>
            <strong id="cSgstVal">₹0.00</strong>
          </div>
        </div>
        <div style="border-top:1px solid #e2e8f0;padding-top:4px;margin-top:4px;font-size:14px;font-weight:900;display:flex;justify-content:space-between;">
          <span>कुल देय राशि:</span>
          <strong id="cGrandTotal" style="color:var(--primary);">₹0.00</strong>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px;">
        <button type="button" class="btn-save" style="height:38px;font-size:11px;background:#0284c7;" onclick="printCartThermalRoll()">🧾 रोल पर्चा</button>
        <button type="button" class="sa-print-btn" style="margin-top:0;height:38px;font-size:11px;" onclick="printCartA4Invoice()">🖨️ A4 प्रिंट</button>
      </div>
    </div>
  `;
  renderCartRows();
}

function switchBillMode(m){
  activeBillMode = m;
  renderBillingView();
}

function setMasterGst(rate){
  masterGSTRate = rate;
  renderBillingView();
}

function renderCartRows(){
  const tb = document.getElementById("cartTableBody");
  if(!tb) return;
  tb.innerHTML = cart.map((it, idx) => `
    <tr>
      <td style="padding:2px;"><input type="text" value="${esc(it.name)}" oninput="cart[${idx}].name=this.value" class="d-input" style="height:28px;font-size:11px;padding:2px 4px;"></td>
      <td style="padding:2px;"><input type="number" value="${it.qty}" oninput="cart[${idx}].qty=Number(this.value);recalcCart()" class="d-input" style="height:28px;text-align:center;font-size:11px;padding:2px;"></td>
      <td style="padding:2px;">
        <select onchange="cart[${idx}].unit=this.value" class="d-input" style="height:28px;font-size:10px;padding:1px;background:#fff;">
          <option ${it.unit==='किलो'?'selected':''}>किलो</option>
          <option ${it.unit==='लीटर'?'selected':''}>लीटर</option>
          <option ${it.unit==='पैकेट'?'selected':''}>पैकेट</option>
          <option ${it.unit==='पीस'?'selected':''}>पीस</option>
        </select>
      </td>
      <td style="padding:2px;"><input type="number" value="${it.rate}" oninput="cart[${idx}].rate=Number(this.value);recalcCart()" class="d-input" style="height:28px;text-align:right;font-size:11px;padding:2px 4px;"></td>
      <td style="padding:2px;"><button type="button" onclick="cart.splice(${idx},1);recalcCart();renderCartRows()" style="border:0;background:#fee2e2;color:#ef4444;border-radius:6px;width:22px;height:22px;font-weight:800;">✕</button></td>
    </tr>
  `).join("");
  recalcCart();
}

function addCartRow(){
  cart.push({ name: "", qty: 1, unit: "किलो", rate: 0 });
  renderCartRows();
}

function recalcCart(){
  let sub = 0;
  cart.forEach(i => sub += (Number(i.qty||0) * Number(i.rate||0)));
  const disc = Number(document.getElementById("cDiscount")?.value || 0);
  const afterDisc = Math.max(0, sub - disc);
  const totalTax = (activeBillMode === 'gst') ? (afterDisc * masterGSTRate) / 100 : 0;
  const halfTax = totalTax / 2;
  const grand = Math.round(afterDisc + totalTax);

  const subEl = document.getElementById("cSubtotal");
  const cgstEl = document.getElementById("cCgstVal");
  const sgstEl = document.getElementById("cSgstVal");
  const grandEl = document.getElementById("cGrandTotal");

  if(subEl) subEl.textContent = "₹" + sub.toFixed(2);
  if(activeBillMode === 'gst'){
    if(cgstEl) cgstEl.textContent = `₹${halfTax.toFixed(2)}`;
    if(sgstEl) sgstEl.textContent = `₹${halfTax.toFixed(2)}`;
  }
  if(grandEl) grandEl.textContent = "₹" + grand.toFixed(2);
}

function printCartA4Invoice(){
  let sub = 0, rows = "";
  const currentShop = getLiveShopName();
  cart.forEach((i, idx) => {
    if(i.name){
      const q = Number(i.qty||1), r = Number(i.rate||0), tot = q * r;
      sub += tot;
      rows += `<tr>
        <td style="padding:6px 4px;border-bottom:1px solid #cbd5e1;text-align:center;">${idx+1}</td>
        <td style="padding:6px 4px;border-bottom:1px solid #cbd5e1;"><b>${esc(i.name)}</b></td>
        <td style="padding:6px 4px;text-align:center;border-bottom:1px solid #cbd5e1;">${q} ${i.unit}</td>
        <td style="padding:6px 4px;text-align:right;border-bottom:1px solid #cbd5e1;">₹${r.toFixed(2)}</td>
        <td style="padding:6px 4px;text-align:right;border-bottom:1px solid #cbd5e1;">₹${tot.toFixed(2)}</td>
      </tr>`;
    }
  });

  const disc = Number(document.getElementById("cDiscount")?.value || 0);
  const afterDisc = Math.max(0, sub - disc);
  const totalTax = (activeBillMode === 'gst') ? (afterDisc * masterGSTRate) / 100 : 0;
  const halfTax = totalTax / 2;
  const grand = Math.round(afterDisc + totalTax);

  const printHtml = `
    <div class="print-page-a4">
      <div style="border-bottom:2px solid #075c43;padding-bottom:10px;display:flex;justify-content:space-between;">
        <div>
          <h1 style="font-size:22px;margin:0;color:#075c43;font-weight:900;">${esc(currentShop)}</h1>
          <p style="font-size:11px;color:#475569;margin:2px 0;">${esc(profile.shopAddress)} | संपर्क: ${esc(profile.shopPhone)}</p>
          ${profile.gstin ? `<p style="font-size:11px;color:#334155;">GSTIN: <b>${esc(profile.gstin)}</b></p>`:''}
        </div>
        <div style="text-align:right;">
          <div style="background:#eaf5ef;color:#075c43;padding:4px 8px;border-radius:6px;font-size:12px;font-weight:800;">
            ${activeBillMode==='gst' ? 'टैक्स इनवॉइस (GST)' : 'काउंटर बिल पर्चा'}
          </div>
          <div style="font-size:10.5px;color:#64748b;margin-top:3px;">बिल सं.: #${billCount} | दिनांक: ${new Date().toLocaleDateString('hi-IN')}</div>
        </div>
      </div>
      <table style="width:100%;font-size:11.5px;margin-top:14px;">
        <thead>
          <tr style="background:#f8fafc;border-top:1px solid #075c43;border-bottom:1px solid #075c43;">
            <th style="padding:6px 4px;text-align:center;width:8%;">#</th>
            <th style="padding:6px 4px;text-align:left;width:44%;">सामान का नाम</th>
            <th style="padding:6px 4px;text-align:center;width:16%;">मात्रा</th>
            <th style="padding:6px 4px;text-align:right;width:16%;">दर</th>
            <th style="padding:6px 4px;text-align:right;width:16%;">कुल</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="border-top:2px solid #075c43;padding-top:10px;margin-top:12px;text-align:right;font-size:13px;">
        <div>उप-योग: ₹${sub.toFixed(2)}</div>
        ${disc > 0 ? `<div style="color:var(--red);">छूट: -₹${disc.toFixed(2)}</div>`:''}
        ${activeBillMode==='gst' ? `
          <div>CGST (${(masterGSTRate/2).toFixed(1)}%): ₹${halfTax.toFixed(2)}</div>
          <div>SGST (${(masterGSTRate/2).toFixed(1)}%): ₹${halfTax.toFixed(2)}</div>
          <div style="font-size:11.5px;color:#64748b;">(कुल GST ${masterGSTRate}%: ₹${totalTax.toFixed(2)})</div>
        `:''}
        <div style="font-size:17px;font-weight:900;margin-top:4px;">कुल देय राशि: ₹${grand.toFixed(2)}</div>
      </div>
    </div>
  `;
  billCount++;
  syncData();
  triggerSafePrint(printHtml);
}

function printCartThermalRoll(){
  let sub = 0, rows = "";
  const currentShop = getLiveShopName();
  cart.forEach((i, idx) => {
    if(i.name){
      const q = Number(i.qty||1), r = Number(i.rate||0), tot = q * r;
      sub += tot;
      rows += `<div style="display:flex;justify-content:space-between;padding:2px 0;"><span>${idx+1}. ${esc(i.name)}</span><span>${q}x${r} = ₹${tot}</span></div>`;
    }
  });

  const disc = Number(document.getElementById("cDiscount")?.value || 0);
  const afterDisc = Math.max(0, sub - disc);
  const totalTax = (activeBillMode === 'gst') ? (afterDisc * masterGSTRate) / 100 : 0;
  const halfTax = totalTax / 2;
  const grand = Math.round(afterDisc + totalTax);

  const printHtml = `
    <div class="print-page-roll">
      <div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:4px;">
        <h3 style="font-size:14px;margin:0;font-weight:900;">${esc(currentShop)}</h3>
        <div style="font-size:9.5px;">मो.: ${esc(profile.shopPhone)}</div>
        <div style="font-size:9.5px;">दिनांक: ${new Date().toLocaleDateString('hi-IN')} | बिल #${billCount}</div>
      </div>
      <div style="border-bottom:1px dashed #000;padding:4px 0;margin:4px 0;">${rows}</div>
      <div style="text-align:right;font-size:11px;">
        <div>उप-योग: ₹${sub.toFixed(2)}</div>
        ${disc > 0 ? `<div>छूट: -₹${disc.toFixed(2)}</div>`:''}
        ${activeBillMode==='gst' ? `
          <div>CGST (${(masterGSTRate/2).toFixed(1)}%): ₹${halfTax.toFixed(2)}</div>
          <div>SGST (${(masterGSTRate/2).toFixed(1)}%): ₹${halfTax.toFixed(2)}</div>
        `:''}
        <div style="font-size:13px;font-weight:900;border-top:1px dashed #000;margin-top:2px;padding-top:2px;">कुल: ₹${grand.toFixed(2)}</div>
      </div>
      <div style="text-align:center;font-size:9px;margin-top:6px;border-top:1px dotted #000;padding-top:3px;">धन्यवाद! फिर पधारें 🙏</div>
    </div>
  `;
  billCount++;
  syncData();
  triggerSafePrint(printHtml);
}

// ================= 15. अखंड लेज़र डेस्क (Building B) =================
function renderBuildingBView(){
  const todayStr = new Date().toISOString().split("T")[0];
  const count = Number(localStorage.getItem(`chupa_audit_${todayStr}`) || "0");
  const blockchain = safeGet(BLOCKCHAIN_KEY, []);

  content.innerHTML = `
    <div class="sa-card" style="background:linear-gradient(135deg, #022c22, #075c43);color:#fff;">
      <h2 style="font-size:16px;font-weight:900;">अखंड लेज़र डेस्क (Building B)</h2>
      <p style="font-size:11px;color:#a7f3d0;margin-top:3px;">प्रूफ़-ऑफ़-पेपर सत्यापन: 0.10 🪙 प्रति आधिकारिक पर्ची (दैनिक सीमा: 1.00 🪙)</p>
    </div>

    <div class="sa-card">
      <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:800;">
        <span>आज की ऑडिट प्रगति:</span>
        <span style="color:var(--primary);">${count}/10 पर्ची (${(count*0.10).toFixed(2)} 🪙)</span>
      </div>
      <div class="quiz-timer-bar">
        <div class="quiz-progress" style="width:${(count/10)*100}%;"></div>
      </div>
      <p style="font-size:10px;color:var(--muted);margin-top:4px;">* ग्राहक खाते से पर्चा प्रमाणित करने पर स्वतः 0.10 सिक्का वॉल्ट में जुड़ता है।</p>
    </div>

    <div class="sa-card">
      <div style="font-size:12.5px;font-weight:800;color:var(--primary);margin-bottom:8px;">दुकान बहीखाता ऑडिट रिकॉर्ड:</div>
      <div style="font-size:11px;font-family:monospace;max-height:260px;overflow-y:auto;">
        ${blockchain.slice().reverse().map(b => `
          <div style="padding:6px 0;border-bottom:1px solid #e2e8f0;">
            <div style="font-weight:800;color:#0f172a;">प्रविष्टि #${b.index} • ${b.receiptNo || 'SYSTEM'}</div>
            <div style="font-size:9.5px;color:#64748b;word-break:break-all;">सुरक्षा सील: ${b.hash}</div>
            <div style="font-size:9.5px;color:var(--muted);">${b.timestamp}</div>
          </div>
        `).join("") || '<p style="color:var(--muted);">अभी कोई रिकॉर्ड नहीं है</p>'}
      </div>
    </div>
  `;
}

// ================= 16. चुपा GK ज्ञान व स्पीड टेस्ट डेस्क =================
const defaultLucentBank = [
  { q: "चाणक्य को अन्य किस नाम से भी जाना जाता था?", o: ["भट्टस्वामी", "विष्णुगुप्त", "राजशेखर", "विशाखदत्त"], a: 1 },
  { q: "हड़प्पा सभ्यता की खोज किस वर्ष हुई थी?", o: ["1935 ई.", "1942 ई.", "1901 ई."], a: 3 },
  { q: "भारतीय संविधान में मौलिक अधिकार किस देश से लिए गए हैं?", o: ["ब्रिटेन", "अमेरिका", "रूस", "आयरलैंड"], a: 1 },
  { q: "कार्य का मात्रक (SI Unit) क्या है?", o: ["जूल", "न्यूटन", "वाट", "डाइन"], a: 0 },
  { q: "प्रकाश वर्ष किसकी इकाई है?", o: ["दूरी", "समय", "प्रकाश", "धारा"], a: 0 },
  { q: "मनुष्य के शरीर में पसलियों के कितने जोड़े होते हैं?", o: ["12", "10", "14", "11"], a: 0 },
  { q: "विटामिन C का रासायनिक नाम क्या है?", o: ["साइट्रिक अम्ल", "एस्कॉर्बिक अम्ल", "ऑक्सालिक अम्ल", "नाइट्रिक अम्ल"], a: 1 },
  { q: "भारत का प्रथम गवर्नर जनरल कौन था?", o: ["लॉर्ड हेस्टिंग्स", "लॉर्ड विलियम बेंटिक", "लॉर्ड कैनिंग", "रॉबर्ट क्लाइव"], a: 1 },
  { q: "गायत्री मंत्र का उल्लेख किस वेद में है?", o: ["ऋग्वेद", "यजुर्वेद", "सामवेद", "अथर्ववेद"], a: 0 },
  { q: "ध्वनि की चाल अधिकतम किसमें होती है?", o: ["वायु में", "निर्वात में", "जल में", "इस्पात (ठोस) में"], a: 3 }
];

const permanentTestArchive = {
  short: [
    { file: "short_01.json", title: "शॉर्ट टेस्ट #1 — चुपा GK सामान्य आधार" },
    { file: "short_02.json", title: "शॉर्ट टेस्ट #2 — विज्ञान व इतिहास" },
    { file: "short_03.json", title: "शॉर्ट टेस्ट #3 — संविधान व भूगोल" }
  ],
  weekly: [
    { file: "weekly_w01.json", title: "वीकली टेस्ट #1 — 25 प्रश्न (सप्ताह 1)" },
    { file: "weekly_w02.json", title: "वीकली टेस्ट #2 — 25 प्रश्न (सप्ताह 2)" },
    { file: "weekly_w03.json", title: "वीकली टेस्ट #3 — 25 प्रश्न (सप्ताह 3)" },
    { file: "weekly_w04.json", title: "वीकली टेस्ट #4 — 25 प्रश्न (सप्ताह 4)" },
    { file: "weekly_w05.json", title: "वीकली टेस्ट #5 — 25 प्रश्न (सप्ताह 5)" },
    { file: "weekly_w06.json", title: "वीकली टेस्ट #6 — 25 प्रश्न (सप्ताह 6)" }
  ],
  full: [
    { file: "mock_01.json", title: "फुल लेंथ मॉक #1 — 100 प्रश्न (रेलवे/PET विशेष)" },
    { file: "mock_02.json", title: "फुल लेंथ मॉक #2 — 100 प्रश्न (राज्य ग्रुप-C)" }
  ]
};

let activeQuestionBank = [...defaultLucentBank];
let currentQuizMode = "short";
let selectedArchiveFile = "short_01.json";
let quizCurrentIndex = 0;
let quizScore = 0;
let quizTimerInterval = null;
let quizEndTime = null;
let currentQuizDurationMs = 300 * 1000;

function renderChupaGkQuizView(){
  const currentList = permanentTestArchive[currentQuizMode] || [];
  const optionsHtml = currentList.map(item => `
    <option value="${item.file}" ${item.file===selectedArchiveFile?'selected':''}>${item.title}</option>
  `).join("");

  content.innerHTML = `
    <div class="sa-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <b style="font-size:14px;color:var(--primary);">📖 चुपा GK ज्ञान व स्पीड टेस्ट डेस्क</b>
        <span style="font-size:11px;color:var(--amber);font-weight:800;">कटऑफ: ≥80% (+0.10 🪙)</span>
      </div>

      <div id="quizSetupBox">
        <p style="font-size:11.5px;color:var(--muted);margin-bottom:12px;line-height:1.5;">
          रेलवे, SSC एवं राज्य परीक्षाओं हेतु विशेष टेस्ट सीरीज़। टेस्ट प्रारूप व हफ़्ता चुनें:
        </p>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:12px;">
          <button type="button" class="filter-pill ${currentQuizMode==='short'?'active':''}" onclick="setQuizModeConfig('short')">⚡ शॉर्ट टेस्ट<br><small>10 प्रश्न (5m)</small></button>
          <button type="button" class="filter-pill ${currentQuizMode==='weekly'?'active':''}" onclick="setQuizModeConfig('weekly')">📅 वीकली टेस्ट<br><small>25 प्रश्न (15m)</small></button>
          <button type="button" class="filter-pill ${currentQuizMode==='full'?'active':''}" onclick="setQuizModeConfig('full')">🏆 फुल लेंथ<br><small>100 प्रश्न (60m)</small></button>
        </div>

        <div style="margin-bottom:14px;background:#f8fafc;padding:8px 10px;border-radius:12px;border:1px solid #cbd5e1;">
          <label style="font-size:10.5px;font-weight:800;color:var(--muted);display:block;margin-bottom:4px;">📜 टेस्ट सेट / हफ़्ता चुनें:</label>
          <select id="archiveSetSelect" class="d-input" style="height:36px;font-size:11.5px;background:#fff;" onchange="changeArchiveSet(this.value)">
            ${optionsHtml}
          </select>
        </div>

        <button class="btn-save" style="width:100%;" onclick="startChupaGkQuizRun()">टेस्ट शुरू करें ⏱️</button>
      </div>

      <div id="quizPlayBox" style="display:none;">
        <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:800;">
          <span id="quizQIndex">प्रश्न 1/10</span>
          <span id="quizTimerText" style="color:var(--red);">05:00</span>
        </div>
        <div class="quiz-timer-bar">
          <div id="quizTimerBar" class="quiz-progress" style="width:100%;"></div>
        </div>
        <h3 id="quizQuestionText" style="font-size:13.5px;margin:12px 0;line-height:1.4;">--</h3>
        <div id="quizOptionsContainer"></div>
      </div>

      <div id="quizResultBox" style="display:none;text-align:center;padding:10px;"></div>
    </div>
  `;
}

function setQuizModeConfig(mode){
  currentQuizMode = mode;
  if(mode === 'short'){
    currentQuizDurationMs = 5 * 60 * 1000;
  } else if(mode === 'weekly'){
    currentQuizDurationMs = 15 * 60 * 1000;
  } else if(mode === 'full'){
    currentQuizDurationMs = 60 * 60 * 1000;
  }
  const firstItem = permanentTestArchive[mode][0];
  if(firstItem) selectedArchiveFile = firstItem.file;
  renderChupaGkQuizView();
  fetchQuestionsForCurrentSet();
}

function changeArchiveSet(fileName){
  selectedArchiveFile = fileName;
  fetchQuestionsForCurrentSet();
}

async function fetchQuestionsForCurrentSet(){
  try {
    const res = await fetch('./tests/' + selectedArchiveFile);
    if(res.ok){
      const data = await res.json();
      if(Array.isArray(data) && data.length > 0){
        activeQuestionBank = data;
        localStorage.setItem(`cached_${selectedArchiveFile}`, JSON.stringify(data));
        return;
      }
    }
  } catch(e) {}
  
  const localCache = safeGet(`cached_${selectedArchiveFile}`, null);
  if (localCache && Array.isArray(localCache) && localCache.length > 0) {
    activeQuestionBank = localCache;
    return;
  }

  activeQuestionBank = [...defaultLucentBank];
}

async function startChupaGkQuizRun(){
  await fetchQuestionsForCurrentSet();

  let targetCount = 10;
  if(currentQuizMode === 'weekly') targetCount = 25;
  if(currentQuizMode === 'full') targetCount = 100;

  const totalAvailable = activeQuestionBank.length;
  const finalCount = Math.min(targetCount, totalAvailable);

  document.getElementById("quizSetupBox").style.display = "none";
  document.getElementById("quizResultBox").style.display = "none";
  document.getElementById("quizPlayBox").style.display = "block";

  quizCurrentIndex = 0;
  quizScore = 0;
  quizEndTime = Date.now() + currentQuizDurationMs;

  renderCurrentQuizQuestion(finalCount);
  startQuizClock(finalCount);
}

function startQuizClock(totalQ){
  clearInterval(quizTimerInterval);
  quizTimerInterval = setInterval(() => {
    const remainingMs = Math.max(0, quizEndTime - Date.now());
    const totalSecs = Math.floor(remainingMs / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    
    const tEl = document.getElementById("quizTimerText");
    const bEl = document.getElementById("quizTimerBar");
    if(tEl) tEl.innerText = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    if(bEl) bEl.style.width = `${(remainingMs / currentQuizDurationMs) * 100}%`;

    if (remainingMs <= 0) {
      clearInterval(quizTimerInterval);
      finishChupaGkQuizRun(totalQ);
    }
  }, 500);
}

function renderCurrentQuizQuestion(totalQ){
  const qData = activeQuestionBank[quizCurrentIndex];
  document.getElementById("quizQIndex").innerText = `प्रश्न ${quizCurrentIndex + 1}/${totalQ}`;
  document.getElementById("quizQuestionText").innerText = qData.q;

  const optContainer = document.getElementById("quizOptionsContainer");
  optContainer.innerHTML = "";

  qData.o.forEach((optText, idx) => {
    const btn = document.createElement("button");
    btn.className = "quiz-option";
    btn.innerText = `${idx + 1}. ${optText}`;
    btn.onclick = () => handleOptionSelection(idx, totalQ);
    optContainer.appendChild(btn);
  });
}

function handleOptionSelection(idx, totalQ){
  if(idx === activeQuestionBank[quizCurrentIndex].a) quizScore++;
  quizCurrentIndex++;
  if(quizCurrentIndex < totalQ && quizCurrentIndex < activeQuestionBank.length){
    renderCurrentQuizQuestion(totalQ);
  } else {
    clearInterval(quizTimerInterval);
    finishChupaGkQuizRun(totalQ);
  }
}

function finishChupaGkQuizRun(totalQ){
  document.getElementById("quizPlayBox").style.display = "none";
  const rBox = document.getElementById("quizResultBox");
  rBox.style.display = "block";

  const passThreshold = Math.ceil(totalQ * 0.8);

  if(quizScore >= passThreshold){
    vault = Math.round((vault + 0.10) * 100) / 100;
    localStorage.setItem(VK, vault.toFixed(2));
    updateHomeBalances();
    triggerVoiceAlert("बधाई हो! आपने टेस्ट उत्तीर्ण किया। शून्य दशमलव एक शून्य रिवॉर्ड सिक्का प्राप्त हुआ।");
    rBox.innerHTML = `
      <h3 style="color:var(--green);margin-bottom:6px;">🎉 परीक्षा उत्तीर्ण! (80%+ स्कोर)</h3>
      <p style="font-size:12px;">आपका स्कोर: <strong>${quizScore}/${totalQ}</strong></p>
      <div style="font-size:15px;font-weight:900;color:var(--primary);margin:10px 0;">+0.10 बरकत सिक्का वॉल्ट में जमा ✓</div>
      <button class="btn-save" style="width:100%;" onclick="startChupaGkQuizRun()">पुनः टेस्ट दें ⏱️</button>
    `;
  } else {
    rBox.innerHTML = `
      <h3 style="color:var(--red);margin-bottom:6px;">प्रयास अच्छा था! कटऑफ 80% है</h3>
      <p style="font-size:12px;">आपका स्कोर: <strong>${quizScore}/${totalQ}</strong> (उत्तीर्ण हेतु ${passThreshold} अंक आवश्यक)</p>
      <button class="btn-cancel" style="width:100%;margin-top:10px;" onclick="startChupaGkQuizRun()">दोबारा टेस्ट दें</button>
    `;
  }
}

// ================= 17. स्मार्ट पाठशाला व टीचर्स हब (क्लाउड + JSON हाइब्रिड इंजन) =================
let activeInstructorsList = [];
let selectedInstructor = null;
let activeLecture = null;
let currentSearchQuery = "";
let visibleLecturesCount = 5;

function sanitizeToEmbedUrl(url) {
  if (!url) return "";
  let clean = url.trim();
  if (clean.includes("youtube.com/shorts/")) {
    const id = clean.split("youtube.com/shorts/")[1].split("?")[0].split("&")[0];
    return `https://www.youtube.com/embed/${id}`;
  }
  if (clean.includes("youtu.be/")) {
    const id = clean.split("youtu.be/")[1].split("?")[0].split("&")[0];
    return `https://www.youtube.com/embed/${id}`;
  }
  if (clean.includes("watch?v=")) {
    const id = clean.split("watch?v=")[1].split("&")[0];
    return `https://www.youtube.com/embed/${id}`;
  }
  return clean;
}

async function fetchExternalTeachersData(){
  if (db) {
    try {
      const snap = await db.collection("teachers").get();
      if (!snap.empty) {
        const cloudTeachers = [];
        snap.forEach(doc => {
          const d = doc.data();
          if (d.name && d.lectures) cloudTeachers.push(d);
        });
        if (cloudTeachers.length > 0) {
          activeInstructorsList = cloudTeachers;
          localStorage.setItem("cached_teachers_hub", JSON.stringify(cloudTeachers));
          const matched = activeInstructorsList.find(ins => selectedInstructor && ins.id === selectedInstructor.id);
          selectedInstructor = matched || activeInstructorsList[0];
          activeLecture = (selectedInstructor && selectedInstructor.lectures && selectedInstructor.lectures[0]) || null;
          return;
        }
      }
    } catch(e) {
      console.warn("Firestore teachers fetch error:", e);
    }
  }

  try {
    const res = await fetch('./lectures/teachers.json');
    if(res.ok){
      const data = await res.json();
      if(Array.isArray(data) && data.length > 0){
        activeInstructorsList = data;
        localStorage.setItem("cached_teachers_hub", JSON.stringify(data));
        const matched = activeInstructorsList.find(ins => selectedInstructor && ins.id === selectedInstructor.id);
        selectedInstructor = matched || activeInstructorsList[0];
        activeLecture = (selectedInstructor && selectedInstructor.lectures && selectedInstructor.lectures[0]) || null;
        return;
      }
    }
  } catch(e) {}

  const localCache = safeGet("cached_teachers_hub", null);
  if(localCache && Array.isArray(localCache) && localCache.length > 0){
    activeInstructorsList = localCache;
    const matched = activeInstructorsList.find(ins => selectedInstructor && ins.id === selectedInstructor.id);
    selectedInstructor = matched || activeInstructorsList[0];
    activeLecture = (selectedInstructor && selectedInstructor.lectures && selectedInstructor.lectures[0]) || null;
    return;
  }

  activeInstructorsList = [];
  selectedInstructor = null;
  activeLecture = null;
}

async function renderVideoDeskView(){
  await fetchExternalTeachersData();
  const currentRole = profile.userRole || "merchant";
  const isTeacher = (currentRole === "teacher");

  if (!activeInstructorsList || !activeInstructorsList.length) {
    content.innerHTML = `
      <div class="sa-card" style="text-align:center;padding:36px 16px;">
        <div style="font-size:42px;">🎓</div>
        <h3 style="font-size:15px;font-weight:900;color:var(--primary);margin:10px 0 6px;">स्मार्ट पाठशाला में आपका स्वागत है</h3>
        <p style="font-size:11.5px;color:var(--muted);line-height:1.6;max-width:320px;margin:auto;">
          वर्तमान में कोई शिक्षक या क्लास लाइव नहीं है।<br>
          सर्वर से क्लास अप्रूव होते ही यहाँ कक्षाएँ तुरंत लाइव हो जाएँगी।
        </p>
        ${isTeacher ? `
          <button type="button" class="btn-save" style="margin-top:16px;height:38px;padding:0 16px;font-size:11.5px;" onclick="openTeacherUploadModal()">
            ＋ शिक्षक क्लास सबमिट करें (₹ शुल्क)
          </button>
        ` : ''}
      </div>
    `;
    return;
  }

  const q = currentSearchQuery.toLowerCase().trim();
  const filteredInstructors = activeInstructorsList.filter(ins => {
    if(!q) return true;
    return (ins.id || "").toLowerCase().includes(q) ||
           (ins.name || "").toLowerCase().includes(q) ||
           (ins.specialty || "").toLowerCase().includes(q) ||
           (ins.lectures || []).some(l => (l.title || "").toLowerCase().includes(q));
  });

  const dropdownOptions = filteredInstructors.length > 0
    ? filteredInstructors.map(ins => `
        <option value="${ins.id}" ${selectedInstructor && selectedInstructor.id === ins.id ? 'selected' : ''}>
          📚 ${esc(ins.name)} (${esc(ins.specialty)})
        </option>
      `).join("")
    : `<option value="" disabled selected>⚠️ कोई शिक्षक/संकाय नहीं मिला</option>`;

  const currentLectures = (selectedInstructor && selectedInstructor.lectures) || [];
  const visibleLectures = currentLectures.slice(0, visibleLecturesCount);
  const totalLecs = currentLectures.length;

  const lecturesListHtml = visibleLectures.length > 0
    ? visibleLectures.map((lec, idx) => `
        <div class="lecture-card" onclick="playSelectedLecture(${idx})">
          <div>
            <div style="font-size:12px;font-weight:800;color:#0f172a;">▶ ${esc(lec.title)}</div>
            <div style="font-size:10px;color:#64748b;margin-top:2px;">⏱️ ${esc(lec.duration)} • टेस्ट: ${esc(lec.testFile || 'उपलब्ध नहीं')}</div>
          </div>
          <span style="font-size:16px;">🎬</span>
        </div>
      `).join("")
    : `<div class="sa-card" style="text-align:center;color:#64748b;font-size:11.5px;">इस संकाय में अभी कोई क्लास उपलब्ध नहीं है</div>`;

  let playerHtml = '';
  if (activeLecture && activeLecture.videoUrl) {
    const embedSrc = sanitizeToEmbedUrl(activeLecture.videoUrl);
    if (embedSrc.includes('youtube.com') || embedSrc.includes('youtu.be')) {
      playerHtml = `
        <iframe 
          id="chupaCustomPlayer" 
          src="${embedSrc}" 
          style="width:100%;height:220px;border:0;border-radius:14px;" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
          allowfullscreen>
        </iframe>
      `;
    } else {
      playerHtml = `
        <video id="chupaCustomPlayer" controls poster="logo.png">
          <source src="${activeLecture.videoUrl}" type="video/mp4">
          आपका ब्राउज़र वीडियो सपोर्ट नहीं करता।
        </video>
      `;
    }
  } else {
    playerHtml = `<div style="color:#fff;text-align:center;padding:70px 10px;font-size:12px;">वीडियो उपलब्ध नहीं है</div>`;
  }

  content.innerHTML = `
    <div style="display:flex;gap:6px;margin-bottom:8px;">
      <input 
        id="teacherSearchInput" 
        class="d-input" 
        style="height:38px;font-size:12px;background:#fff;" 
        placeholder="🔎 शिक्षक, विषय या क्लास खोजें..." 
        value="${esc(currentSearchQuery)}"
        oninput="handleTeacherSearch(this.value)"
      >
      ${isTeacher ? `
        <button type="button" class="btn-save" style="width:115px;height:38px;font-size:11px;white-space:nowrap;" onclick="openTeacherUploadModal()">
          ＋ नई क्लास
        </button>
      ` : ''}
    </div>

    <div style="margin-bottom:10px;">
      <select 
        id="channelSelectDropdown" 
        class="d-input" 
        style="height:38px;font-size:12px;background:#fff;font-weight:800;color:var(--primary);" 
        onchange="switchInstructorById(this.value)"
      >
        ${dropdownOptions}
      </select>
    </div>

    <div class="video-player-container">
      ${playerHtml}
    </div>

    <div class="sa-card">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:10px;font-weight:800;color:#0284c7;background:#e0f2fe;padding:2px 8px;border-radius:6px;">${esc(selectedInstructor ? selectedInstructor.specialty : '')}</span>
        <span style="font-size:9.5px;font-weight:800;color:#64748b;background:#f1f5f9;padding:2px 6px;border-radius:4px;">${esc(selectedInstructor ? selectedInstructor.id : '')}</span>
      </div>
      <h3 style="font-size:14px;margin:6px 0 2px;font-weight:900;">${esc(activeLecture ? activeLecture.title : 'कक्षा लोड हो रही है')}</h3>
      <p style="font-size:10.5px;color:var(--muted);">शिक्षक/संकाय: <b>${esc(selectedInstructor ? selectedInstructor.name : '')}</b> • ⏱️ ${esc(activeLecture ? activeLecture.duration : '00:00')}</p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px;">
        <button type="button" class="btn-save" style="background:#0284c7;height:36px;font-size:11px;" onclick="openLectureTest('${activeLecture ? activeLecture.testFile : ''}')">
          📝 क्लास टेस्ट दें
        </button>
        <button type="button" class="btn-cancel" style="height:36px;font-size:11px;" onclick="window.open('${activeLecture ? activeLecture.notesUrl : '#'}', '_blank')">
          📖 PDF नोट्स
        </button>
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin:12px 2px 6px;">
      <span style="font-size:12px;font-weight:800;">उपलब्ध कक्षाएँ:</span>
      <span style="font-size:10px;color:#64748b;font-weight:700;">${visibleLectures.length}/${totalLecs} प्रदर्शित</span>
    </div>
    <div id="instructorLecturesContainer">
      ${lecturesListHtml}
    </div>

    ${visibleLecturesCount < totalLecs ? `
      <button type="button" class="btn-cancel" style="width:100%;margin-top:6px;font-size:11px;font-weight:800;" onclick="loadMoreLectures()">
        ▼ और 5 क्लास देखें
      </button>
    ` : ''}
  `;
}

function loadMoreLectures(){
  visibleLecturesCount += 5;
  renderVideoDeskView();
}

function handleTeacherSearch(val){
  currentSearchQuery = val;
  const q = val.toLowerCase().trim();
  const dropdown = document.getElementById("channelSelectDropdown");
  if(!dropdown) return;

  const filtered = activeInstructorsList.filter(ins => {
    if(!q) return true;
    return (ins.id || "").toLowerCase().includes(q) ||
           (ins.name || "").toLowerCase().includes(q) ||
           (ins.specialty || "").toLowerCase().includes(q) ||
           (ins.lectures || []).some(l => (l.title || "").toLowerCase().includes(q));
  });

  if(filtered.length > 0){
    dropdown.innerHTML = filtered.map(ins => `
      <option value="${ins.id}" ${selectedInstructor && selectedInstructor.id === ins.id ? 'selected' : ''}>
        📚 ${esc(ins.name)} (${esc(ins.specialty)})
      </option>
    `).join("");
    if(!filtered.some(f => selectedInstructor && f.id === selectedInstructor.id)){
      switchInstructorById(filtered[0].id);
    }
  } else {
    dropdown.innerHTML = `<option value="" disabled selected>⚠️ कोई शिक्षक/संकाय नहीं मिला</option>`;
  }
}

function switchInstructorById(targetId){
  const found = activeInstructorsList.find(ins => ins.id === targetId);
  if(!found) return;
  selectedInstructor = found;
  visibleLecturesCount = 5;
  activeLecture = (selectedInstructor.lectures && selectedInstructor.lectures[0]) || null;
  renderVideoDeskView();
}

function playSelectedLecture(idx){
  if(selectedInstructor && selectedInstructor.lectures && selectedInstructor.lectures[idx]){
    activeLecture = selectedInstructor.lectures[idx];
    renderVideoDeskView();
  }
}

function openLectureTest(testFileName){
  if(!testFileName) {
    toast("इस क्लास के लिए टेस्ट उपलब्ध नहीं है");
    return;
  }
  currentQuizMode = "weekly";
  selectedArchiveFile = testFileName;
  saOpen('chupaGk');
  startChupaGkQuizRun();
}

function openTeacherUploadModal(){
  teacherProfile = safeGet(TEACHERKEY, teacherProfile);
  document.getElementById("tuTeacherSummary").textContent = `${teacherProfile.name || 'शिक्षक'} (${teacherProfile.subject || 'सामान्य संकाय'})`;
  document.getElementById("tuClassTitle").value = "";
  document.getElementById("tuVideoUrl").value = "";
  document.getElementById("tuDuration").value = "15:00";
  document.getElementById("tuUtrNumber").value = "";

  const upiId = profile.upi || "merchant@upi";
  document.getElementById("tuUpiDisplay").textContent = `UPI ID: ${upiId}`;

  const qrBox = document.getElementById("tuQrContainer");
  qrBox.innerHTML = "";
  const uri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(getLiveShopName())}&am=1000&cu=INR`;
  new QRCode(qrBox, { text: uri, width: 140, height: 140, correctLevel: QRCode.CorrectLevel.M });

  document.getElementById("teacherUploadModal").style.display = "flex";
}

async function submitTeacherClassToCloud(){
  const title = document.getElementById("tuClassTitle").value.trim();
  const rawUrl = document.getElementById("tuVideoUrl").value.trim();
  const duration = document.getElementById("tuDuration").value.trim() || "15:00";
  const testFile = document.getElementById("tuTestFile").value.trim() || "weekly_w01.json";
  const notesUrl = document.getElementById("tuNotesUrl").value.trim() || "#";
  const utr = document.getElementById("tuUtrNumber").value.trim();

  if(!title){ toast("कृपया क्लास का शीर्षक भरें"); return; }
  if(!rawUrl){ toast("कृपया वीडियो लिंक भरें"); return; }
  if(!/^\d{12}$/.test(utr)){ toast("मान्य 12 अंकों का UPI UTR नंबर भरें"); return; }

  const cleanVideoUrl = sanitizeToEmbedUrl(rawUrl);

  const pendingDoc = {
    teacherName: teacherProfile.name,
    teacherSubject: teacherProfile.subject,
    teacherUpi: teacherProfile.upi,
    teacherPhone: teacherProfile.phone,
    idProof: teacherProfile.idProof,
    classTitle: title,
    videoUrl: cleanVideoUrl,
    duration: duration,
    testFile: testFile,
    notesUrl: notesUrl,
    utrNumber: utr,
    feeAmount: 1000,
    status: "pending",
    submittedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (db) {
    try {
      await db.collection("pending_lectures").add(pendingDoc);
      closeModal("teacherUploadModal");
      alert("🎉 सफलता!\n\nआपकी क्लास सर्वर पर भेज दी गई है। UTR सत्यापन के बाद क्लास 1 मिनट में छात्रों के लिए लाइव हो जाएगी।");
      return;
    } catch(e) {
      console.error("Cloud submission failed:", e);
    }
  }

  closeModal("teacherUploadModal");
  toast("सर्वर से कनेक्ट नहीं हो सका; इंटरनेट जाँचें");
}

// ================= 18. सरकारी पोर्टल =================
function renderGovView(){
  content.innerHTML = `
    <div class="sa-sites">
      <div class="sa-site-card"><div class="ico">🧑‍💼</div><b>मानव संपदा पोर्टल</b><a href="https://ehrms.upsdc.gov.in" target="_blank" rel="noopener">पोर्टल ↗</a></div>
      <div class="sa-site-card"><div class="ico">™️</div><b>ट्रेडमार्क (IP India)</b><a href="https://ipindiaonline.gov.in" target="_blank" rel="noopener">पोर्टल ↗</a></div>
      <div class="sa-site-card"><div class="ico">©️</div><b>कोड कॉपीराइट ऑफिस</b><a href="https://copyright.gov.in" target="_blank" rel="noopener">पोर्टल ↗</a></div>
      <div class="sa-site-card"><div class="ico">🏥</div><b>आयुष्मान कार्ड</b><a href="https://beneficiary.nha.gov.in" target="_blank" rel="noopener">पोर्टल ↗</a></div>
      <div class="sa-site-card"><div class="ico">🌾</div><b>राशन कार्ड पर्ची</b><a href="https://fcs.up.gov.in" target="_blank" rel="noopener">पोर्टल ↗</a></div>
      <div class="sa-site-card"><div class="ico">🎋</div><b>गन्ना पर्ची</b><a href="https://enquiry.caneup.in" target="_blank" rel="noopener">पोर्टल ↗</a></div>
      <div class="sa-site-card"><div class="ico">📜</div><b>भूलेख खतौनी</b><a href="https://upbhulekh.gov.in" target="_blank" rel="noopener">पोर्टल ↗</a></div>
      <div class="sa-site-card"><div class="ico">🚜</div><b>PM-किसान</b><a href="https://pmkisan.gov.in" target="_blank" rel="noopener">पोर्टल ↗</a></div>
      <div class="sa-site-card"><div class="ico">👷</div><b>ई-श्रम कार्ड</b><a href="https://eshram.gov.in" target="_blank" rel="noopener">पोर्टल ↗</a></div>
      <div class="sa-site-card"><div class="ico">📢</div><b>जनसुनवाई समाधान</b><a href="https://jansunwai.up.nic.in" target="_blank" rel="noopener">पोर्टल ↗</a></div>
      <div class="sa-site-card"><div class="ico">👨‍👩‍👧</div><b>फैमिली आईडी (UP)</b><a href="https://familyid.up.gov.in" target="_blank" rel="noopener">पोर्टल ↗</a></div>
      <div class="sa-site-card"><div class="ico">📄</div><b>जाति/निवास ई-डिस्ट्रिक्ट</b><a href="https://edistrict.up.gov.in" target="_blank" rel="noopener">पोर्टल ↗</a></div>
    </div>
  `;
}

// ================= 19. एकीकृत प्रोफाइल, भूमिका व सेटिंग्स इंजन =================
function toggleRoleFields(role){
  document.getElementById("roleSecMerchant").style.display = (role === "merchant" ? "block" : "none");
  document.getElementById("roleSecDoctor").style.display = (role === "doctor" ? "block" : "none");
  document.getElementById("roleSecPharmacist").style.display = (role === "pharmacist" ? "block" : "none");
  document.getElementById("roleSecTeacher").style.display = (role === "teacher" ? "block" : "none");
  document.getElementById("roleSecStudent").style.display = (role === "student" ? "block" : "none");
}

function openProfileDrawer(){
  profile = safeGet(PK, profile);
  clinicProfile = safeGet(CLINIKEY, clinicProfile);
  pharmaProfile = safeGet(PHARMAKEY, pharmaProfile);
  teacherProfile = safeGet(TEACHERKEY, teacherProfile);

  const role = profile.userRole || "merchant";
  document.getElementById("userRoleSelect").value = role;
  toggleRoleFields(role);

  document.getElementById("profMerchantName").value = profile.merchantName || "";
  document.getElementById("profShopName").value = profile.shopName || "";
  document.getElementById("profPhone").value = profile.shopPhone || "";
  document.getElementById("profAddress").value = profile.shopAddress || "";
  document.getElementById("profUpi").value = profile.upi || "";
  document.getElementById("profGst").value = profile.gstin || "";

  document.getElementById("setClinicName").value = clinicProfile.name || "";
  document.getElementById("setDocName").value = clinicProfile.doc || "";
  document.getElementById("setDocReg").value = clinicProfile.reg || "";
  document.getElementById("setClinicAddress").value = clinicProfile.address || "";
  document.getElementById("setClinicPhone").value = clinicProfile.phone || "";
  document.getElementById("setClinicMap").value = clinicProfile.mapUrl || "";

  document.getElementById("setPhName").value = pharmaProfile.name || "";
  document.getElementById("setPhDl").value = pharmaProfile.dl || "";
  document.getElementById("setPhAddress").value = pharmaProfile.address || "";
  document.getElementById("setPhPhone").value = pharmaProfile.phone || "";
  document.getElementById("setPhMap").value = pharmaProfile.mapUrl || "";

  document.getElementById("setTeacherName").value = teacherProfile.name || "";
  document.getElementById("setTeacherSubject").value = teacherProfile.subject || "";
  document.getElementById("setTeacherUpi").value = teacherProfile.upi || "";
  document.getElementById("setTeacherIdProof").value = teacherProfile.idProof || "";
  document.getElementById("setTeacherPhone").value = teacherProfile.phone || "";

  const prev = document.getElementById("logoPreviewImg");
  const remBtn = document.getElementById("removeLogoBtn");
  if(customLogoBase64){
    prev.src = customLogoBase64;
    prev.style.display = "block";
    remBtn.style.display = "inline";
  } else {
    prev.style.display = "none";
    remBtn.style.display = "none";
  }
  document.getElementById("settingsModal").style.display = "flex";
}

async function handleLogoUpload(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(evt){
    const img = new Image();
    img.onload = async function(){
      const canvas = document.createElement("canvas");
      canvas.width = 120; canvas.height = 120;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, 120, 120);
      customLogoBase64 = canvas.toDataURL("image/png");
      await putImageIDB("shop_logo", customLogoBase64);
      
      document.getElementById("logoPreviewImg").src = customLogoBase64;
      document.getElementById("logoPreviewImg").style.display = "block";
      document.getElementById("removeLogoBtn").style.display = "inline";
      updateHomeBalances();
      toast("लोगो तैयार हुआ ✓");
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
}

async function removeCustomLogo(){
  customLogoBase64 = "";
  await deleteImageIDB("shop_logo");
  document.getElementById("shopLogoInput").value = "";
  document.getElementById("logoPreviewImg").style.display = "none";
  document.getElementById("removeLogoBtn").style.display = "none";
  document.getElementById("saTopLogoImg").src = "logo.png";
  toast("लोगो हटाया गया");
}

function saveSettingsData(){
  const sName = document.getElementById("profShopName").value.trim();
  if(!sName){ toast("कृपया दुकान का नाम खाली न छोड़ें!"); return; }

  profile.userRole = document.getElementById("userRoleSelect").value;
  profile.merchantName = document.getElementById("profMerchantName").value.trim();
  profile.shopName = sName;
  profile.shopPhone = document.getElementById("profPhone").value.trim();
  profile.shopAddress = document.getElementById("profAddress").value.trim();
  profile.upi = document.getElementById("profUpi").value.trim();
  profile.gstin = document.getElementById("profGst").value.trim().toUpperCase();

  clinicProfile.name = document.getElementById("setClinicName").value.trim();
  clinicProfile.doc = document.getElementById("setDocName").value.trim();
  clinicProfile.reg = document.getElementById("setDocReg").value.trim();
  clinicProfile.address = document.getElementById("setClinicAddress").value.trim();
  clinicProfile.phone = document.getElementById("setClinicPhone").value.trim();
  clinicProfile.mapUrl = document.getElementById("setClinicMap").value.trim();

  pharmaProfile.name = document.getElementById("setPhName").value.trim();
  pharmaProfile.dl = document.getElementById("setPhDl").value.trim();
  pharmaProfile.address = document.getElementById("setPhAddress").value.trim();
  pharmaProfile.phone = document.getElementById("setPhPhone").value.trim();
  pharmaProfile.mapUrl = document.getElementById("setPhMap").value.trim();

  teacherProfile.name = document.getElementById("setTeacherName").value.trim();
  teacherProfile.subject = document.getElementById("setTeacherSubject").value.trim();
  teacherProfile.upi = document.getElementById("setTeacherUpi").value.trim();
  teacherProfile.idProof = document.getElementById("setTeacherIdProof").value.trim();
  teacherProfile.phone = document.getElementById("setTeacherPhone").value.trim();

  syncData();
  closeModal("settingsModal");
  toast("संपूर्ण प्रोफाइल व सेटिंग्स सुरक्षित हुईं ✓");
}

// ================= 20. डायनामिक मर्चेंट QR पोस्टर =================
let globalPosterCanvas = null;

async function generatePremiumPosterCanvas(qrRawCanvas) {
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 760;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#070c14";
  ctx.beginPath();
  ctx.roundRect(0, 0, 600, 760, 28);
  ctx.fill();

  ctx.strokeStyle = "#b45309";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = "#d97706";
  ctx.font = "bold 13px 'Plus Jakarta Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("★ OFFICIAL DIRECT MERCHANT REPOSITORY ★", 300, 42);

  ctx.fillStyle = "#f59e0b";
  ctx.font = "900 28px 'Noto Sans Devanagari', sans-serif";
  ctx.fillText(getLiveShopName(), 300, 80);

  ctx.fillStyle = "#38bdf8";
  ctx.font = "600 13px 'Noto Sans Devanagari', sans-serif";
  ctx.fillText("सीधा बैंक खाता भुगतान • शून्य अतिरिक्त शुल्क", 300, 106);

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(80, 130, 440, 440, 24);
  ctx.fill();

  ctx.strokeStyle = "#0284c7";
  ctx.lineWidth = 5;
  ctx.strokeRect(74, 124, 28, 28);
  ctx.strokeRect(498, 124, 28, 28);

  ctx.drawImage(qrRawCanvas, 100, 150, 400, 400);

  if (customLogoBase64) {
    await new Promise((resolve) => {
      const centerImg = new Image();
      centerImg.onload = () => {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(300, 350, 46, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#070c14";
        ctx.beginPath();
        ctx.arc(300, 350, 43, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        ctx.arc(300, 350, 40, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(centerImg, 260, 310, 80, 80);
        ctx.restore();
        resolve();
      };
      centerImg.onerror = () => resolve();
      centerImg.src = customLogoBase64;
    });
  }

  ctx.fillStyle = "#111827";
  ctx.beginPath();
  ctx.roundRect(140, 595, 320, 44, 22);
  ctx.fill();
  ctx.strokeStyle = "#b45309";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = "#f59e0b";
  ctx.font = "900 17px 'Plus Jakarta Sans', monospace";
  ctx.fillText(profile.upi || "UPI NOT SET", 300, 623);

  ctx.fillStyle = "#ffffff";
  ctx.font = "800 15px sans-serif";
  ctx.fillText("GPay • PhonePe • Paytm • BHIM UPI • Any Bank App", 300, 668);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "500 11.5px 'Noto Sans Devanagari', sans-serif";
  ctx.fillText("भारत सरकार NPCI एवं सुरक्षित UPI नेटवर्क द्वारा सीधे अधिकृत", 300, 690);

  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(80, 712); ctx.lineTo(520, 712);
  ctx.stroke();

  ctx.fillStyle = "#38bdf8";
  ctx.font = "700 11px 'Noto Sans Devanagari', sans-serif";
  ctx.fillText("🔒 100% डायरेक्ट बैंक सेटलमेंट • तुरंत पुष्टि", 300, 730);

  ctx.fillStyle = "#f59e0b";
  ctx.font = "800 11px 'Noto Sans Devanagari', sans-serif";
  ctx.fillText("⚡ " + getLiveShopName() + " • भारत की सबसे सुरक्षित डिजिटल गद्दी 🐉", 300, 748);

  return canvas;
}

function openQR(){
  profile = safeGet(PK, profile);
  if(!profile.upi){ toast("पहले सेटिंग्स में UPI ID जोड़ें"); openProfileDrawer(); return; }

  const liveShop = getLiveShopName();
  document.getElementById("qrShopTitle").textContent = liveShop;
  document.getElementById("qrUpiText").textContent = profile.upi;
  document.getElementById("qrModal").style.display = "flex";

  const container = document.getElementById("qrCanvasContainer");
  container.innerHTML = "";

  const tempBox = document.createElement("div");
  const uri = `upi://pay?pa=${encodeURIComponent(profile.upi)}&pn=${encodeURIComponent(liveShop)}&cu=INR`;

  new QRCode(tempBox, {
    text: uri,
    width: 320,
    height: 320,
    correctLevel: QRCode.CorrectLevel.H
  });

  setTimeout(async () => {
    const rawQrCanvas = tempBox.querySelector("canvas");
    if(!rawQrCanvas) return;

    globalPosterCanvas = await generatePremiumPosterCanvas(rawQrCanvas);

    const previewImg = new Image();
    previewImg.src = globalPosterCanvas.toDataURL("image/png");
    previewImg.style.width = "220px";
    previewImg.style.borderRadius = "14px";
    previewImg.style.boxShadow = "0 8px 24px rgba(0,0,0,0.4)";
    container.appendChild(previewImg);
  }, 120);
}

function downloadQrImage(){
  if(!globalPosterCanvas){ toast("पोस्टर तैयार हो रहा है..."); return; }
  const a = document.createElement("a");
  a.href = globalPosterCanvas.toDataURL("image/png");
  a.download = `${getLiveShopName().replace(/\s+/g,'_')}_Merchant_Poster.png`;
  a.click();
  toast("📥 प्रीमियम मर्चेंट पोस्टर डाउनलोड हुआ ✓");
}

function printQrStandee(){
  if(!globalPosterCanvas){ toast("QR लोड हो रहा है..."); return; }
  const qrDataUrl = globalPosterCanvas.toDataURL("image/png");
  const printHtml = `
    <div style="width:100%;max-width:540px;margin:20px auto;text-align:center;">
      <img src="${qrDataUrl}" style="width:100%;border-radius:18px;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
    </div>
  `;
  triggerSafePrint(printHtml);
}

// ================= 21. बैकअप व रीसायकल बिन =================
async function downloadBackupJSON(){
  const blockchain = safeGet(BLOCKCHAIN_KEY, []);
  const allImages = await getAllImagesIDB();

  const full = { 
    version: "14.0",
    profile, 
    customers, 
    expenses, 
    recycleBin, 
    clinicProfile, 
    pharmaProfile, 
    teacherProfile,
    vault,
    billCount,
    customLogoBase64: customLogoBase64 || allImages.shop_logo || "",
    rxTagsLibrary,
    blockchain,
    images: allImages
  };

  const blob = new Blob([JSON.stringify(full, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Chupa_Master_FullBackup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast("📥 संपूर्ण बैकअप (Block+Images सहित) डाउनलोड हुआ ✓");
}

function triggerRestoreJSON(){ document.getElementById("jsonFileInput").click(); }

function handleRestoreFile(e){
  const f = e.target.files[0];
  if(!f) return;
  const r = new FileReader();
  r.onload = async function(evt){
    try {
      const d = JSON.parse(evt.target.result);
      if(!d || !Array.isArray(d.customers)) { alert("अमान्य बैकअप फ़ाइल! ग्राहकों की सूची नहीं मिली।"); return; }
      if (d.customers.some(c => !c || typeof c !== "object" || c.id === undefined)) {
        alert("बैकअप में ग्राहक डेटा सही प्रारूप में नहीं है। रीस्टोर रद्द किया गया।"); return;
      }
      if(!confirm("क्या आप यह बैकअप रीस्टोर करना चाहते हैं? वर्तमान डेटा बदल जाएगा।")) return;

      if(d.profile) profile = d.profile;
      if(d.customers) customers = d.customers;
      if(d.expenses) expenses = d.expenses;
      if(d.recycleBin) recycleBin = d.recycleBin;
      if(d.clinicProfile) clinicProfile = d.clinicProfile;
      if(d.pharmaProfile) pharmaProfile = d.pharmaProfile;
      if(d.teacherProfile) teacherProfile = d.teacherProfile;
      if(d.rxTagsLibrary) rxTagsLibrary = d.rxTagsLibrary;
      if(d.vault !== undefined && Number.isFinite(Number(d.vault))) vault = Number(d.vault);
      if(d.billCount !== undefined && Number.isFinite(Number(d.billCount))) billCount = Number(d.billCount);

      if(Array.isArray(d.blockchain)) safeSet(BLOCKCHAIN_KEY, d.blockchain);

      if(d.images && typeof d.images === "object"){
        const imagesToRestore = { ...d.images };
        if (d.customLogoBase64 && !imagesToRestore.shop_logo) imagesToRestore.shop_logo = d.customLogoBase64;
        await replaceAllImagesIDB(imagesToRestore);
        customLogoBase64 = imagesToRestore.shop_logo || "";
      } else if (d.customLogoBase64) {
        await replaceAllImagesIDB({ shop_logo: d.customLogoBase64 });
        customLogoBase64 = d.customLogoBase64;
      }

      syncData();
      closeModal("settingsModal");
      toast("बहीखाता, लेज़र व फ़ोटो रीस्टोर हुए ✓");
    } catch(err){ alert("फ़ाइल पढ़ने में त्रुटि हुई!"); }
  };
  r.readAsText(f);
  e.target.value = "";
}

function openRecycleBin(){
  closeModal('settingsModal');
  const box = document.getElementById("recycleBinList");
  box.innerHTML = "";
  if(!recycleBin.length){
    box.innerHTML = '<div style="text-align:center;color:#64748b;font-size:12px;padding:20px;">रीसायकल बिन खाली है!</div>';
  } else {
    recycleBin.forEach((item, idx) => {
      const isParty = (item.type === "PARTY");
      box.innerHTML += `
        <div class="sa-row" style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:8px 10px;margin-bottom:6px;">
          <div>
            <div style="font-size:12px;font-weight:800;">${isParty ? '👤 ' + esc(item.partyData.name) : esc(item.custName)}</div>
            <div style="font-size:10px;color:#64748b;">${isParty ? 'पूरा खाता' : esc(item.tx.note||'लेन-देन') + ' • ₹' + item.tx.amount} (${item.deletedAt})</div>
          </div>
          <button type="button" onclick="restoreFromBin(${idx})" class="btn-save" style="height:28px;padding:0 8px;font-size:10px;">↺ वापस लाएं</button>
        </div>
      `;
    });
  }
  document.getElementById("recycleBinModal").style.display = "flex";
}

function restoreFromBin(idx){
  const item = recycleBin[idx];
  if(item.type === "PARTY"){
    const exists = customers.some(c => c.id === item.partyData.id || c.phone === item.partyData.phone);
    if(exists){
      item.partyData.id = Date.now();
      item.partyData.name += " (Re)";
    }
    customers.unshift(item.partyData);
  } else {
    const c = customers.find(x => x.id === item.custId);
    if(!c){ 
      toast("मूल खाता मौजूद नहीं है! पहले खाता बहाल करें"); 
      return; 
    }
    if(!c.tx) c.tx = [];
    c.tx.push(item.tx);
  }
  recycleBin.splice(idx, 1);
  syncData();
  openRecycleBin();
  toast("डेटा सुरक्षित वापस लाया गया ✓");
}

function emptyRecycleBin(){
  if(!recycleBin.length) return;
  if(!confirm("रीसायकल बिन का सारा डेटा हमेशा के लिए मिटाना चाहते हैं?")) return;

  recycleBin.forEach(item => {
    if(item.type === "TX" && item.tx && item.tx.imgId){
      deleteImageIDB(item.tx.imgId);
    } else if(item.type === "PARTY" && item.partyData && item.partyData.tx){
      item.partyData.tx.forEach(t => { if(t.imgId) deleteImageIDB(t.imgId); });
    }
  });

  recycleBin = [];
  syncData();
  openRecycleBin();
  toast("बिन साफ़ हुआ 🗑️✓");
}

// ================= 22. INIT =================
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await initIDB();
    customLogoBase64 = (await getImageIDB("shop_logo")) || "";
    await requestPersistentStorage();
  } catch (e) {
    console.warn("Storage initialization issue:", e);
    toast("⚠️ फ़ोटो स्टोरेज उपलब्ध नहीं है; बाकी ऐप चल सकता है");
  }
  updateHomeBalances();
});
// ================= 100% यूनिवर्सल ऑटो-ट्रांसलेटर पैच =================
document.addEventListener("DOMContentLoaded", () => {
  // भाषा बदलने के लिए ग्लोबल फंक्शन
  window.changeAppLanguage = function(lang) {
    currentAppLanguage = lang || "hi";
    localStorage.setItem("chupaAppLanguage", currentAppLanguage);
    
    // 1. होम स्क्रीन और स्टैटिक लेबल्स बदलें
    if (typeof applyLanguageTranslations === "function") {
      applyLanguageTranslations();
    }
    
    // 2. यदि कोई अंदरूनी पेज (जैसे बहीखाता या रिपोर्ट) खुला है, तो उसे री-रेंडर करें
    const singlePage = document.getElementById("singlePage");
    if (singlePage && singlePage.style.display === "block" && window.saOpen && window.currentOpenPageType) {
      saOpen(window.currentOpenPageType);
    }
  };

  // पेज या मोडल बदलते ही टेक्स्ट का स्वतः अनुवाद करने के लिए ऑब्ज़र्वर
  if (!window.__chupaUniversalObserver) {
    let isTranslating = false;
    window.__chupaUniversalObserver = new MutationObserver(() => {
      if (isTranslating) return;
      isTranslating = true;
      setTimeout(() => {
        isTranslating = false;
        if (currentAppLanguage && currentAppLanguage !== 'hi') {
          if (typeof applyLanguageTranslations === 'function') {
            applyLanguageTranslations();
          }
        }
      }, 50);
    });
    window.__chupaUniversalObserver.observe(document.body, { childList: true, subtree: true });
  }
});
