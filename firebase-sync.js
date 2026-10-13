// Firestore sync add-on for the v1.1.1 board. No bundler or server required.
// Firebase web configuration is public client metadata; Firestore access is
// protected by Authentication and per-UID Firestore security rules.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore, doc, onSnapshot, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAt-daRBT2jOTRbUyUrtsY0FdlTPcxb1Js',
  authDomain: 'manjachenhong-tactics.firebaseapp.com',
  projectId: 'manjachenhong-tactics',
  storageBucket: 'manjachenhong-tactics.firebasestorage.app',
  messagingSenderId: '764400465835',
  appId: '1:764400465835:web:6bbef3771fcd2586bf84ee',
  measurementId: 'G-5R660MYXRN'
};

const byId = id => document.getElementById(id);
const button = byId('cloudOpen');
const status = byId('cloudStatus');
const led = byId('cloudLed');
const message = byId('cloudMessage');
const modal = byId('cloudBackdrop');
const loginView = byId('cloudLoggedOut');
const signedView = byId('cloudLoggedIn');
const decide = byId('cloudDecision');
const upButton = byId('cloudUpload');
const downButton = byId('cloudDownload');
const loginButton = byId('cloudLogin');

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const bridge = window.tacticsCloudBridge;
if (!bridge) throw new Error('전술판 본체 초기화에 실패했습니다.');
const session = Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
let user = null;
let ref = null;
let unsubscribe = null;
let onlineSync = false;
let remoteJson = null;
let initialRead = false;
let saving = false;
let queueTimer = null;
let pending = false;
let processingRemote = false;
let lastWriteJson = '';

function setStatus(text, type = '') {
  status.textContent = text;
  led.className = 'cloud-led' + (type ? ' ' + type : '');
  button.title = 'Firebase 동기화: ' + text;
}
function info(text, error = false) {
  message.textContent = text;
  message.style.color = error ? '#ad292e' : '#3355a9';
}
function updateButtons() {
  downButton.disabled = !user || remoteJson === null;
  upButton.disabled = !user || !initialRead || saving;
  byId('cloudAccount').textContent = user?.email || '';
}
function openModal() { modal.hidden = false; updateButtons(); }
function closeModal() { modal.hidden = true; }
button.addEventListener('click', openModal);
byId('cloudClose').addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
window.addEventListener('keydown', e => {if(e.key === 'Escape' && !modal.hidden) { e.stopImmediatePropagation(); closeModal(); }}, true);

function cloudReady() {
  if (!user) {setStatus('로그인 필요'); return;}
  if (!initialRead) {setStatus('클라우드 확인 중…'); return;}
  if (!onlineSync) {setStatus(remoteJson === null ? '첫 업로드 필요' : '데이터 선택 필요'); return;}
  setStatus('동기화 연결됨', 'good');
}
// Custom user images are retained in local JSON backups. Sync only text/state:
// Firestore documents are limited to 1 MiB, and custom photos can exceed it.
function cleanForCloud(raw) {
  const copy = structuredClone(raw);
  if (Array.isArray(copy.units)) for (const u of copy.units) u.customImage = null;
  return copy;
}
function localJson() { return JSON.stringify(cleanForCloud(bridge.getState())); }
function hash(text) { let h = 2166136261; for (let i=0;i<text.length;i++) {h ^= text.charCodeAt(i);h=Math.imul(h,16777619);} return (h>>>0).toString(36); }
function stampKey(uid) { return 'manjacheonhong-cloud-last-sync-' + uid; }
function lastSyncedHash() {try{return localStorage.getItem(stampKey(user.uid))}catch{return null}}
function remember(text) {try{localStorage.setItem(stampKey(user.uid), hash(text))}catch{}}
function hasEmptyBoard(raw) {
  if (!raw || raw.boards?.length !== 1 || Object.keys(raw.boards[0].positions||{}).length) return false;
  return raw.units?.every(u => !u.klass && !u.role && !u.customImage && (u.color==='gray'||u.color==='blue'));
}
function enableSync(sourceText) {
  onlineSync = true;
  decide.hidden = true;
  pending = false;
  if (sourceText) remember(sourceText);
  cloudReady();
  info('자동 동기화 중입니다. JSON 백업 기능도 계속 사용할 수 있어요.');
  updateButtons();
}
function applyRemote(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { info('클라우드 JSON을 해석하지 못했습니다.',true); return false; }
  processingRemote = true;
  try {
    if (!bridge.applyState(parsed)) {info('지원하지 않는 클라우드 백업 형식입니다.',true);return false;}
    remember(localJson());
    return true;
  } finally { processingRemote = false; }
}
function chooseData(text, title) {
  onlineSync = false;
  decide.hidden = false;
  byId('cloudDecisionTitle').textContent = title;
  byId('cloudDecisionText').textContent = text;
  cloudReady();
  updateButtons();
}
function firstSnapshot(snapshot) {
  initialRead = true;
  remoteJson = snapshot.exists() && typeof snapshot.data().backupJson === 'string' ? snapshot.data().backupJson : null;
  if (remoteJson === null) {
    chooseData('클라우드에 저장된 편성이 없어요. PC에서 기존 JSON을 복원한 뒤 ‘이 기기 편성 올리기’를 눌러 주세요.', '최초 클라우드 등록');
    return;
  }
  const now = localJson();
  const previous = lastSyncedHash();
  if (now === remoteJson) { enableSync(now); return; }
  if (hasEmptyBoard(bridge.getState()) || (previous && hash(now) === previous)) {
    if (applyRemote(remoteJson)) {enableSync(localJson());info('클라우드 편성을 불러왔습니다.');}
    return;
  }
  chooseData('이 기기의 편성과 클라우드 편성이 다릅니다. 어느 쪽을 사용할지 선택해 주세요. ‘클라우드 불러오기’는 이 기기의 편성을 교체하고, ‘이 기기 편성 올리기’는 클라우드 데이터를 덮어씁니다.', '저장 데이터 충돌 방지');
}
function incomingSnapshot(snapshot) {
  const next = snapshot.exists() && typeof snapshot.data().backupJson === 'string' ? snapshot.data().backupJson : null;
  if (!initialRead) { firstSnapshot(snapshot); return; }
  remoteJson = next;
  updateButtons();
  if (!onlineSync || !next) return;
  if (snapshot.data()?.updatedBy === session) return;
  if (next === localJson()) { remember(next); return; }
  if (pending || saving) {
    // Do not silently discard this device's unpublished edits.
    onlineSync = false;
    if (queueTimer) clearTimeout(queueTimer);
    chooseData('다른 기기에서도 수정했어요. 서로의 변경 내용을 확인한 뒤 적용할 데이터를 선택하세요.', '동시 편집 확인');
    return;
  }
  if (applyRemote(next)) { setStatus('다른 기기 변경 반영됨', 'good'); info('다른 기기에서 저장한 편성을 불러왔습니다.'); }
}
async function uploadNow(ask = false) {
  if (!user || !ref || !initialRead) return;
  if (ask && remoteJson !== null && !confirm('현재 기기의 전술판으로 클라우드 데이터를 덮어쓸까요?')) return;
  const payload = localJson();
  if (new TextEncoder().encode(payload).length > 700_000) { info('데이터가 클라우드 저장 한도를 초과했습니다. JSON 백업으로 보관해 주세요.',true);return; }
  if (queueTimer) clearTimeout(queueTimer);
  saving = true; updateButtons(); setStatus('클라우드 저장 중…');
  try {
    await setDoc(ref, {schemaVersion:'1.1.1',backupJson:payload,updatedAt:serverTimestamp(),updatedBy:session});
    remoteJson = payload;
    lastWriteJson = payload;
    enableSync(payload);
    setStatus('동기화 완료', 'good');
  } catch (e) {
    pending = true;
    setStatus('업로드 실패', 'bad');
    info(`클라우드 저장 실패: ${friendlyError(e)}\n로컬 데이터와 JSON 백업은 유지됩니다.`,true);
  } finally { saving=false; updateButtons(); }
}
function scheduleUpload() {
  if (!onlineSync || !user || !initialRead || processingRemote) return;
  pending = true;
  if (queueTimer) clearTimeout(queueTimer);
  setStatus('변경 사항 동기화 대기…');
  queueTimer = setTimeout(() => {
    if (!onlineSync || !pending || saving) return;
    pending = false;
    uploadNow();
  }, 850);
}
window.addEventListener('tactics-local-change', scheduleUpload);
function friendlyError(e) {
  const code = String(e?.code || '');
  const labels = {
    'auth/invalid-credential':'이메일 또는 비밀번호를 확인하세요.',
    'auth/invalid-email':'이메일 형식이 올바르지 않습니다.',
    'auth/too-many-requests':'로그인 요청이 많아 잠시 제한됐습니다.',
    'auth/operation-not-allowed':'Firebase Authentication에서 이메일/비밀번호 로그인을 활성화하세요.',
    'permission-denied':'Firestore 보안 규칙을 확인하세요.',
    'unavailable':'네트워크 연결 또는 Firestore 상태를 확인하세요.'
  };
  return labels[code] || (e?.message ? String(e.message).slice(0,180) : '연결을 확인하세요.');
}
loginButton.addEventListener('click', async () => {
  const email = byId('cloudEmail').value.trim();
  const password = byId('cloudPassword').value;
  if (!email || !password) { info('이메일과 비밀번호를 입력해 주세요.',true); return; }
  loginButton.disabled = true;
  setStatus('로그인 중…');
  try { await signInWithEmailAndPassword(auth,email,password); byId('cloudPassword').value=''; info('로그인했습니다. 클라우드 데이터를 확인합니다.'); }
  catch (e) { info('로그인 실패: '+friendlyError(e),true); setStatus('로그인 실패','bad'); }
  finally { loginButton.disabled = false; }
});
byId('cloudPassword').addEventListener('keydown',e=>{if(e.key==='Enter')loginButton.click()});
byId('cloudLogout').addEventListener('click',async()=>{try{await signOut(auth);info('로그아웃했습니다. 편성은 로컬에 남아 있습니다.')}catch(e){info(friendlyError(e),true)}});
downButton.addEventListener('click',()=>{
  if (!remoteJson) return;
  if (!hasEmptyBoard(bridge.getState()) && !confirm('클라우드 데이터를 불러와 이 기기의 유닛·전술판 배치를 교체할까요?\n먼저 JSON 백업을 만들어 두는 것을 권장합니다.')) return;
  if (applyRemote(remoteJson)) {enableSync(localJson());info('클라우드 편성을 이 기기로 불러왔습니다.');}
});
upButton.addEventListener('click',()=>uploadNow(true));

onAuthStateChanged(auth, nextUser => {
  if (unsubscribe) {unsubscribe();unsubscribe=null;}
  if (queueTimer) {clearTimeout(queueTimer);queueTimer=null;}
  user=nextUser;ref=null;initialRead=false;onlineSync=false;pending=false;remoteJson=null;saving=false;
  loginView.hidden=Boolean(user);
  signedView.hidden=!user;
  decide.hidden=true;
  if (!user) {setStatus('로그인 필요');updateButtons();return;}
  ref=doc(db,'users',user.uid,'appState','main');
  setStatus('클라우드 확인 중…'); updateButtons();
  unsubscribe=onSnapshot(ref,incomingSnapshot,e=>{
    setStatus('Firestore 연결 실패','bad');
    info('클라우드 접근 실패: '+friendlyError(e)+'\nFirestore 규칙과 데이터베이스 설정을 확인하세요.',true);
  });
});
setStatus('로그인 필요');
